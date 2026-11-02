import type { PoolClient, QueryResult, QueryResultRow } from 'pg';

/** Minimal pg pool surface used by baseBot Postgres adapters. */
export interface PgPool {
  connect(): Promise<PoolClient>;
  query<R extends QueryResultRow = QueryResultRow>(
    queryText: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<R>>;
}
