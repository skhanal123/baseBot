import { describe, expect, it } from 'vitest';

import { parseSseBlock } from './stream.js';

describe('parseSseBlock', () => {
  it('parses event and data lines', () => {
    const parsed = parseSseBlock(
      'event: message.delta\ndata: {"message_id":"1","delta":"Hi"}',
    );
    expect(parsed).toEqual({
      event: 'message.delta',
      data: '{"message_id":"1","delta":"Hi"}',
    });
  });

  it('returns null when data is missing', () => {
    expect(parseSseBlock('event: ping')).toBeNull();
  });
});
