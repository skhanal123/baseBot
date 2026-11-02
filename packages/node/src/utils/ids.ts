import { randomUUID } from 'node:crypto';

export function newJobId(): string {
  return `job_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function newMessageId(): string {
  return randomUUID();
}
