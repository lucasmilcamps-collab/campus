// Store subscriptions through RevenueCat (App Store + Google Play).
//
// The app identifies the runner to RevenueCat with our user id
// (Purchases.logIn(userId)). RevenueCat calls our webhook on every change; we
// never trust the event body for state: we record its id (idempotency), then
// re-read the subscriber from RevenueCat's REST API and store what it says.

import { timingSafeEqual } from 'node:crypto';
import type pg from 'pg';
import { env } from './env';
import { HttpError } from './errors';
import { http, json } from './http';

const ENTITLEMENT = 'training';

interface RcSubscriber {
  subscriber: {
    entitlements: Record<string, { expires_date: string | null; product_identifier: string; purchase_date: string }>;
    subscriptions: Record<
      string,
      {
        expires_date: string | null;
        period_type: 'trial' | 'intro' | 'normal';
        store: 'app_store' | 'play_store' | 'stripe' | string;
        unsubscribe_detected_at: string | null;
        billing_issues_detected_at: string | null;
      }
    >;
  };
}

export function checkWebhookAuth(header: string | null): void {
  const expected = env().REVENUECAT_WEBHOOK_AUTH;
  if (!expected) throw new HttpError(503, 'invalid', 'RevenueCat n’est pas configuré.');
  const a = Buffer.from(header ?? '');
  const b = Buffer.from(`Bearer ${expected}`);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, 'unauthorized', 'bad webhook authorization');
}

/** Records the event; false if we already had it (RevenueCat retries). */
export async function recordEvent(c: pg.PoolClient, provider: string, eventId: string, payload: unknown): Promise<boolean> {
  const r = await c.query(
    `insert into private.webhook_events (provider, event_id, payload) values ($1, $2, $3) on conflict do nothing`,
    [provider, eventId, JSON.stringify(payload)],
  );
  return (r.rowCount ?? 0) > 0;
}

/** Re-reads the subscriber from RevenueCat and writes our subscriptions row. */
export async function syncSubscriber(c: pg.PoolClient, userId: string, now = new Date()): Promise<void> {
  const key = env().REVENUECAT_SECRET_KEY;
  if (!key) throw new HttpError(503, 'invalid', 'RevenueCat n’est pas configuré.');
  const res = await http(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  const { subscriber } = await json<RcSubscriber>(res, 'revenuecat subscriber');
  const ent = subscriber.entitlements[ENTITLEMENT];
  const sub = ent ? subscriber.subscriptions[ent.product_identifier] : undefined;
  const expires = ent?.expires_date ? new Date(ent.expires_date) : null;
  const live = !!ent && (!expires || expires > now);
  const everTrialled = Object.values(subscriber.subscriptions).some((s) => s.period_type === 'trial');

  let status: 'none' | 'trial' | 'active' | 'grace' | 'cancelled' | 'expired' = 'none';
  if (ent && !live) status = 'expired';
  else if (live && sub?.billing_issues_detected_at) status = 'grace';
  else if (live && sub?.unsubscribe_detected_at) status = 'cancelled';
  else if (live && sub?.period_type === 'trial') status = 'trial';
  else if (live) status = 'active';

  const period = ent?.product_identifier.includes('year') || ent?.product_identifier.includes('annual') ? 'year' : ent ? 'month' : null;
  const store = sub?.store === 'app_store' || sub?.store === 'play_store' || sub?.store === 'stripe' ? sub.store : null;
  await c.query(
    `insert into public.subscriptions (user_id, tier, period, store, status, trial_used, trial_ends_at, current_period_ends_at, rc_app_user_id, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
     on conflict (user_id) do update set tier = excluded.tier, period = excluded.period, store = excluded.store, status = excluded.status,
       trial_used = public.subscriptions.trial_used or excluded.trial_used, trial_ends_at = excluded.trial_ends_at,
       current_period_ends_at = excluded.current_period_ends_at, rc_app_user_id = excluded.rc_app_user_id, updated_at = now()`,
    [userId, live ? 'training' : 'free', period, store, status, everTrialled, status === 'trial' ? expires : null, expires, userId],
  );
}

/** POST /webhooks/revenuecat */
export async function handleRevenueCatWebhook(c: pg.PoolClient, authHeader: string | null, body: unknown): Promise<{ ok: true; duplicate?: boolean }> {
  checkWebhookAuth(authHeader);
  const ev = (body as { event?: { id?: string; app_user_id?: string; type?: string } })?.event;
  if (!ev?.id || !ev.app_user_id) throw new HttpError(400, 'invalid', 'malformed event');
  if (!(await recordEvent(c, 'revenuecat', ev.id, body))) return { ok: true, duplicate: true };
  // anonymous RevenueCat ids ($RCAnonymousID:...) are not ours: nothing to sync
  if (!/^[0-9a-f-]{36}$/i.test(ev.app_user_id)) return { ok: true };
  const exists = await c.query('select 1 from public.profiles where id = $1', [ev.app_user_id]);
  if (!exists.rowCount) return { ok: true };
  await syncSubscriber(c, ev.app_user_id);
  await c.query("update private.webhook_events set processed_at = now() where provider = 'revenuecat' and event_id = $1", [ev.id]);
  return { ok: true };
}
