// Fixed-window rate limits in Postgres. Good enough for one region and modest
// traffic; swap for Upstash or the host's edge limits if it ever isn't.

import { HttpError } from './errors';
import type { Db } from './db';

export async function rateLimit(c: Db, key: string, limit: number, windowSeconds: number): Promise<void> {
  const r = await c.query(
    `insert into private.rate_limits (key, window_start, hits)
     values ($1, to_timestamp(floor(extract(epoch from now()) / $2) * $2), 1)
     on conflict (key, window_start) do update set hits = private.rate_limits.hits + 1
     returning hits`,
    [key, windowSeconds],
  );
  if (r.rows[0].hits > limit) throw new HttpError(429, 'rate_limited', 'Trop de requêtes. Réessaie dans un instant.');
}
