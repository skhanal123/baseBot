import { randomUUID } from 'node:crypto';

export function resolveCorrelationId(header?: string | string[]): string {
  if (typeof header === 'string' && header.length > 0) {
    return header;
  }
  if (Array.isArray(header) && header[0] && header[0].length > 0) {
    return header[0];
  }
  return `corr_${randomUUID()}`;
}
