import type { LLMConfig } from './types.js';

export interface ResolveLlmConfigFromEnvOptions {
  /** Default OpenAI model when OPENAI_API_KEY is set and OPENAI_MODEL is unset. */
  defaultOpenAiModel?: string;
  /** Mock provider response when no real provider credentials are configured. */
  mockResponse?: string;
  /** Env source; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
}

function optionalModel(envValue: string | undefined): Pick<LLMConfig, 'model'> {
  return envValue ? { model: envValue } : {};
}

/**
 * App-layer helper: maps env vars to {@link LLMConfig} (includes `apiKey` when using a live provider).
 * Not used by the framework — call from your bootstrap and pass the result to `createServer({ llm })`.
 */
export function resolveLlmConfigFromEnv(
  options: ResolveLlmConfigFromEnvOptions = {},
): LLMConfig {
  const env = options.env ?? process.env;
  const defaultOpenAiModel = options.defaultOpenAiModel ?? 'gpt-4o-mini';
  const mockResponse =
    options.mockResponse ??
    'baseBot — set OPENAI_API_KEY or LLM_PROVIDER with the matching API key.';

  const provider = env.LLM_PROVIDER?.trim().toLowerCase();

  if (provider === 'gemini') {
    const apiKey = env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('LLM_PROVIDER=gemini requires GEMINI_API_KEY');
    }
    return { provider: 'gemini', apiKey, ...optionalModel(env.GEMINI_MODEL) };
  }
  if (provider === 'claude') {
    const apiKey = env.ANTHROPIC_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('LLM_PROVIDER=claude requires ANTHROPIC_API_KEY');
    }
    return { provider: 'claude', apiKey, ...optionalModel(env.ANTHROPIC_MODEL) };
  }
  if (provider === 'deepseek') {
    const apiKey = env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('LLM_PROVIDER=deepseek requires DEEPSEEK_API_KEY');
    }
    return { provider: 'deepseek', apiKey, ...optionalModel(env.DEEPSEEK_MODEL) };
  }
  if (provider === 'openai') {
    const apiKey = env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error('LLM_PROVIDER=openai requires OPENAI_API_KEY');
    }
    return { provider: 'openai', apiKey, model: env.OPENAI_MODEL ?? defaultOpenAiModel };
  }
  if (provider === 'mock') {
    return { provider: 'mock', mockResponse };
  }
  if (provider) {
    throw new Error(`Unknown LLM_PROVIDER "${provider}"`);
  }
  const openAiKey = env.OPENAI_API_KEY?.trim();
  if (openAiKey) {
    return { provider: 'openai', apiKey: openAiKey, model: env.OPENAI_MODEL ?? defaultOpenAiModel };
  }
  return { provider: 'mock', mockResponse };
}
