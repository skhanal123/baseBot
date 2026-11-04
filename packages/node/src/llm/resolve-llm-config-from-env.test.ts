import { afterEach, describe, expect, it } from 'vitest';

import { resolveLlmConfigFromEnv } from './resolve-llm-config-from-env.js';

describe('resolveLlmConfigFromEnv', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('defaults to mock when no provider or OpenAI key', () => {
    const config = resolveLlmConfigFromEnv({ env: {}, mockResponse: 'demo mock' });
    expect(config).toEqual({ provider: 'mock', mockResponse: 'demo mock' });
  });

  it('infers openai from OPENAI_API_KEY', () => {
    const config = resolveLlmConfigFromEnv({
      env: { OPENAI_API_KEY: 'sk-test' },
    });
    expect(config).toEqual({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o-mini' });
  });

  it('honors explicit LLM_PROVIDER=gemini', () => {
    const config = resolveLlmConfigFromEnv({
      env: { LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'g-key', GEMINI_MODEL: 'gemini-2.0' },
    });
    expect(config).toEqual({ provider: 'gemini', apiKey: 'g-key', model: 'gemini-2.0' });
  });

  it('throws when provider env requires missing API key', () => {
    expect(() =>
      resolveLlmConfigFromEnv({ env: { LLM_PROVIDER: 'claude' } }),
    ).toThrow(/ANTHROPIC_API_KEY/);
  });
});
