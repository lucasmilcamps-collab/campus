// The app's HTTP client (http.ts) against the real API (apps/api, next start)
// and a migrated database. Supabase Auth is the only stand-in: a stub client
// that hands out test tokens signed the way Supabase signs them.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { SignJWT } from 'jose';
import { addDays } from '@stride/engine';

vi.mock('expo-linking', () => ({ createURL: (p: string) => `stride://${p}` }));
vi.mock('expo-web-browser', () => ({ openAuthSessionAsync: async () => ({ type: 'cancel' }) }));

const { createHttpApi } = await import('./http');
const { ApiError } = await import('./api');

const SECRET = 'contract-jwt-secret-contract-jwt-secret-01';
const PORT = 3200;
let server: ChildProcess;

async function tokenFor(email: string) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const { rows } = await c.query('insert into auth.users (email) values ($1) returning id', [email]);
  await c.end();
  return new SignJWT({ email, role: 'authenticated' }).setProtectedHeader({ alg: 'HS256' }).setSubject(rows[0].id).setAudience('authenticated').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(SECRET));
}

const stubSupabase = (token: string | null) =>
  ({ auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }), signOut: async () => ({ error: null }) } }) as never;

beforeAll(async () => {
  server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
    cwd: new URL('../../../api', import.meta.url).pathname,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', SUPABASE_JWT_SECRET: SECRET, APP_SECRET: 'contract-app-secret-contract-app-secret-01', TOKEN_ENC_KEY: randomBytes(32).toString('base64'), CRON_SECRET: 'contract-cron-0123456' },
    stdio: 'ignore',
    detached: true,
  });
  for (let i = 0; i < 120; i++) {
    try {
      await fetch(`http://localhost:${PORT}/api/races`);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error('api did not start');
});

afterAll(() => {
  try {
    process.kill(-server.pid!, 'SIGTERM');
  } catch {}
});

describe('the app client and the API agree', () => {
  it('signed out: me() is null and calls fail as unauthorized', async () => {
    const api = createHttpApi(`http://localhost:${PORT}`, stubSupabase(null));
    expect(await api.me()).toBeNull();
    await expect(api.plan()).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('the whole loop through the client: onboarding, free plan, week, feedback, settings', async () => {
    const api = createHttpApi(`http://localhost:${PORT}`, stubSupabase(await tokenFor('client@example.com')));
    expect(await api.me()).toMatchObject({ onboarded: false });
    const lvl = await api.onboarding({ age: 40, sex: 'undisclosed', experience: 'none', weeklyVolumeKm: 0, runsPerWeekNow: 0 });
    expect(lvl.source).toBe('estimate');

    const today = new Date().toISOString().slice(0, 10);
    const goal = { kind: 'start_running' as const, distanceM: 5000, date: addDays(today, 55) };
    expect((await api.previewPlan(goal)).weeks).toBeGreaterThanOrEqual(8);
    await api.createPlan({ goal, sessionsPerWeek: 3 });
    const plan = (await api.plan())!;
    expect(plan.sessions.length).toBeGreaterThan(20);

    const first = plan.sessions[0];
    const wk = await api.week(first.date);
    expect(wk.sessions.map((s) => s.id)).toContain(first.id);
    expect((await api.session(first.id)).title).toBe(first.title);

    const r = await api.submitFeedback({ sessionId: first.id, rpe: 3, note: 'ok' });
    expect(r.adjustment).toBeNull();
    expect(await api.feedbackFor(first.id)).toMatchObject({ rpe: 3, note: 'ok' });

    const s = await api.updateSettings({ sessionReminder: false });
    expect(s.settings.sessionReminder).toBe(false);
    expect(await api.entitlements()).toMatchObject({ tier: 'free' });
    expect(await api.connections()).toEqual([]);
  });

  it('server errors arrive as ApiError with the server’s code and French message', async () => {
    const api = createHttpApi(`http://localhost:${PORT}`, stubSupabase(await tokenFor('paywall@example.com')));
    await api.onboarding({ age: 30, sex: 'male', experience: '1_3y', weeklyVolumeKm: 20, runsPerWeekNow: 3 });
    const e = await api.createPlan({ goal: { kind: 'race', distanceM: 21097, date: '2027-06-13' }, sessionsPerWeek: 4 }).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.code).toBe('paywall');
    expect(e.message).toMatch(/offre Entraînement/);
    await expect(api.purchase('year')).rejects.toMatchObject({ code: 'invalid' });
  });

  it('public race search works without a session', async () => {
    const api = createHttpApi(`http://localhost:${PORT}`, stubSupabase(null));
    const races = await api.searchRaces({ text: 'citadelle' });
    expect(races[0]).toMatchObject({ name: 'Semi de la Citadelle', distanceM: 21097 });
    expect((await api.race(races[0].id)).city).toBe('Namur');
  });
});
