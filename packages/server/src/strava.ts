// Strava, through its public API (developers.strava.com) with our own app.
//
// Scope: activity:read_all, the fewest that lets us import runs the athlete
// keeps private (many do). No write scopes. Strava webhooks are not signed:
// we check the subscription id, then re-read the activity with the athlete's
// token, so a forged event can at most make us fetch something real.
// API terms: data stays private to its owner (no sharing in crews or
// challenges, no model training).

import type pg from 'pg';
import { signState, verifyState } from './auth';
import { decrypt, encrypt } from './crypto';
import { many, one } from './db';
import { env } from './env';
import { HttpError, invalid } from './errors';
import { http, json } from './http';
import { recordEvent } from './billing';
import { enqueue } from './jobs';

const AUTH_URL = 'https://www.strava.com/oauth/authorize';
const TOKEN_URL = 'https://www.strava.com/oauth/token';
const API = 'https://www.strava.com/api/v3';

function cfg() {
  const e = env();
  if (!e.STRAVA_CLIENT_ID || !e.STRAVA_CLIENT_SECRET) throw new HttpError(503, 'invalid', 'Strava n’est pas encore disponible.');
  return { id: e.STRAVA_CLIENT_ID, secret: e.STRAVA_CLIENT_SECRET, redirect: `${e.API_URL}/api/connect/strava/callback` };
}

