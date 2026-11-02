import type { HookHandler } from '@basebot/core';

const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
const PHONE_PATTERN = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;

export function redactPii(text: string): string {
  return text
    .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]')
    .replace(PHONE_PATTERN, '[REDACTED_PHONE]')
    .replace(SSN_PATTERN, '[REDACTED_SSN]');
}

/** Example hook — copy and customize for production PII policies. */
export function createPiiRedactionHook(): HookHandler<'after_assistant_complete'> {
  return ({ content }) => ({
    allowed: true,
    content: redactPii(content),
  });
}
