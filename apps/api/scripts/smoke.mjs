// HTTP smoke test of the running API (next start) against a migrated, seeded DB.
//   scripts/test-db.sh bash -c 'psql "$DATABASE_URL" -f supabase/seed.sql && node apps/api/scripts/smoke.mjs'
// Starts the server itself with test secrets; exits 1 on any failed check.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pg = require('pg');
const { SignJWT } = require('jose');

const env = {
  ...process.env,
  NEXT_TELEMETRY_DISABLED: '1',
  SUPABASE_JWT_SECRET: 'smoke-jwt-secret-smoke-jwt-secret-012345',
  APP_SECRET: 'smoke-app-secret-smoke-app-secret-012345',
  TOKEN_ENC_KEY: randomBytes(32).toString('base64'),
  CRON_SECRET: 'smoke-cron-secret-0123',
  API_URL: 'http://localhost:3100',
};
const base = 'http://localhost:3100/api';
const server = spawn('npx', ['next', 'start', '-p', '3100'], { cwd: new URL('..', import.meta.url).pathname, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
let log = '';
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));
const fails = [];
const check = (name, cond, extra = '') => (cond ? console.log('  ✓', name) : fails.push(`${name} ${extra}`));

try {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`${base}/races`);
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const { rows } = await db.query("insert into auth.users (email) values ('smoke@example.com') returning id");
  await db.end();
  const token = await new SignJWT({ email: 'smoke@example.com', role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' }).setSubject(rows[0].id).setAudience('authenticated').setIssuedAt().setExpirationTime('1h')
    .sign(new TextEncoder().encode(env.SUPABASE_JWT_SECRET));
  const auth = { authorization: `Bearer ${token}` };

  let r = await fetch(`${base}/races?text=citadelle`);
  const races = await r.json();
  check('public race search over HTTP', r.status === 200 && races[0]?.name === 'Semi de la Citadelle', JSON.stringify(races).slice(0, 120));
  check('responses are not cached', r.headers.get('cache-control') === 'no-store');
  r = await fetch(`${base}/me`);
  check('no token: 401 with a JSON error', r.status === 401 && (await r.json()).error.code === 'unauthorized');
  r = await fetch(`${base}/me`, { headers: auth });
  check('token: 200', r.status === 200 && (await r.json()).onboarded === false);
  r = await fetch(`${base}/onboarding`, { method: 'POST', headers: { ...auth, 'content-type': 'text/plain' }, body: '{}' });
  check('non-JSON body refused (415)', r.status === 415);
  r = await fetch(`${base}/onboarding`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: '{bad' });
  check('malformed JSON refused (400)', r.status === 400);
  r = await fetch(`${base}/onboarding`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ age: 30, sex: 'male', experience: 'none', weeklyVolumeKm: 0, runsPerWeekNow: 0 }),
  });
  check('onboarding over HTTP', r.status === 200 && (await r.json()).source === 'estimate');
  const start = new Date().toISOString().slice(0, 10);
  r = await fetch(`${base}/plans`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ goal: { kind: 'start_running', distanceM: 5000, date: new Date(Date.now() + 55 * 864e5).toISOString().slice(0, 10) }, sessionsPerWeek: 3 }),
  });
  check('free programme created without paywall', r.status === 200, String(r.status));
  r = await fetch(`${base}/week?start=${start}`, { headers: auth });
  const wk = await r.json();
  check('week over HTTP', r.status === 200 && Array.isArray(wk.sessions));
  r = await fetch(`${base}/cron/cleanup`);
  check('cron without secret: 401', r.status === 401);
  r = await fetch(`${base}/cron/cleanup`, { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
  check('cron with secret: 200', r.status === 200);
  r = await fetch(`${base}/connect/strava/start`, { method: 'POST', headers: auth });
  check('Strava without keys says it is unavailable (503)', r.status === 503);
  check('no stack traces or secrets in server output', !/SECRET|at .*\.ts:\d+/.test(log), log.slice(-300));
} catch (e) {
  fails.push(`smoke crashed: ${e.message}`);
} finally {
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {}
}
if (fails.length) {
  console.log('FAILED\n' + fails.join('\n') + '\n--- server log ---\n' + log.slice(-1500));
  process.exit(1);
}
console.log('api smoke: all checks passed');
process.exit(0);
