import { describe, expect, it } from 'vitest';

import { runDbQueryTool } from './db-query.js';
import { requireToolScope } from './scoping.js';
import type { TelecomDbStore } from './stores/telecom-db-store.js';

describe('requireToolScope (US-8 / US-17)', () => {
  it('returns trimmed user_id and thread_id from framework context', () => {
    expect(
      requireToolScope({
        user_id: ' usr_a ',
        thread_id: ' thr_1 ',
        message_id: 'msg',
        correlation_id: 'corr',
      }),
    ).toEqual({ user_id: 'usr_a', thread_id: 'thr_1' });
  });

  it('throws when user_id or thread_id is missing', () => {
    expect(() =>
      requireToolScope({
        user_id: '',
        thread_id: 'thr',
        message_id: 'm',
        correlation_id: 'c',
      }),
    ).toThrow(/user_id/);
  });
});

describe('runDbQueryTool scoping', () => {
  it('passes injected user_id and thread_id to the store', async () => {
    const calls: Array<{ user_id: string; thread_id: string }> = [];
    const store: TelecomDbStore = {
      query: async (user_id, thread_id) => {
        calls.push({ user_id, thread_id });
        return { ok: true };
      },
    };

    await runDbQueryTool(
      {
        arguments: { entity: 'plans' },
        context: {
          user_id: 'usr_browser_demo',
          thread_id: '550e8400-e29b-41d4-a716-446655440000',
          message_id: 'msg_1',
          correlation_id: 'corr_1',
        },
      },
      store,
    );

    expect(calls).toEqual([
      {
        user_id: 'usr_browser_demo',
        thread_id: '550e8400-e29b-41d4-a716-446655440000',
      },
    ]);
  });
});
