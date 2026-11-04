import { describe, expect, it } from 'vitest';

import { loadDemoConfig } from './load-demo-config.js';

const baseEnv: NodeJS.ProcessEnv = {
  DURABLE_STORE: 'postgres',
  DATABASE_URL: 'postgres://localhost/basebot',
  MONGODB_URL: 'mongodb://localhost/basebot',
  REDIS_URL: 'redis://localhost:6379',
  STREAM_SIGNING_SECRET: 'secret',
  OPENAI_API_KEY: 'sk-demo',
};

describe('loadDemoConfig', () => {
  it('throws when a required variable is missing', () => {
    expect(() => loadDemoConfig({ ...baseEnv, REDIS_URL: '' })).toThrow(/REDIS_URL/);
  });

  it('returns llm and stream secret for createServer', () => {
    const config = loadDemoConfig(baseEnv);
    expect(config.streamSigningSecret).toBe('secret');
    expect(config.llm.provider).toBe('openai');
    expect(config.llm.apiKey).toBe('sk-demo');
  });
});
