import type { ToolDefinition } from '@basebot/core';

import type { LLMAdapter, LLMChunk, LLMCompleteOptions, LLMMessage } from './types.js';

export interface MockLLMAdapterOptions {
  ttftMs?: number;
  response?: string;
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
}

export class MockLLMAdapter implements LLMAdapter {
  private readonly ttftMs: number;
  private readonly response: string;
  private readonly toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>;
  private toolCallStreamsRemaining: number;

  constructor(options: MockLLMAdapterOptions = {}) {
    this.ttftMs = options.ttftMs ?? 200;
    this.response = options.response ?? 'This is a mock assistant response.';
    this.toolCalls = options.toolCalls ?? [];
    this.toolCallStreamsRemaining = this.toolCalls.length > 0 ? 1 : 0;
  }

  async *completeStream(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    options: LLMCompleteOptions,
  ): AsyncIterable<LLMChunk> {
    void messages;
    void options;
    await new Promise((resolve) => setTimeout(resolve, this.ttftMs));

    const shouldEmitToolCalls =
      tools.length > 0 && this.toolCallStreamsRemaining > 0 && this.toolCalls.length > 0;
    if (shouldEmitToolCalls) {
      this.toolCallStreamsRemaining -= 1;
    }

    for (const tc of shouldEmitToolCalls ? this.toolCalls : []) {
      yield {
        type: 'tool_call',
        toolCall: {
          id: `call_${tc.name}`,
          name: tc.name,
          arguments: tc.arguments,
        },
      };
      return;
    }

    const words = this.response.split(' ');
    for (const word of words) {
      yield { type: 'text_delta', delta: `${word} ` };
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    yield { type: 'done' };
  }
}
