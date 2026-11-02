import type { Message } from '@basebot/core';
import { describe, expect, it } from 'vitest';

import { messagesToLLM } from './worker.js';

describe('messagesToLLM', () => {
  it('inserts assistant tool_calls before each tool message', () => {
    const messages: Message[] = [
      {
        id: '1',
        thread_id: 't1',
        user_id: 'u1',
        role: 'user',
        content: '123',
        timestamp: new Date(),
        metadata: {},
      },
      {
        id: '2',
        thread_id: 't1',
        user_id: 'u1',
        role: 'tool',
        content: '{"status":"shipped"}',
        timestamp: new Date(),
        metadata: {
          tool_call_id: 'call_1',
          tool_name: 'get_order_status',
          assistant_content: '',
          tool_call_arguments: { order_id: '123' },
        },
      },
      {
        id: '3',
        thread_id: 't1',
        user_id: 'u1',
        role: 'assistant',
        content: 'Your order has shipped.',
        timestamp: new Date(),
        metadata: {},
      },
    ];

    const llm = messagesToLLM(messages);

    expect(llm).toHaveLength(4);
    expect(llm[0]).toMatchObject({
      role: 'user',
      content: '123',
    });
    expect(llm[1]).toMatchObject({
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'call_1', name: 'get_order_status', arguments: { order_id: '123' } }],
    });
    expect(llm[2]).toMatchObject({
      role: 'tool',
      tool_call_id: 'call_1',
      name: 'get_order_status',
    });
    expect(llm[3]).toMatchObject({
      role: 'assistant',
      content: 'Your order has shipped.',
    });
  });
});