/** POST /connect/strava/start -> the URL the app opens in a browser. */
export async function startUrl(userId: string): Promise<string> {
  const { id, redirect } = cfg();
  const state = await signState({ sub: userId, p: 'strava' });
  const q = new URLSearchParams({ client_id: id, redirect_uri: redirect, response_type: 'code', approval_prompt: 'auto', scope: 'activity:read_all', state });
  return `${AUTH_URL}?${q}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number };
}

/** GET /connect/strava/callback -> where to send the browser back to. */
export async function callback(c: pg.PoolClient, params: URLSearchParams): Promise<string> {
  const back = (result: string) => `${env().APP_RETURN_URL}?provider=strava&result=${result}`;
  if (params.get('error')) return back('denied');
  let userId: string;
  try {
    const st = await verifyState(params.get('state') ?? '');
    if (st.p !== 'strava' || typeof st.sub !== 'string') throw new Error('state');
    userId = st.sub;
  } catch {
    return back('expired');
  }
  if (!(params.get('scope') ?? '').split(',').includes('activity:read_all')) return back('scope');
  const { id, secret } = cfg();
  const tok = await json<TokenResponse>(
    await http(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: id, client_secret: secret, code: params.get('code') ?? '', grant_type: 'authorization_code' }),
    }),
    'strava token',
  );
  const athlete = String(tok.athlete?.id ?? '');
  if (!athlete) return back('error');
  const other = await one<{ user_id: string }>(c, "select user_id from public.connections where provider = 'strava' and external_user_id = $1", [athlete]);
  if (other && other.user_id !== userId) return back('in_use');
  const conn = await one<{ id: string }>(
    c,
    `insert into public.connections (user_id, provider, external_user_id, status) values ($1, 'strava', $2, 'active')
     on conflict (user_id, provider) do update set external_user_id = excluded.external_user_id, status = 'active', last_error = null
     returning id`,
    [userId, athlete],
  );
  await saveTokens(c, conn!.id, tok);
  return back('ok');
}

async function saveTokens(c: pg.PoolClient, connectionId: string, t: TokenResponse) {
  await c.query(
    `insert into private.connection_tokens (connection_id, access_token_enc, refresh_token_enc, expires_at, scopes, updated_at)
     values ($1, $2, $3, to_timestamp($4), '{activity:read_all}', now())
     on conflict (connection_id) do update set access_token_enc = excluded.access_token_enc, refresh_token_enc = excluded.refresh_token_enc,
       expires_at = excluded.expires_at, updated_at = now()`,
    [connectionId, encrypt(t.access_token), encrypt(t.refresh_token), t.expires_at],
  );
}

/** A valid access token, refreshed if it expires within 5 minutes. */
export async function accessToken(c: pg.PoolClient, connectionId: string): Promise<string> {
  const row = await one<{ access_token_enc: Buffer; refresh_token_enc: Buffer; expires_at: Date }>(
    c,
    'select access_token_enc, refresh_token_enc, expires_at from private.connection_tokens where connection_id = $1 for update',
    [connectionId],
  );
  if (!row) throw new Error('no tokens for connection');
  if (row.expires_at.getTime() - Date.now() > 5 * 60_000) return decrypt(row.access_token_enc);
  const { id, secret } = cfg();
  const res = await http(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, grant_type: 'refresh_token', refresh_token: decrypt(row.refresh_token_enc) }),
  });
  if (res.status === 400 || res.status === 401) {
    await c.query("update public.connections set status = 'error', last_error = 'refresh refused' where id = $1", [connectionId]);
    throw new Error('strava refresh refused');
  }
  const t = await json<TokenResponse>(res, 'strava refresh');
  await saveTokens(c, connectionId, t);
  return t.access_token;
}

/** GET /webhooks/strava: subscription handshake. */
export function verifySubscription(q: URLSearchParams): { 'hub.challenge': string } {
  const token = env().STRAVA_VERIFY_TOKEN;
  if (!token || q.get('hub.mode') !== 'subscribe' || q.get('hub.verify_token') !== token) throw new HttpError(403, 'unauthorized', 'bad verify token');
  return { 'hub.challenge': q.get('hub.challenge') ?? '' };
}

interface StravaEvent {
  object_type: 'activity' | 'athlete';
  object_id: number;
  aspect_type: 'create' | 'update' | 'delete';
  owner_id: number;
  subscription_id: number;
  event_time: number;
  updates?: Record<string, string>;
}

/** POST /webhooks/strava: record, enqueue, answer fast (Strava wants < 2 s). */
export async function handleWebhook(c: pg.PoolClient, body: unknown): Promise<{ ok: true }> {
  const ev = body as StravaEvent;
  if (!ev || typeof ev.object_id !== 'number' || typeof ev.owner_id !== 'number') throw invalid('malformed event');
  const sub = env().STRAVA_SUBSCRIPTION_ID;
  if (!sub || ev.subscription_id !== sub) throw new HttpError(403, 'unauthorized', 'unknown subscription');
  const id = `${ev.object_type}:${ev.object_id}:${ev.aspect_type}:${ev.event_time}`;
  if (!(await recordEvent(c, 'strava', id, ev))) return { ok: true };
  if (ev.object_type === 'athlete' && ev.updates?.authorized === 'false') {
    await c.query("update public.connections set status = 'revoked' where provider = 'strava' and external_user_id = $1", [String(ev.owner_id)]);
    await c.query(
      "delete from private.connection_tokens where connection_id in (select id from public.connections where provider = 'strava' and external_user_id = $1)",
      [String(ev.owner_id)],
    );
  } else if (ev.object_type === 'activity') {
    await enqueue(c, ev.aspect_type === 'delete' ? 'strava.activity.delete' : 'strava.activity.import', { owner: String(ev.owner_id), activity: String(ev.object_id) }, {
      dedupeKey: `${ev.aspect_type === 'delete' ? 'del' : 'imp'}:${ev.object_id}:${ev.event_time}`,
    });
  }
  return { ok: true };
}

interface StravaActivity {
  id: number;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  timezone: string; // "(GMT+01:00) Europe/Brussels"
  elapsed_time: number;
  moving_time: number;
  distance: number;
  total_elevation_gain: number;
  average_heartrate?: number;
  map?: { summary_polyline?: string };
}

const SPORT: Record<string, 'run' | 'trail' | 'walk' | 'bike' | 'swim' | 'strength' | 'other'> = {
  Run: 'run',
  VirtualRun: 'run',
  TrailRun: 'trail',
  Walk: 'walk',
  Hike: 'walk',
  Ride: 'bike',
  VirtualRide: 'bike',
  GravelRide: 'bike',
  MountainBikeRide: 'bike',
  Swim: 'swim',
  WeightTraining: 'strength',
  Workout: 'strength',
};

/** Job: import one activity and match it to the planned session of its local day. */
export async function importActivity(c: pg.PoolClient, owner: string, activityId: string): Promise<{ userId: string; sessionId?: string } | null> {
  const conn = await one<{ id: string; user_id: string }>(c, "select id, user_id from public.connections where provider = 'strava' and external_user_id = $1 and status = 'active'", [owner]);
  if (!conn) return null; // athlete disconnected since: drop it
  const token = await accessToken(c, conn.id);
  const a = await json<StravaActivity>(await http(`${API}/activities/${encodeURIComponent(activityId)}`, { headers: { Authorization: `Bearer ${token}` } }), 'strava activity');
  const sport = SPORT[a.sport_type] ?? 'other';
  const tz = a.timezone.match(/\)\s*(.+)$/)?.[1] ?? 'UTC';
  const localDay = a.start_date_local.slice(0, 10);
  const existing = await one<{ id: string; session_id: string | null }>(c, "select id, session_id from public.activities where user_id = $1 and source = 'strava' and external_id = $2", [conn.user_id, String(a.id)]);
  let sessionId = existing?.session_id ?? undefined;
  if (!existing && (sport === 'run' || sport === 'trail')) {
    sessionId = (
      await one<{ id: string }>(
        c,
        `select s.id from public.sessions s join public.plans p on p.id = s.plan_id and p.status = 'active'
          where s.user_id = $1 and s.scheduled_on = $2 and s.status in ('planned','missed') and s.type <> 'rest'
            and not exists (select 1 from public.activities x where x.session_id = s.id)
          order by s.created_at limit 1`,
        [conn.user_id, localDay],
      )
    )?.id;
  }
  await c.query(
    `insert into public.activities (user_id, session_id, source, external_id, sport, started_at, timezone, duration_s, distance_m, elevation_gain_m, avg_hr, polyline)
     values ($1, $2, 'strava', $3, $4, $5, $6, $7, $8, $9, $10, $11)
     on conflict (user_id, source, external_id) where external_id is not null do update set
       sport = excluded.sport, started_at = excluded.started_at, duration_s = excluded.duration_s, distance_m = excluded.distance_m,
       elevation_gain_m = excluded.elevation_gain_m, avg_hr = excluded.avg_hr, polyline = excluded.polyline, updated_at = now()`,
    [conn.user_id, sessionId ?? null, String(a.id), sport, a.start_date, tz, Math.max(1, a.moving_time || a.elapsed_time), Math.round(a.distance), Math.round(a.total_elevation_gain), a.average_heartrate ? Math.round(a.average_heartrate) : null, a.map?.summary_polyline ?? null],
  );
  if (sessionId) await c.query("update public.sessions set status = 'done', completed_at = coalesce(completed_at, now()) where id = $1", [sessionId]);
  await c.query('update public.connections set last_synced_at = now() where id = $1', [conn.id]);
  return { userId: conn.user_id, sessionId };
}

export async function deleteActivity(c: pg.PoolClient, owner: string, activityId: string): Promise<void> {
  const rows = await many<{ session_id: string | null }>(
    c,
    `delete from public.activities a using public.connections k
      where k.provider = 'strava' and k.external_user_id = $1 and a.user_id = k.user_id and a.source = 'strava' and a.external_id = $2
      returning a.session_id`,
    [owner, activityId],
  );
  for (const r of rows) if (r.session_id) await c.query("update public.sessions set status = 'planned', completed_at = null where id = $1 and status = 'done'", [r.session_id]);
}

/** DELETE /connect/strava: revoke at Strava, then forget the tokens. */
export async function disconnect(c: pg.PoolClient, userId: string): Promise<void> {
  const conn = await one<{ id: string }>(c, "select id from public.connections where user_id = $1 and provider = 'strava'", [userId]);
  if (!conn) return;
  try {
    const token = await accessToken(c, conn.id);
    await http('https://www.strava.com/oauth/deauthorize', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } catch {
    // revoking is best effort; we delete our copy either way
  }
  await c.query('delete from public.connections where id = $1', [conn.id]);
}
