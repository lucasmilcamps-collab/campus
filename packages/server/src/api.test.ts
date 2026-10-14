// Runs against a real migrated Postgres: `pnpm test:server` from the repo root
// (scripts/test-db.sh creates a throwaway cluster and sets DATABASE_URL).
// Two runners, A and B: every read and write B attempts on A's data must fail.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { setEnvForTests } from './env';
import { db, closeDb, one, many } from './db';
import { signTestAccessToken } from './auth';
import { setFetchForTests } from './http';
import { handle, type Res } from './router';
import { drain, enqueue } from './jobs';

const SECRETS = {
  SUPABASE_JWT_SECRET: 'test-jwt-secret-test-jwt-secret-0123456789',
  APP_SECRET: 'test-app-secret-test-app-secret-0123456789',
  TOKEN_ENC_KEY: randomBytes(32).toString('base64'),
  CRON_SECRET: 'cron-secret-0123456789',
  REVENUECAT_WEBHOOK_AUTH: 'rc-webhook-auth-0123456789',
  REVENUECAT_SECRET_KEY: 'sk_test_rc',
  STRAVA_CLIENT_ID: '12345',
  STRAVA_CLIENT_SECRET: 'strava-secret',
  STRAVA_VERIFY_TOKEN: 'strava-verify-0123456789',
  STRAVA_SUBSCRIPTION_ID: 999,
  RESEND_API_KEY: 're_test',
  API_URL: 'https://api.test',
  APP_RETURN_URL: 'stride://connections',
};

let A = { id: '', token: '' };
let B = { id: '', token: '' };
let clock = new Date('2026-10-14T08:00:00Z'); // Wednesday morning in Europe/Paris

type Fake = (url: string, init?: RequestInit) => { status?: number; body: unknown } | undefined;
let fakes: Fake[] = [];
const outbound: Array<{ url: string; body?: string }> = [];

async function call(method: string, path: string, o: { token?: string; body?: unknown; query?: Record<string, string>; headers?: Record<string, string> } = {}): Promise<Res> {
  const h = new Headers(o.headers);
  if (o.token) h.set('authorization', `Bearer ${o.token}`);
  return handle({ method, path, query: new URLSearchParams(o.query), headers: h, body: o.body, ip: '203.0.113.9' }, () => clock);
}
const ok = (r: Res) => {
  if (r.status >= 300) throw new Error(`expected 2xx, got ${r.status}: ${JSON.stringify(r.body)}`);
  return r.body as any;
};

async function makeUser(email: string) {
  const u = await one<{ id: string }>(db(), 'insert into auth.users (email) values ($1) returning id', [email]);
  return { id: u!.id, token: await signTestAccessToken(u!.id, email) };
}

const ONBOARD = { firstName: 'Camille', age: 34, sex: 'female', experience: '1_3y', weeklyVolumeKm: 22, runsPerWeekNow: 3, recent: { distanceM: 10000, durationS: 3150 } };
const HALF = { kind: 'race', distanceM: 21097, date: '2027-03-21', name: 'Semi de test' };

