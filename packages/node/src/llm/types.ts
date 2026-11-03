import type { ToolDefinition } from '@basebot/core';

export type LLMRole = 'user' | 'assistant' | 'tool' | 'system';

export interface LLMMessage {
  role: LLMRole;
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: LLMToolCall[];
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type LLMChunk =
  | { type: 'text_delta'; delta: string }
  | { type: 'tool_call'; toolCall: LLMToolCall }
  | { type: 'done' };

export interface LLMCompleteOptions {
  maxOutputTokens: number;
}

export interface LLMAdapter {
  completeStream(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    options: LLMCompleteOptions,
  ): AsyncIterable<LLMChunk>;
}

export type LLMProvider = 'openai' | 'gemini' | 'claude' | 'deepseek' | 'mock';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey?: string;
  model?: string;
  /** Mock-only: delay before first token in ms */
  mockTtftMs?: number;
  /** Mock-only: response text */
  mockResponse?: string;
  /** Mock-only: tool calls emitted on the first stream invocation only */
  mockToolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
}
