import {
  mergeConfig,
  type BaseBotConfig,
  type DeepPartial,
  type DurableStoreAdapter,
  type HookRegistry,
  type MessageCacheAdapter,
} from '@basebot/core';
import type { Redis } from 'ioredis';

import { ContextManager } from './context/context-manager.js';
import { HookPipeline } from './hooks/pipeline.js';
import { createLLMAdapter } from './llm/factory.js';
import type { LLMAdapter, LLMConfig } from './llm/types.js';
import { StreamEmitter } from './stream/stream-emitter.js';
import { ToolRunner } from './tools/runner.js';

export interface BaseBotRuntimeOptions {
  store: DurableStoreAdapter;
  cache: MessageCacheAdapter;
  redis: Redis;
  config?: DeepPartial<BaseBotConfig>;
  streamSigningSecret: string;
}

export class BaseBotRuntime {
  readonly store: DurableStoreAdapter;
  readonly cache: MessageCacheAdapter;
  readonly redis: Redis;
  readonly config: BaseBotConfig;
  readonly streamSigningSecret: string;
  readonly hookPipeline: HookPipeline;
  readonly contextManager: ContextManager;
  readonly streamEmitter: StreamEmitter;
  readonly toolRunner: ToolRunner;
  private llmAdapter: LLMAdapter | null = null;

  constructor(options: BaseBotRuntimeOptions) {
    this.store = options.store;
    this.cache = options.cache;
    this.redis = options.redis;
    this.config = mergeConfig(options.config);
    this.streamSigningSecret = options.streamSigningSecret;
    this.hookPipeline = new HookPipeline({}, {
      enablePiiRedaction: this.config.hooks.enablePiiRedaction,
      enableContentModeration: this.config.hooks.enableContentModeration,
    });
    this.contextManager = new ContextManager({
      store: this.store,
      cache: this.cache,
      messageLimit: this.config.cache.messageLimit,
    });
    this.streamEmitter = new StreamEmitter(this.redis);
    this.toolRunner = new ToolRunner(this.config.tools.defaultTimeoutMs);
  }

  configureLLM(config: LLMConfig): void {
    this.llmAdapter = createLLMAdapter(config);
  }

  getLLMAdapter(): LLMAdapter {
    if (!this.llmAdapter) {
      const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
      this.llmAdapter = createLLMAdapter({
        provider: hasOpenAiKey ? 'openai' : 'mock',
      });
    }
    return this.llmAdapter;
  }

  registerHooks(hooks: HookRegistry): void {
    this.hookPipeline.setHooks(hooks);
  }

  async close(): Promise<void> {
    await this.streamEmitter.close();
  }
}
