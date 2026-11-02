export type ToolFailurePolicy = 'fail' | 'retry' | 'empty_response';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** HTTP URL or in-process handler reference */
  handler: string | symbol;
  timeoutMs?: number;
  on_failure?: ToolFailurePolicy;
  empty_response_text?: string;
}

export interface ToolInvocationContext {
  user_id: string;
  thread_id: string;
  message_id: string;
  correlation_id: string;
}

export interface ToolInvocationRequest {
  arguments: Record<string, unknown>;
  context: ToolInvocationContext;
}

/** Maximum per-tool timeout in milliseconds. */
export const MAX_TOOL_TIMEOUT_MS = 30000;

/** Default per-tool timeout in milliseconds. */
export const DEFAULT_TOOL_TIMEOUT_MS = 10000;

/** Max retries when on_failure is 'retry'. */
export const TOOL_RETRY_MAX_ATTEMPTS = 2;

/** Retry backoff delays in milliseconds. */
export const TOOL_RETRY_BACKOFF_MS = [500, 1000] as const;
