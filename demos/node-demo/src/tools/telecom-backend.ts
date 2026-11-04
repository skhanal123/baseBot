import type { Db } from 'mongodb';
import type { Pool } from 'pg';

export interface TelecomToolBackend {
  kind: 'postgres' | 'mongo';
  pool?: Pool;
  mongoDb?: Db;
  openaiApiKey: string;
  embeddingModel?: string;
  serperApiKey?: string;
}
