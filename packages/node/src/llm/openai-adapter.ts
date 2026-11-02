import type { ToolDefinition } from '@basebot/core';
import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

import type { LLMAdapter, LLMChunk, LLMCompleteOptions, LLMMessage } from './types.js';

function toOpenAiMessage(message: LLMMessage): ChatCompletionMessageParam {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      content: message.content,
      tool_call_id: message.tool_call_id ?? '',
    };
  }
  if (message.role === 'assistant' && message.tool_calls && message.tool_calls.length > 0) {
    return {
      role: 'assistant',
      content: message.content || null,
      tool_calls: message.tool_calls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      })),
    };
  }
  return {
    role: message.role,
    content: message.content,
  };
}

export class OpenAIAdapter implements LLMAdapter {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model = 'gpt-4o-mini') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async *completeStream(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    options: LLMCompleteOptions,
  ): AsyncIterable<LLMChunk> {
    const openAiTools = tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      model: this.model,
      messages: messages.map(toOpenAiMessage),
      max_tokens: options.maxOutputTokens,
      stream: true,
    };
    if (openAiTools.length > 0) {
      params.tools = openAiTools;
    }

    const stream = await this.client.chat.completions.create(params);

    const pendingToolCalls = new Map<
      number, 
      { id: string; name: string; arguments: string }
    >();

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) {
        continue;
      }

      const delta = choice.delta;
      if (delta.content) {
        yield { type: 'text_delta', delta: delta.content };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          let entry = pendingToolCalls.get(idx);
          if (!entry) {
            entry = {
              id: tc.id ?? `call_${String(idx)}`,
              name: tc.function?.name ?? '',
              arguments: '',
            };
            pendingToolCalls.set(idx, entry);
          }
          if (tc.id) {
            entry.id = tc.id;
          }
          if (tc.function?.name) {
            entry.name = tc.function.name;
          }
          if (tc.function?.arguments) {
            entry.arguments += tc.function.arguments;
          }
        }
      }

      if (choice.finish_reason === 'tool_calls') {
        for (const entry of pendingToolCalls.values()) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(entry.arguments || '{}') as Record<string, unknown>;
          } catch {
            args = {};
          }
          yield {
            type: 'tool_call',
            toolCall: { id: entry.id, name: entry.name, arguments: args },
          };
        }
        return;
      }

      if (choice.finish_reason === 'stop') {
        yield { type: 'done' };
        return;
      }
    }

    yield { type: 'done' };
  }
}
