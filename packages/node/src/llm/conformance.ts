import type { ToolDefinition } from '@basebot/core';

import type { LLMAdapter, LLMChunk, LLMCompleteOptions, LLMMessage } from './types.js';

const DEFAULT_USER_MESSAGE: LLMMessage[] = [{ role: 'user', content: 'Say hello briefly.' }];

const DEFAULT_OPTIONS: LLMCompleteOptions = { maxOutputTokens: 256 };

export async function collectLLMChunks(
  adapter: LLMAdapter,
  messages: LLMMessage[] = DEFAULT_USER_MESSAGE,
  tools: ToolDefinition[] = [],
  options: LLMCompleteOptions = DEFAULT_OPTIONS,
): Promise<LLMChunk[]> {
  const chunks: LLMChunk[] = [];
  for await (const chunk of adapter.completeStream(messages, tools, options)) {
    chunks.push(chunk);
  }
  return chunks;
}

export interface ConformanceResult {
  streamingText: boolean;
  toolCall: boolean;
  errors: string[];
}

/**
 * Provider conformance checks aligned with the OpenAI adapter baseline:
 * streaming text deltas, terminal tool_call or done, and tool invocation shape.
 */
export async function runProviderConformance(
  adapter: LLMAdapter,
  sampleTool: ToolDefinition,
): Promise<ConformanceResult> {
  const errors: string[] = [];

  const textChunks = await collectLLMChunks(adapter);
  const textDeltas = textChunks.filter((c) => c.type === 'text_delta');
  const textTerminal =
    textChunks.some((c) => c.type === 'done') || textChunks.some((c) => c.type === 'tool_call');

  if (textDeltas.length === 0) {
    errors.push('expected at least one text_delta chunk');
  }
  if (!textTerminal) {
    errors.push('expected done or tool_call to terminate the stream');
  }

  const toolChunks = await collectLLMChunks(
    adapter,
    [{ role: 'user', content: `Use the ${sampleTool.name} tool.` }],
    [sampleTool],
  );
  const toolCall = toolChunks.find((c) => c.type === 'tool_call');
  if (!toolCall || toolCall.type !== 'tool_call') {
    errors.push('expected a tool_call chunk when tools are provided');
  } else {
    if (!toolCall.toolCall.id) {
      errors.push('tool_call missing id');
    }
    if (toolCall.toolCall.name !== sampleTool.name) {
      errors.push(`tool_call name mismatch: ${toolCall.toolCall.name}`);
    }
  }

  return {
    streamingText: textDeltas.length > 0 && textTerminal,
    toolCall: Boolean(toolCall && toolCall.type === 'tool_call'),
    errors,
  };
}
