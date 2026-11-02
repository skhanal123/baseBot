import { describe, expect, it } from 'vitest';

import { createBlocklistHook } from './examples/blocklist.js';
import { redactPii } from './examples/pii-redaction.js';
import { HookPipeline } from './pipeline.js';

describe('HookPipeline', () => {
  it('passes through by default', async () => {
    const pipeline = new HookPipeline();
    const result = await pipeline.run('before_user_message', {
      user_id: 'u1',
      thread_id: 't1',
      content: 'hello',
      correlation_id: 'c1',
    });
    expect(result).toEqual({ allowed: true, content: 'hello' });
  });

  it('runs custom hook when registered', async () => {
    const pipeline = new HookPipeline({
      before_user_message: ({ content }) => ({
        allowed: true,
        content: content.toUpperCase(),
      }),
    });
    const result = await pipeline.run('before_user_message', {
      user_id: 'u1',
      thread_id: 't1',
      content: 'hello',
      correlation_id: 'c1',
    });
    expect(result.content).toBe('HELLO');
  });

  it('rejects via example blocklist', async () => {
    const blocklist = createBlocklistHook(['forbidden']);
    const result = await blocklist({
      user_id: 'u1',
      thread_id: 't1',
      message_id: 'm1',
      correlation_id: 'c1',
      content: 'This is forbidden text',
    });
    expect(result.allowed).toBe(false);
  });

  it('redacts PII in example hook', () => {
    const redacted = redactPii('Contact me at test@example.com or 555-123-4567');
    expect(redacted).not.toContain('test@example.com');
    expect(redacted).toContain('[REDACTED_EMAIL]');
  });
});
