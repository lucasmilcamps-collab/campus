// Background work: a Postgres-backed queue (private.jobs) with retries,
// exponential backoff and a dead-letter state, drained by a cron route.
// Times are UTC; "today" for a runner is computed in their own zone.

import type pg from 'pg';
import { db, many, one, tx } from './db';
import { send, trialEndingEmail } from './email';
import { http } from './http';
import { sweep, todayIn, type Ctx } from './service';

export interface EnqueueOpts {
  dedupeKey?: string;
  runAt?: Date;
  maxAttempts?: number;
}

export async function enqueue(c: pg.PoolClient | pg.Pool, kind: string, payload: Record<string, unknown>, o: EnqueueOpts = {}): Promise<void> {
  await c.query(
    `insert into private.jobs (kind, payload, dedupe_key, run_at, max_attempts) values ($1, $2, $3, $4, $5)
     on conflict (kind, dedupe_key) where dedupe_key is not null do nothing`,
    [kind, JSON.stringify(payload), o.dedupeKey ?? null, o.runAt ?? new Date(), o.maxAttempts ?? 5],
  );
}

type Handler = (c: pg.PoolClient, payload: Record<string, string>) => Promise<void>;
const handlers: Record<string, Handler> = {};
export function onJob(kind: string, h: Handler) {
  handlers[kind] = h;
}

/** Claims due jobs, runs each in its own transaction. Returns counts. */
export async function drain(limit = 20): Promise<{ done: number; retried: number; dead: number }> {
  const claimed = await many<{ id: number; kind: string; payload: Record<string, string>; attempts: number; max_attempts: number }>(
    db(),
    `update private.jobs set status = 'running', attempts = attempts + 1, updated_at = now()
      where id in (select id from private.jobs where status = 'queued' and run_at <= now() order by run_at limit $1 for update skip locked)
      returning id, kind, payload, attempts, max_attempts`,
    [limit],
  );
  const out = { done: 0, retried: 0, dead: 0 };
  for (const j of claimed) {
    try {
      const h = handlers[j.kind];
      if (!h) throw new Error(`no handler for ${j.kind}`);
      await tx((c) => h(c, j.payload));
      await db().query("update private.jobs set status = 'done', last_error = null, updated_at = now() where id = $1", [j.id]);
      out.done++;
    } catch (e) {
      const msg = (e as Error).message.slice(0, 500);
      const dead = j.attempts >= j.max_attempts;
      await db().query(
        `update private.jobs set status = $2, last_error = $3, run_at = now() + make_interval(mins => $4), updated_at = now() where id = $1`,
        [j.id, dead ? 'dead' : 'queued', msg, 2 ** j.attempts],
      );
      dead ? out.dead++ : out.retried++;
    }
  }
  return out;
}

// ---------------------------------------------------------------- scheduled tasks (POST /cron/:task)

async function ctxFor(c: pg.PoolClient, userId: string, now: Date): Promise<Ctx> {
  const p = await one<{ timezone: string }>(c, 'select timezone from public.profiles where id = $1', [userId]);
  return { c, userId, email: '', now, today: todayIn(p?.timezone ?? 'Europe/Paris', now) };
}

/** Hourly: overdue sessions become missed, for every runner with an active plan. */
export async function markMissed(now = new Date()): Promise<number> {
  const users = await many<{ user_id: string }>(
    db(),
    `select distinct s.user_id from public.sessions s join public.plans p on p.id = s.plan_id and p.status = 'active'
      where s.status = 'planned' and s.scheduled_on < (now() at time zone 'utc')::date`,
  );
  let n = 0;
  for (const u of users) {
    await tx(async (c) => {
      await sweep(await ctxFor(c, u.user_id, now));
    });
    n++;
  }
  return n;
}

/** Every 15 min: push "today's session" to runners whose reminder time just passed, in their zone. */
export async function sessionReminders(now = new Date()): Promise<number> {
  const rows = await many<{ user_id: string; title: string; tokens: string[] }>(
    db(),
    `select s.user_id, s.title, array_agg(t.expo_token) as tokens
       from public.notification_prefs np
       join public.profiles pr on pr.id = np.user_id
       join public.sessions s on s.user_id = np.user_id and s.status = 'planned'
       join public.plans p on p.id = s.plan_id and p.status = 'active'
       join public.push_tokens t on t.user_id = np.user_id
      where np.session_reminder
        and s.scheduled_on = ($1::timestamptz at time zone pr.timezone)::date
        and ($1::timestamptz at time zone pr.timezone)::time >= np.reminder_local_time
        and ($1::timestamptz at time zone pr.timezone)::time < np.reminder_local_time + interval '15 minutes'
      group by s.user_id, s.title`,
    [now],
  );
  for (const r of rows) {
    await enqueue(db(), 'push.send', { title: 'Séance du jour', body: r.title, tokens: JSON.stringify(r.tokens) }, { dedupeKey: `remind:${r.user_id}:${now.toISOString().slice(0, 10)}` });
  }
  return rows.length;
}

/** Daily: email runners whose trial ends in 4 days. */
export async function trialEnding(now = new Date()): Promise<number> {
  const rows = await many<{ user_id: string; trial_ends_at: Date }>(
    db(),
    `select user_id, trial_ends_at from public.subscriptions
      where status = 'trial' and trial_ends_at >= $1::timestamptz + interval '3 days 12 hours' and trial_ends_at < $1::timestamptz + interval '4 days 12 hours'`,
    [now],
  );
  for (const r of rows) {
    const day = r.trial_ends_at.toISOString().slice(0, 10);
    await enqueue(db(), 'email.trial_ending', { userId: r.user_id, endsOn: day }, { dedupeKey: `trial:${r.user_id}:${day}` });
  }
  return rows.length;
}

/** Daily: drop old webhook payloads, rate-limit windows and finished jobs. */
export async function cleanup(): Promise<void> {
  await db().query("delete from private.webhook_events where received_at < now() - interval '30 days'");
  await db().query("delete from private.rate_limits where window_start < now() - interval '1 day'");
  await db().query("delete from private.jobs where status = 'done' and updated_at < now() - interval '7 days'");
}

// ---------------------------------------------------------------- job handlers

onJob('email.trial_ending', async (c, p) => {
  const u = await one<{ email: string; first_name: string | null }>(
    c,
    'select u.email, pr.first_name from auth.users u join public.profiles pr on pr.id = u.id where u.id = $1',
    [p.userId],
  );
  if (!u?.email) return;
  const [y, m, d] = p.endsOn.split('-');
  await send(trialEndingEmail(u.email, u.first_name, `${d}/${m}/${y}`, '119 € par an'));
});

onJob('push.send', async (_c, p) => {
  const tokens: string[] = JSON.parse(p.tokens);
  const res = await http('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(tokens.map((to) => ({ to, title: p.title, body: p.body, sound: 'default' }))),
  });
  if (!res.ok) throw new Error(`expo push: HTTP ${res.status}`);
});

