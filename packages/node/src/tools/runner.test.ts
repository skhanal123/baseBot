import { describe, expect, it } from 'vitest';

import { ToolRunner } from './runner.js';

describe('ToolRunner', () => {
  it('invokes in-process handler with context', async () => {
    const runner = new ToolRunner();
    let receivedContext: Record<string, string> | null = null;

    runner.register(
      {
        name: 'echo',
        description: 'Echo tool',
        parameters: { type: 'object', properties: {} },
        handler: 'inprocess:echo',
      },
      (req) => {
        receivedContext = req.context as unknown as Record<string, string>;
        const text = req.arguments.text;
        const textValue = typeof text === 'string' ? text : '';
        return Promise.resolve(`echo:${textValue}`);
      },
    );

    const result = await runner.invoke(
      'echo',
      { text: 'hi' },
      {
        user_id: 'usr_1',
        thread_id: 'thr_1',
        message_id: 'msg_1',
        correlation_id: 'corr_1',
      },
      'corr_1',
    );

    expect(result).toBe('echo:hi');
    expect(receivedContext).toMatchObject({
      user_id: 'usr_1',
      thread_id: 'thr_1',
      message_id: 'msg_1',
      correlation_id: 'corr_1',
    });
  });

  it('uses empty_response policy on failure', async () => {
    const runner = new ToolRunner();
    runner.register(
      {
        name: 'failing',
        description: 'Always fails',
        parameters: { type: 'object', properties: {} },
        handler: 'inprocess:failing',
        on_failure: 'empty_response',
        empty_response_text: 'no data',
      },
      () => Promise.reject(new Error('tool failed')),
    );

    const result = await runner.invoke(
      'failing',
      {},
      {
        user_id: 'u',
        thread_id: 't',
        message_id: 'm',
        correlation_id: 'c',
      },
      'c',
    );

    expect(result).toBe('no data');
  });
});
