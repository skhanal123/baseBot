import { readFileSync } from 'node:fs';
import TOML from '@iarna/toml';

export interface TelecomSeedData {
  plans: Record<string, unknown>[];
  devices: Record<string, unknown>[];
  lines: Record<string, unknown>[];
  customers: Record<string, unknown>[];
  bills: Record<string, unknown>[];
}

export function parseDbTomlFile(path: string): TelecomSeedData {
  const raw = readFileSync(path, 'utf8');
  const parsed = TOML.parse(raw) as Record<string, unknown>;
  return {
    plans: asArray(parsed.plans),
    devices: asArray(parsed.devices),
    lines: asArray(parsed.lines),
    customers: asArray(parsed.customers),
    bills: asArray(parsed.bills),
  };
}

function asArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((row): row is Record<string, unknown> => typeof row === 'object' && row !== null);
}
