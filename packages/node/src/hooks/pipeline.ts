import {
  PASS_THROUGH_HOOK_RESULT,
  type HookPoint,
  type HookRegistry,
  type HookResult,
} from '@basebot/core';

import { createBlocklistHook } from './examples/blocklist.js';
import { createPiiRedactionHook } from './examples/pii-redaction.js';

export class HookPipeline {
  private hooks: HookRegistry;
  private readonly enablePiiRedaction: boolean;
  private readonly enableContentModeration: boolean;

  constructor(
    hooks: HookRegistry = {},
    options: { enablePiiRedaction?: boolean; enableContentModeration?: boolean } = {},
  ) {
    this.hooks = hooks;
    this.enablePiiRedaction = options.enablePiiRedaction ?? false;
    this.enableContentModeration = options.enableContentModeration ?? false;
  }

  setHooks(hooks: HookRegistry): void {
    this.hooks = { ...this.hooks, ...hooks };
  }

  async run<P extends HookPoint>(
    point: P,
    payload: Parameters<NonNullable<HookRegistry[P]>>[0],
    contentField: 'content' | null = 'content',
  ): Promise<HookResult> {
    const custom = this.hooks[point];
    if (custom) {
      return custom(payload as never);
    }

    if (point === 'after_assistant_complete' && contentField === 'content') {
      if (this.enablePiiRedaction) {
        const pii = createPiiRedactionHook();
        const piiResult = await pii(payload as never);
        if (!piiResult.allowed) {
          return piiResult;
        }
        if (this.enableContentModeration) {
          const blocklist = createBlocklistHook();
          return blocklist({ ...(payload as object), content: piiResult.content } as never);
        }
        return piiResult;
      }
      if (this.enableContentModeration) {
        const blocklist = createBlocklistHook();
        return blocklist(payload as never);
      }
    }

    const content =
      contentField === 'content' ? (payload as { content: string }).content : '';
    return PASS_THROUGH_HOOK_RESULT(content);
  }
}
