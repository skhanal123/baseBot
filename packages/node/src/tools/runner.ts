import {
  BaseBotError,
  DEFAULT_TOOL_TIMEOUT_MS,
  ErrorCode,
  MAX_TOOL_TIMEOUT_MS,
  TOOL_RETRY_BACKOFF_MS,
  TOOL_RETRY_MAX_ATTEMPTS,
  type ToolDefinition,
  type ToolFailurePolicy,
  type ToolInvocationContext,
  type ToolInvocationRequest,
} from '@basebot/core';

export type InProcessToolHandler = (
  request: ToolInvocationRequest,
) => Promise<unknown>;

export interface RegisteredTool {
  definition: ToolDefinition;
  inProcessHandler?: InProcessToolHandler;
}

export class ToolRunner {
  private readonly tools = new Map<string, RegisteredTool>();
  private readonly defaultTimeoutMs: number;

  constructor(defaultTimeoutMs = DEFAULT_TOOL_TIMEOUT_MS) {
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  register(definition: ToolDefinition, inProcessHandler?: InProcessToolHandler): void {
    const registered: RegisteredTool = { definition };
    if (inProcessHandler) {
      registered.inProcessHandler = inProcessHandler;
    }
    this.tools.set(definition.name, registered);
  }

  getDefinitions(): ToolDefinition[] {
    return [...this.tools.values()].map((t) => t.definition);
  }

  getDefinition(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  async invoke(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolInvocationContext,
    correlationId: string,
  ): Promise<string> {
    const registered = this.tools.get(toolName);
    if (!registered) {
      throw new BaseBotError(
        ErrorCode.INTERNAL_ERROR,
        `Tool not registered: ${toolName}`,
        correlationId,
      );
    }

    const { definition, inProcessHandler } = registered;
    const timeoutMs = Math.min(
      definition.timeoutMs ?? this.defaultTimeoutMs,
      MAX_TOOL_TIMEOUT_MS,
    );
    const policy: ToolFailurePolicy = definition.on_failure ?? 'fail';

    const request: ToolInvocationRequest = { arguments: args, context };

    const execute = async (): Promise<string> => {
      if (inProcessHandler) {
        const result = await inProcessHandler(request);
        return typeof result === 'string' ? result : JSON.stringify(result);
      }

      const handler = definition.handler;
      if (typeof handler !== 'string' || !handler.startsWith('http')) {
        throw new BaseBotError(
          ErrorCode.INTERNAL_ERROR,
          `Tool ${toolName} has no valid handler`,
          correlationId,
        );
      }

      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      try {
        const response = await fetch(handler, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${String(response.status)}`);
        }

        const body: unknown = await response.json();
        return typeof body === 'string' ? body : JSON.stringify(body);
      } finally {
        clearTimeout(timer);
      }
    };

    let lastError: Error | undefined;
    const maxAttempts = policy === 'retry' ? TOOL_RETRY_MAX_ATTEMPTS + 1 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await execute();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < maxAttempts - 1) {
          const backoff = TOOL_RETRY_BACKOFF_MS[attempt] ?? 1000;
          await new Promise((r) => setTimeout(r, backoff));
        }
      }
    }

    if (policy === 'empty_response') {
      return definition.empty_response_text ?? 'Tool unavailable.';
    }

    throw new BaseBotError(
      ErrorCode.INTERNAL_ERROR,
      `Tool ${toolName} failed: ${lastError?.message ?? 'unknown error'}`,
      correlationId,
    );
  }
}
