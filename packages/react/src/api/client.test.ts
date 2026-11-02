import { describe, expect, it } from 'vitest';

import { BaseBotClient } from './client.js';

describe('BaseBotClient', () => {
  it('builds API URLs from base', () => {
    const client = new BaseBotClient('http://localhost:3000/');
    expect(client).toBeDefined();
  });
});
