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
      const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error('OpenAI API key required: set OPENAI_API_KEY or pass apiKey in configureLLM');
      }
      return new OpenAIAdapter(apiKey, config.model);
    }
    case 'gemini': {
      const apiKey = config.apiKey ?? process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Gemini API key required: set GEMINI_API_KEY or pass apiKey in configureLLM');
      }
      return new GeminiAdapter(apiKey, config.model);
    }
    case 'claude': {
      const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error(
          'Claude API key required: set ANTHROPIC_API_KEY or pass apiKey in configureLLM',
        );
      }
      return new ClaudeAdapter(apiKey, config.model);
    }
    case 'deepseek': {
      const apiKey = config.apiKey ?? process.env.DEEPSEEK_API_KEY;
      if (!apiKey) {
        throw new Error(
          'DeepSeek API key required: set DEEPSEEK_API_KEY or pass apiKey in configureLLM',
        );
      }
      return new DeepSeekAdapter(apiKey, config.model);
    }
    default:
      throw new Error(`Unsupported LLM provider: ${String(config.provider)}`);
  }
}
