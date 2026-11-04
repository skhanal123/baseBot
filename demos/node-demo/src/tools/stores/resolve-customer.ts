import type { Db } from 'mongodb';
import type { Pool } from 'pg';

export async function resolveCustomerIdForUserPostgres(
  pool: Pool,
  user_id: string,
): Promise<string | null> {
  const result = await pool.query<{ customer_id: string }>(
    `SELECT customer_id FROM demo_user_customer_map WHERE user_id = $1 LIMIT 1`,
    [user_id],
  );
  return result.rows[0]?.customer_id ?? null;
}

export async function resolveCustomerIdForUserMongo(
  db: Db,
  user_id: string,
): Promise<string | null> {
  const doc = await db.collection('demo_user_customer_map').findOne<{ customer_id: string }>({
    user_id,
  });
  return doc?.customer_id ?? null;
}
