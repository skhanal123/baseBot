import type { LLMAdapter, LLMConfig } from './types.js';
import { ClaudeAdapter } from './claude-adapter.js';
import { DeepSeekAdapter } from './deepseek-adapter.js';
import { GeminiAdapter } from './gemini-adapter.js';
import { MockLLMAdapter } from './mock-adapter.js';
import { OpenAIAdapter } from './openai-adapter.js';

export function createLLMAdapter(config: LLMConfig): LLMAdapter {
  switch (config.provider) {
    case 'mock': {
      const mockOptions: {
        ttftMs?: number;
        response?: string;
        toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
      } = {};
      if (config.mockTtftMs !== undefined) {
        mockOptions.ttftMs = config.mockTtftMs;
      }
      if (config.mockResponse !== undefined) {
        mockOptions.response = config.mockResponse;
      }
      if (config.mockToolCalls !== undefined) {
        mockOptions.toolCalls = config.mockToolCalls;
      }
      return new MockLLMAdapter(mockOptions);
    }
    case 'openai': {
      const apiKey = config.apiKey?.trim();
      if (!apiKey) {
        throw new Error('OpenAI adapter requires apiKey in LLM config');
      }
      return new OpenAIAdapter(apiKey, config.model);
    }
    case 'gemini': {
      const apiKey = config.apiKey?.trim();
      if (!apiKey) {
        throw new Error('Gemini adapter requires apiKey in LLM config');
      }
      return new GeminiAdapter(apiKey, config.model);
    }
    case 'claude': {
      const apiKey = config.apiKey?.trim();
      if (!apiKey) {
        throw new Error('Claude adapter requires apiKey in LLM config');
      }
      return new ClaudeAdapter(apiKey, config.model);
    }
    case 'deepseek': {
      const apiKey = config.apiKey?.trim();
      if (!apiKey) {
        throw new Error('DeepSeek adapter requires apiKey in LLM config');
      }
      return new DeepSeekAdapter(apiKey, config.model);
    }
    default:
      throw new Error(`Unsupported LLM provider: ${String(config.provider)}`);
  }
}
