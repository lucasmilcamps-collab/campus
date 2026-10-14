import pg from 'pg';
import { env } from './env';

// Dates stay "YYYY-MM-DD" strings (they are runner-local calendar days, never
// shifted by a time zone); numerics come back as numbers.
pg.types.setTypeParser(1082, (v: string) => v);
pg.types.setTypeParser(1700, (v: string) => Number(v));
pg.types.setTypeParser(20, (v: string) => Number(v));

export type Db = pg.PoolClient | pg.Pool;

let pool: pg.Pool | null = null;
export function db(): pg.Pool {
  if (!pool) pool = new pg.Pool({ connectionString: env().DATABASE_URL, max: 5 });
  return pool;
}

export async function closeDb() {
  await pool?.end();
  pool = null;
}

/** Runs fn in a transaction; rolls back on any throw. */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await db().connect();
  try {
    await c.query('begin');
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback');
    throw e;
  } finally {
    c.release();
  }
}

export async function one<T = Record<string, unknown>>(c: Db, sql: string, params: unknown[] = []): Promise<T | null> {
  const r = await c.query(sql, params);
  return (r.rows[0] as T) ?? null;
}

export async function many<T = Record<string, unknown>>(c: Db, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await c.query(sql, params)).rows as T[];
}