beforeAll(async () => {
  if (!process.env.DATABASE_URL) throw new Error('run through scripts/test-db.sh (DATABASE_URL not set)');
  setEnvForTests({ ...SECRETS, DATABASE_URL: process.env.DATABASE_URL } as never);
  setFetchForTests(async (input, init) => {
    const url = String(input);
    outbound.push({ url, body: typeof init?.body === 'string' ? init.body : init?.body?.toString() });
    for (const f of fakes) {
      const r = f(url, init);
      if (r) return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected outbound call in test: ${url}`);
  });
  A = await makeUser('a@example.com');
  B = await makeUser('b@example.com');
});

afterAll(async () => {
  setFetchForTests(null);
  await closeDb();
});

describe('auth', () => {
  it('rejects missing, malformed and forged tokens', async () => {
    expect((await call('GET', '/me')).status).toBe(401);
    expect((await call('GET', '/me', { token: 'nope' })).status).toBe(401);
    const forged = A.token.slice(0, -4) + 'AAAA';
    expect((await call('GET', '/me', { token: forged })).status).toBe(401);
  });
  it('the auth trigger created profile, subscription and preferences rows', async () => {
    expect(ok(await call('GET', '/me', { token: A.token }))).toMatchObject({ id: A.id, onboarded: false });
    expect(await one(db(), 'select 1 from public.subscriptions where user_id = $1', [A.id])).toBeTruthy();
    expect(await one(db(), 'select 1 from public.notification_prefs where user_id = $1', [A.id])).toBeTruthy();
  });
  it('unknown routes and wrong methods', async () => {
    expect((await call('GET', '/nope', { token: A.token })).status).toBe(404);
    expect((await call('PUT', '/me', { token: A.token })).status).toBe(405);
    expect((await call('POST', '/me', { token: A.token })).status).toBe(405);
  });
});

describe('validation', () => {
  it('rejects bad input with a readable message, and unknown fields', async () => {
    const r = await call('POST', '/onboarding', { token: A.token, body: { ...ONBOARD, age: 9 } });
    expect(r.status).toBe(400);
    expect((r.body as any).error.message).toMatch(/^age/);
    expect((await call('POST', '/onboarding', { token: A.token, body: { ...ONBOARD, isAdmin: true } })).status).toBe(400);
    expect((await call('GET', '/sessions/not-a-uuid', { token: A.token })).status).toBe(400);
    expect((await call('GET', '/week', { token: A.token, query: { start: '14/10/2026' } })).status).toBe(400);
  });
});

describe('the core loop, and B can touch none of it', () => {
  let hard = '';

  it('onboarding sets level and paces', async () => {
    const lvl = ok(await call('POST', '/onboarding', { token: A.token, body: ONBOARD }));
    expect(lvl.source).toBe('race');
    expect(lvl.vmaKmh).toBeGreaterThan(12);
    expect(ok(await call('GET', '/me/level', { token: A.token })).vmaKmh).toBe(lvl.vmaKmh);
    expect(ok(await call('GET', '/me', { token: A.token })).onboarded).toBe(true);
  });

  it('a race goal needs the Training offer', async () => {
    const pv = ok(await call('POST', '/plans/preview', { token: A.token, body: { goal: HALF } }));
    expect(pv.options).toHaveLength(3);
    const r = await call('POST', '/plans', { token: A.token, body: { goal: HALF, sessionsPerWeek: 4 } });
    expect(r.status).toBe(402);
    expect((r.body as any).error.code).toBe('paywall');
  });

  it('RevenueCat webhook: auth checked, idempotent, state re-read from RevenueCat', async () => {
    fakes = [
      (url) =>
        url.startsWith('https://api.revenuecat.com/v1/subscribers/')
          ? {
              body: {
                subscriber: {
                  entitlements: { training: { expires_date: '2026-10-28T08:00:00Z', product_identifier: 'training_year', purchase_date: '2026-10-14T08:00:00Z' } },
                  subscriptions: { training_year: { expires_date: '2026-10-28T08:00:00Z', period_type: 'trial', store: 'app_store', unsubscribe_detected_at: null, billing_issues_detected_at: null } },
                },
              },
            }
          : undefined,
    ];
    const ev = { api_version: '1.0', event: { id: 'evt_1', type: 'INITIAL_PURCHASE', app_user_id: A.id } };
    expect((await call('POST', '/webhooks/revenuecat', { body: ev })).status).toBe(401);
    expect((await call('POST', '/webhooks/revenuecat', { body: ev, headers: { authorization: 'Bearer wrong-wrong-wrong-wr' } })).status).toBe(401);
    const auth = { authorization: `Bearer ${SECRETS.REVENUECAT_WEBHOOK_AUTH}` };
    expect(ok(await call('POST', '/webhooks/revenuecat', { body: ev, headers: auth }))).toEqual({ ok: true });
    expect(ok(await call('POST', '/webhooks/revenuecat', { body: ev, headers: auth }))).toEqual({ ok: true, duplicate: true });
    expect(outbound.filter((o) => o.url.includes('revenuecat')).length).toBe(1);
    expect(ok(await call('GET', '/entitlements', { token: A.token }))).toMatchObject({ tier: 'training', status: 'trial', trialUsed: true, period: 'year' });
    expect(ok(await call('GET', '/entitlements', { token: B.token }))).toMatchObject({ tier: 'free', status: 'none' });
  });

  it('creates the plan once entitled', async () => {
    ok(await call('POST', '/plans', { token: A.token, body: { goal: HALF, sessionsPerWeek: 4 } }));
    const p = ok(await call('GET', '/plans/current', { token: A.token }));
    expect(p.weeks).toHaveLength(23);
    expect(p.sessions.at(-1).type).toBe('race');
    expect(p.goal.name).toBe('Semi de test');
    expect(p.sessions.every((s: any) => /^[0-9a-f-]{36}$/.test(s.id))).toBe(true);
    hard = p.sessions.find((s: any) => s.date === '2026-10-20').id;
  });

  it('B sees none of A’s plan, sessions or adjustments, and cannot change them', async () => {
    expect(ok(await call('GET', '/plans/current', { token: B.token }))).toBeNull();
    expect((await call('GET', `/sessions/${hard}`, { token: B.token })).status).toBe(404);
    expect((await call('GET', `/sessions/${hard}/feedback`, { token: B.token })).body).toBeNull();
    expect((await call('POST', `/sessions/${hard}/move`, { token: B.token, body: { to: '2026-10-21' } })).status).toBe(404);
    expect((await call('POST', `/sessions/${hard}/skip`, { token: B.token })).status).toBe(404);
    expect((await call('POST', '/feedback', { token: B.token, body: { sessionId: hard, rpe: 5 } })).status).toBe(404);
    expect((await call('POST', '/activities', { token: B.token, body: { sessionId: hard, source: 'manual', sport: 'run', date: '2026-10-14', durationS: 1800, distanceM: 5000 } })).status).toBe(404);
    expect(ok(await call('GET', '/week', { token: B.token, query: { start: '2026-10-19' } })).sessions).toEqual([]);
    expect(ok(await call('GET', '/activities', { token: B.token }))).toEqual([]);
    const s = await one<{ status: string }>(db(), 'select status from public.sessions where id = $1', [hard]);
    expect(s!.status).toBe('planned');
  });

  it('RLS: with the anon key and B’s JWT, the database itself returns nothing of A’s', async () => {
    const c = await db().connect();
    try {
      await c.query('begin');
      await c.query('set local role authenticated');
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [B.id]);
      expect((await c.query('select count(*)::int as n from public.sessions')).rows[0].n).toBe(0);
      expect((await c.query('select count(*)::int as n from public.plans')).rows[0].n).toBe(0);
      expect((await c.query("update public.sessions set status = 'done' where id = $1", [hard])).rowCount).toBe(0);
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [A.id]);
      expect((await c.query('select count(*)::int as n from public.sessions')).rows[0].n).toBeGreaterThan(80);
      await c.query('rollback');
    } finally {
      c.release();
    }
  });

  it('six days on: missed sessions swept, then extreme feedback slows paces with a reason', async () => {
    clock = new Date('2026-10-20T07:00:00Z');
    const w = ok(await call('GET', '/week', { token: A.token, query: { start: '2026-10-20' } }));
    expect(w.adjustments[0].reason).toBe('missed_sessions');
    const missed = await many(db(), "select 1 from public.sessions where user_id = $1 and status = 'missed'", [A.id]);
    expect(missed.length).toBe(3);

    const before = ok(await call('GET', '/plans/current', { token: A.token }));
    ok(await call('POST', '/activities', { token: A.token, body: { sessionId: hard, source: 'manual', sport: 'run', date: '2026-10-20', durationS: 2000, distanceM: 5400 } }));
    const fb = ok(await call('POST', '/feedback', { token: A.token, body: { sessionId: hard, rpe: 5, note: 'vent' } }));
    expect(fb.adjustment.summary).toMatch(/ralentissent/);
    const after = ok(await call('GET', '/plans/current', { token: A.token }));
    expect(after.revision).toBe(before.revision + 1);
    expect(after.vmaKmh).toBeLessThan(before.vmaKmh);
    const s = after.sessions.find((x: any) => x.id === hard);
    expect(s.status).toBe('done');
    expect(ok(await call('GET', `/sessions/${hard}/feedback`, { token: A.token }))).toMatchObject({ rpe: 5, note: 'vent' });
    expect(ok(await call('GET', '/me/level', { token: A.token })).vmaKmh).toBe(after.vmaKmh);

    const adj = ok(await call('GET', '/adjustments', { token: A.token }));
    expect((await call('POST', `/adjustments/${adj[0].id}/seen`, { token: B.token })).status).toBe(404);
    expect((await call('POST', `/adjustments/${adj[0].id}/seen`, { token: A.token })).status).toBe(204);
  });

  it('logging the same session twice is a conflict', async () => {
    const r = await call('POST', '/activities', { token: A.token, body: { sessionId: hard, source: 'manual', sport: 'run', date: '2026-10-20', durationS: 2000, distanceM: 5400 } });
    expect(r.status).toBe(409);
  });

  it('move warns on back-to-back hard days, then moves when forced; skip works', async () => {
    const p = ok(await call('GET', '/plans/current', { token: A.token }));
    const fri = p.sessions.find((s: any) => s.date === '2026-10-23');
    const r = ok(await call('POST', `/sessions/${fri.id}/move`, { token: A.token, body: { to: '2026-10-22' } }));
    expect(r.session).toBeUndefined();
    expect(r.warnings.join(' ')).toMatch(/déjà une séance/);
    const forced = ok(await call('POST', `/sessions/${fri.id}/move`, { token: A.token, body: { to: '2026-10-24', force: true } }));
    expect(forced.session.date).toBe('2026-10-24');
    expect((await call('POST', `/sessions/${fri.id}/move`, { token: A.token, body: { to: '2026-10-01' } })).status).toBe(400);
    const sun = p.sessions.find((s: any) => s.date === '2026-10-25');
    expect((await call('POST', `/sessions/${sun.id}/skip`, { token: A.token })).status).toBe(204);
    expect((await call('POST', `/sessions/${sun.id}/skip`, { token: A.token })).status).toBe(400);
  });

  it('switching to 5 sessions a week regenerates the future, without duplicates', async () => {
    const r = ok(await call('PATCH', '/settings', { token: A.token, body: { sessionsPerWeek: 5 } }));
    expect(r.adjustment.summary).toMatch(/5 séances/);
    const w = ok(await call('GET', '/week', { token: A.token, query: { start: '2026-10-26' } }));
    expect(w.sessions).toHaveLength(5);
    const dupes = await one<{ n: number }>(db(), 'select count(*)::int - count(distinct (scheduled_on, type, title))::int as n from public.sessions where user_id = $1 and status = $2', [A.id, 'planned']);
    expect(dupes!.n).toBeLessThan(3);
    const past = ok(await call('GET', `/sessions/${hard}`, { token: A.token }));
    expect(past.status).toBe('done');
    expect((await call('PATCH', '/settings', { token: A.token, body: {} })).status).toBe(400);
  });

  it('a manual run on a planned day is matched to that session', async () => {
    clock = new Date('2026-10-21T18:00:00Z');
    const p = ok(await call('GET', '/plans/current', { token: A.token }));
    const today = p.sessions.find((s: any) => s.date === '2026-10-21');
    const act = ok(await call('POST', '/activities', { token: A.token, body: { source: 'manual', sport: 'run', date: '2026-10-21', durationS: 1900, distanceM: 5000 } }));
    expect(act.matchedSessionId).toBe(today?.id);
    expect((await call('POST', '/activities', { token: A.token, body: { source: 'manual', sport: 'run', date: '2026-12-01', durationS: 1900, distanceM: 5000 } })).status).toBe(400);
  });
});

describe('Strava', () => {
  it('start: our client id, the fewest scopes, a signed state', async () => {
    const { url } = ok(await call('POST', '/connect/strava/start', { token: A.token }));
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://www.strava.com/oauth/authorize');
    expect(u.searchParams.get('client_id')).toBe('12345');
    expect(u.searchParams.get('scope')).toBe('activity:read_all');
    expect(u.searchParams.get('redirect_uri')).toBe('https://api.test/api/connect/strava/callback');
    expect((await call('POST', '/connect/garmin/start', { token: A.token })).status).toBe(501);
  });

  it('callback: tokens encrypted at rest; one athlete, one account; bad state refused', async () => {
    fakes = [(url) => (url === 'https://www.strava.com/oauth/token' ? { body: { access_token: 'acc-SECRET-1', refresh_token: 'ref-SECRET-1', expires_at: Math.floor(Date.now() / 1000) + 21600, athlete: { id: 4242 } } } : undefined)];
    const { url } = ok(await call('POST', '/connect/strava/start', { token: A.token }));
    const state = new URL(url).searchParams.get('state')!;
    const r = await call('GET', '/connect/strava/callback', { query: { code: 'c1', scope: 'read,activity:read_all', state } });
    expect(r.status).toBe(302);
    expect(r.redirect).toBe('stride://connections?provider=strava&result=ok');
    const tok = await one<{ access_token_enc: Buffer }>(db(), 'select access_token_enc from private.connection_tokens t join public.connections k on k.id = t.connection_id where k.user_id = $1', [A.id]);
    expect(tok!.access_token_enc.toString('utf8')).not.toContain('acc-SECRET-1');
    expect(ok(await call('GET', '/connections', { token: A.token }))).toEqual([expect.objectContaining({ provider: 'strava', status: 'active' })]);
    expect(ok(await call('GET', '/connections', { token: B.token }))).toEqual([]);

    const bState = new URL(ok(await call('POST', '/connect/strava/start', { token: B.token })).url).searchParams.get('state')!;
    expect((await call('GET', '/connect/strava/callback', { query: { code: 'c2', scope: 'activity:read_all', state: bState } })).redirect).toMatch(/result=in_use/);
    expect((await call('GET', '/connect/strava/callback', { query: { code: 'c3', scope: 'activity:read_all', state: 'forged' } })).redirect).toMatch(/result=expired/);
    expect((await call('GET', '/connect/strava/callback', { query: { code: 'c4', scope: 'read', state } })).redirect).toMatch(/result=scope/);
  });

  it('webhook: handshake, unknown subscription refused, events deduplicated, import matched to the session', async () => {
    expect((await call('GET', '/webhooks/strava', { query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': 'x' } })).status).toBe(403);
    expect(ok(await call('GET', '/webhooks/strava', { query: { 'hub.mode': 'subscribe', 'hub.verify_token': SECRETS.STRAVA_VERIFY_TOKEN, 'hub.challenge': 'abc' } }))).toEqual({ 'hub.challenge': 'abc' });

    const ev = { object_type: 'activity', object_id: 777, aspect_type: 'create', owner_id: 4242, subscription_id: 999, event_time: 1792000000 };
    expect((await call('POST', '/webhooks/strava', { body: { ...ev, subscription_id: 1 } })).status).toBe(403);
    ok(await call('POST', '/webhooks/strava', { body: ev }));
    ok(await call('POST', '/webhooks/strava', { body: ev }));
    expect((await many(db(), "select 1 from private.jobs where kind = 'strava.activity.import'")).length).toBe(1);

    const p = ok(await call('GET', '/plans/current', { token: A.token }));
    const thu = p.sessions.find((s: any) => s.date === '2026-10-22' && s.status === 'planned');
    fakes = [
      (url) =>
        url === 'https://www.strava.com/api/v3/activities/777'
          ? { body: { id: 777, sport_type: 'Run', start_date: '2026-10-22T05:30:00Z', start_date_local: '2026-10-22T07:30:00Z', timezone: '(GMT+01:00) Europe/Paris', elapsed_time: 2400, moving_time: 2300, distance: 6100.4, total_elevation_gain: 42, average_heartrate: 151.2 } }
          : undefined,
    ];
    expect(await drain()).toEqual({ done: 1, retried: 0, dead: 0 });
    const a = await one<{ session_id: string; distance_m: number }>(db(), "select session_id, distance_m from public.activities where source = 'strava' and external_id = '777'");
    expect(a).toEqual({ session_id: thu.id, distance_m: 6100 });
    expect(ok(await call('GET', `/sessions/${thu.id}`, { token: A.token })).status).toBe('done');
  });

  it('deauthorization from Strava revokes the link and drops tokens', async () => {
    ok(await call('POST', '/webhooks/strava', { body: { object_type: 'athlete', object_id: 4242, aspect_type: 'update', owner_id: 4242, subscription_id: 999, event_time: 1792000100, updates: { authorized: 'false' } } }));
    expect(ok(await call('GET', '/connections', { token: A.token }))).toEqual([]);
    expect(await one(db(), 'select 1 from private.connection_tokens t join public.connections k on k.id = t.connection_id where k.user_id = $1', [A.id])).toBeNull();
  });
});

describe('jobs, cron, email', () => {
  it('cron routes need the secret', async () => {
    expect((await call('POST', '/cron/drain')).status).toBe(401);
    expect((await call('POST', '/cron/drain', { headers: { authorization: 'Bearer nope' } })).status).toBe(401);
    expect(ok(await call('POST', '/cron/drain', { headers: { authorization: `Bearer ${SECRETS.CRON_SECRET}` } }))).toMatchObject({ dead: 0 });
  });

  it('a failing job retries with backoff, then lands in the dead-letter state', async () => {
    await enqueue(db(), 'no.such.handler', {}, { maxAttempts: 2, dedupeKey: 'dl-test' });
    expect((await drain()).retried).toBe(1);
    await db().query("update private.jobs set run_at = now() where dedupe_key = 'dl-test'");
    expect((await drain()).dead).toBe(1);
    const j = await one<{ status: string; last_error: string }>(db(), "select status, last_error from private.jobs where dedupe_key = 'dl-test'");
    expect(j).toEqual({ status: 'dead', last_error: 'no handler for no.such.handler' });
  });

  it('trial ending: one email, four days before, from our template', async () => {
    await db().query("update public.subscriptions set status = 'trial', trial_ends_at = now() + interval '4 days' where user_id = $1", [A.id]);
    fakes = [(url) => (url === 'https://api.resend.com/emails' ? { body: { id: 'em_1' } } : undefined)];
    const cron = { authorization: `Bearer ${SECRETS.CRON_SECRET}` };
    expect(ok(await call('POST', '/cron/trial-ending', { headers: cron })).queued).toBe(1);
    ok(await call('POST', '/cron/trial-ending', { headers: cron }));
    await drain();
    const sent = outbound.filter((o) => o.url === 'https://api.resend.com/emails');
    expect(sent).toHaveLength(1);
    const body = JSON.parse(sent[0].body!);
    expect(body.to).toEqual(['a@example.com']);
    expect(body.subject).toMatch(/Ton essai se termine/);
    expect(body.text).toMatch(/annule/);
  });
});

describe('rate limits', () => {
  it('per user, per route', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await call('POST', '/plans/current/abandon', { token: B.token })).status);
    expect(codes.filter((c) => c === 429).length).toBeGreaterThan(0);
    expect((await call('GET', '/me', { token: A.token })).status).toBe(200);
  });
});

describe('GDPR', () => {
  it('export has the runner’s data and no secrets', async () => {
    const e = ok(await call('GET', '/me/export', { token: A.token }));
    expect(e.sessions.length).toBeGreaterThan(50);
    expect(e.feedback[0].note).toBe('vent');
    expect(JSON.stringify(e)).not.toMatch(/SECRET|token_enc/);
  });

  it('delete needs confirmation, removes everything, and the old token stops working', async () => {
    expect((await call('DELETE', '/me', { token: A.token, body: {} })).status).toBe(400);
    expect((await call('DELETE', '/me', { token: A.token, body: { confirm: true } })).status).toBe(204);
    for (const t of ['profiles', 'plans', 'sessions', 'activities', 'feedback', 'connections', 'subscriptions']) {
      const col = t === 'profiles' ? 'id' : 'user_id';
      expect((await many(db(), `select 1 from public.${t} where ${col} = $1`, [A.id])).length).toBe(0);
    }
    expect((await call('GET', '/me', { token: A.token })).status).toBe(401);
    expect(ok(await call('GET', '/me', { token: B.token })).id).toBe(B.id);
  });
});
