import type { HookHandler } from '@basebot/core';

const DEFAULT_BLOCKLIST = ['password', 'credit card', 'ssn'];

/** Example hook — copy and customize for production moderation. */
export function createBlocklistHook(
  blocklist: string[] = DEFAULT_BLOCKLIST,
): HookHandler<'after_assistant_complete'> {
  return ({ content }) => {
    const lower = content.toLowerCase();
    const match = blocklist.find((term) => lower.includes(term));
    if (match) {
      return {
        allowed: false,
        content,
        reason: `Blocked term: ${match}`,
      };
    }
    return { allowed: true, content };
  };
}
