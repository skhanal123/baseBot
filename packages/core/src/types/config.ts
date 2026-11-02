export interface BaseBotConfig {
  queue: {
    /** Max concurrent worker jobs. Default: 20 */
    concurrency: number;
    /** Return 202 for all message ingests. Default: true */
    alwaysAsync: boolean;
  };
  cache: {
    /** Messages kept in Redis per thread. Default: 8 */
    messageLimit: number;
    /** Sliding TTL on cache refresh in seconds. Default: 86400 (24h) */
    ttlSeconds: number;
  };
  llm: {
    /** Per-turn output cap. Default: 1024 */
    maxOutputTokens: number;
  };
  tools: {
    /** Per-tool timeout default in ms. Default: 10000 */
    defaultTimeoutMs: number;
  };
  logging: {
    /** Production default: false */
    logMessageContent: boolean;
  };
  /** Persist assistant text on mid-stream disconnect. Default: false */
  persistPartial: boolean;
  validation: {
    /** Max user message content size in bytes. Default: 32768 */
    maxMessageContentBytes: number;
  };
  stream: {
    /** Signed stream token lifetime in seconds. Default: 900 */
    tokenTtlSeconds: number;
  };
  hooks: {
    enablePiiRedaction: boolean;
    enableContentModeration: boolean;
  };
}

export const DEFAULT_CONFIG: BaseBotConfig = {
  queue: {
    concurrency: 20,
    alwaysAsync: true,
  },
  cache: {
    messageLimit: 8,
    ttlSeconds: 86400,
  },
  llm: {
    maxOutputTokens: 1024,
  },
  tools: {
    defaultTimeoutMs: 10000,
  },
  logging: {
    logMessageContent: false,
  },
  persistPartial: false,
  validation: {
    maxMessageContentBytes: 32768,
  },
  stream: {
    tokenTtlSeconds: 900,
  },
  hooks: {
    enablePiiRedaction: false,
    enableContentModeration: false,
  },
};

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export function mergeConfig(partial?: DeepPartial<BaseBotConfig>): BaseBotConfig {
  if (!partial) {
    return { ...DEFAULT_CONFIG };
  }
  return {
    queue: { ...DEFAULT_CONFIG.queue, ...partial.queue },
    cache: { ...DEFAULT_CONFIG.cache, ...partial.cache },
    llm: { ...DEFAULT_CONFIG.llm, ...partial.llm },
    tools: { ...DEFAULT_CONFIG.tools, ...partial.tools },
    logging: { ...DEFAULT_CONFIG.logging, ...partial.logging },
    persistPartial: partial.persistPartial ?? DEFAULT_CONFIG.persistPartial,
    validation: { ...DEFAULT_CONFIG.validation, ...partial.validation },
    stream: { ...DEFAULT_CONFIG.stream, ...partial.stream },
    hooks: { ...DEFAULT_CONFIG.hooks, ...partial.hooks },
  };
}
