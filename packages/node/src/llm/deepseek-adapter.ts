import type OpenAI from 'openai';

import { OpenAIAdapter } from './openai-adapter.js';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

export class DeepSeekAdapter extends OpenAIAdapter {
  constructor(apiKey: string, model = 'deepseek-chat', client?: OpenAI) {
    super(apiKey, model, DEEPSEEK_BASE_URL, client);
  }
}
