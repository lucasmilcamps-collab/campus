// The whole HTTP surface in one table: method, path, who may call it, what it
// accepts. Framework-free; apps/api adapts Next.js requests to `handle`.

import { timingSafeEqual } from 'node:crypto';
import { z, ZodError } from 'zod';
import {
  ActivityInput,
  CreatePlanInput,
  DeleteAccountInput,
  FeedbackInput,
  MoveInput,
  OnboardingInput,
  PreviewInput,
  ProviderParam,
  PushTokenInput,
  RaceQuery,
  SettingsPatch,
  WeekQuery,
  type ErrorBody,
} from '@stride/contract';
import type pg from 'pg';
import { verifyAccessToken } from './auth';
import { db, one, tx } from './db';
import { env } from './env';
import { HttpError } from './errors';
import { rateLimit } from './ratelimit';
import * as svc from './service';
import * as strava from './strava';
import { handleRevenueCatWebhook, syncSubscriber } from './billing';
import { cleanup, drain, markMissed, onJob, sessionReminders, trialEnding } from './jobs';
import { deleteAccount } from './account';

export interface Req {
  method: string;
  path: string; // without the /api prefix
  query: URLSearchParams;
  headers: { get(name: string): string | null };
  body: unknown;
  ip?: string;
}

export interface Res {
  status: number;
  body?: unknown;
  redirect?: string;
  headers?: Record<string, string>;
}

type Params = Record<string, string>;
type UserHandler = (x: svc.Ctx, p: Params, r: Req) => Promise<unknown>;

interface Route {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  auth: 'user' | 'public' | 'cron' | 'webhook';
  /** per-user (or per-IP for public) requests per minute */
  limit?: number;
  run: UserHandler | ((p: Params, r: Req) => Promise<unknown>);
}

const id = z.uuid();
const parse = <T>(schema: z.ZodType<T>, v: unknown): T => schema.parse(v);
const q = (r: Req) => Object.fromEntries(r.query.entries());

// ---------------------------------------------------------------- the table

export const routes: Route[] = [
  // profile, level (F01, F09)
  { method: 'GET', path: '/me', auth: 'user', run: (x: svc.Ctx) => svc.me(x) },
  { method: 'POST', path: '/onboarding', auth: 'user', limit: 20, run: (x: svc.Ctx, _p: Params, r: Req) => svc.onboarding(x, parse(OnboardingInput, r.body)) },
  { method: 'GET', path: '/me/level', auth: 'user', run: (x: svc.Ctx) => svc.level(x) },
  { method: 'GET', path: '/me/export', auth: 'user', limit: 5, run: (x: svc.Ctx) => svc.exportData(x) },
  { method: 'DELETE', path: '/me', auth: 'user', limit: 5, run: async (x: svc.Ctx, _p: Params, r: Req) => (parse(DeleteAccountInput, r.body), deleteAccount(x)) },

  // races (public, F02)
  { method: 'GET', path: '/races', auth: 'public', limit: 120, run: (_p: Params, r: Req) => withDb((c) => svc.searchRaces(c, new Date().toISOString().slice(0, 10), parse(RaceQuery, q(r)))) },
  { method: 'GET', path: '/races/:id', auth: 'public', limit: 120, run: (p: Params) => withDb((c) => svc.race(c, parse(id, p.id))) },

  // plans (F02)
  { method: 'POST', path: '/plans/preview', auth: 'user', limit: 60, run: (x: svc.Ctx, _p: Params, r: Req) => svc.preview(x, parse(PreviewInput, r.body).goal) },
  { method: 'POST', path: '/plans', auth: 'user', limit: 10, run: (x: svc.Ctx, _p: Params, r: Req) => svc.createPlan(x, parse(CreatePlanInput, r.body)) },
  { method: 'GET', path: '/plans/current', auth: 'user', run: (x: svc.Ctx) => svc.plan(x) },
  { method: 'POST', path: '/plans/current/abandon', auth: 'user', limit: 10, run: (x: svc.Ctx) => svc.abandonPlan(x) },

  // the week (F03-F06)
  { method: 'GET', path: '/week', auth: 'user', run: (x: svc.Ctx, _p: Params, r: Req) => svc.week(x, parse(WeekQuery, q(r)).start) },
  { method: 'GET', path: '/sessions/:id', auth: 'user', run: (x: svc.Ctx, p: Params) => svc.session(x, parse(id, p.id)) },
  { method: 'GET', path: '/sessions/:id/feedback', auth: 'user', run: (x: svc.Ctx, p: Params) => svc.feedbackFor(x, parse(id, p.id)) },
  {
    method: 'POST',
    path: '/sessions/:id/move',
    auth: 'user',
    limit: 30,
    run: (x: svc.Ctx, p: Params, r: Req) => {
      const b = parse(MoveInput, r.body);
      return svc.moveSession(x, parse(id, p.id), b.to, b.force);
    },
  },
  { method: 'POST', path: '/sessions/:id/skip', auth: 'user', limit: 30, run: (x: svc.Ctx, p: Params) => svc.skipSession(x, parse(id, p.id)) },
  { method: 'POST', path: '/activities', auth: 'user', limit: 30, run: (x: svc.Ctx, _p: Params, r: Req) => svc.logActivity(x, parse(ActivityInput, r.body)) },
  { method: 'GET', path: '/activities', auth: 'user', run: (x: svc.Ctx) => svc.activities(x) },
  { method: 'POST', path: '/feedback', auth: 'user', limit: 30, run: (x: svc.Ctx, _p: Params, r: Req) => svc.submitFeedback(x, parse(FeedbackInput, r.body)) },
  { method: 'GET', path: '/adjustments', auth: 'user', run: (x: svc.Ctx) => svc.adjustments(x) },
  { method: 'POST', path: '/adjustments/:id/seen', auth: 'user', run: (x: svc.Ctx, p: Params) => svc.markAdjustmentSeen(x, parse(id, p.id)) },

  // billing, settings, push
  { method: 'GET', path: '/entitlements', auth: 'user', run: (x: svc.Ctx) => svc.entitlements(x) },
  {
    method: 'POST',
    path: '/entitlements/refresh',
    auth: 'user',
    limit: 10,
    run: async (x: svc.Ctx) => (await syncSubscriber(x.c, x.userId, x.now), svc.entitlements(x)),
  },
  { method: 'GET', path: '/settings', auth: 'user', run: (x: svc.Ctx) => svc.settings(x) },
  { method: 'PATCH', path: '/settings', auth: 'user', limit: 30, run: (x: svc.Ctx, _p: Params, r: Req) => svc.updateSettings(x, parse(SettingsPatch, r.body)) },
  {
    method: 'POST',
    path: '/push-tokens',
    auth: 'user',
    limit: 10,
    run: (x: svc.Ctx, _p: Params, r: Req) => {
      const b = parse(PushTokenInput, r.body);
      return svc.registerPushToken(x, b.token, b.platform);
    },
  },

  // connections (F08)
  { method: 'GET', path: '/connections', auth: 'user', run: (x: svc.Ctx) => svc.connections(x) },
  {
    method: 'POST',
    path: '/connect/:provider/start',
    auth: 'user',
    limit: 10,
    run: async (x: svc.Ctx, p: Params) => {
      const provider = parse(ProviderParam, p.provider);
      if (provider !== 'strava') throw new HttpError(501, 'invalid', 'Cette montre arrive bientôt.');
      return { url: await strava.startUrl(x.userId) };
    },
  },
  {
    method: 'DELETE',
    path: '/connect/:provider',
    auth: 'user',
    limit: 10,
    run: async (x: svc.Ctx, p: Params) => {
      const provider = parse(ProviderParam, p.provider);
      if (provider === 'strava') await strava.disconnect(x.c, x.userId);
      else await x.c.query('delete from public.connections where user_id = $1 and provider = $2', [x.userId, provider]);
    },
  },
  {
    method: 'GET',
    path: '/connect/strava/callback',
    auth: 'public',
    limit: 30,
    run: async (_p: Params, r: Req) => ({ __redirect: await tx((c) => strava.callback(c, r.query)) }),
  },

  // webhooks in
  { method: 'POST', path: '/webhooks/revenuecat', auth: 'webhook', run: (_p: Params, r: Req) => tx((c) => handleRevenueCatWebhook(c, r.headers.get('authorization'), r.body)) },
  { method: 'GET', path: '/webhooks/strava', auth: 'webhook', run: async (_p: Params, r: Req) => strava.verifySubscription(r.query) },
  { method: 'POST', path: '/webhooks/strava', auth: 'webhook', run: (_p: Params, r: Req) => tx((c) => strava.handleWebhook(c, r.body)) },

  // scheduled tasks (Vercel Cron or any scheduler, with CRON_SECRET)
  { method: 'POST', path: '/cron/drain', auth: 'cron', run: () => drain() },
  { method: 'POST', path: '/cron/mark-missed', auth: 'cron', run: async () => ({ users: await markMissed() }) },
  { method: 'POST', path: '/cron/reminders', auth: 'cron', run: async () => ({ queued: await sessionReminders() }) },
  { method: 'POST', path: '/cron/trial-ending', auth: 'cron', run: async () => ({ queued: await trialEnding() }) },
  { method: 'POST', path: '/cron/cleanup', auth: 'cron', run: async () => (await cleanup(), { ok: true }) },
];

onJob('strava.activity.import', async (c, p) => {
  await strava.importActivity(c, p.owner, p.activity);
});
onJob('strava.activity.delete', (c, p) => strava.deleteActivity(c, p.owner, p.activity));

// ---------------------------------------------------------------- dispatch

function match(path: string, pattern: string): Params | null {
  const a = path.replace(/\/+$/, '').split('/');
  const b = pattern.split('/');
  if (a.length !== b.length) return null;
  const params: Params = {};
  for (let i = 0; i < b.length; i++) {
    if (b[i].startsWith(':')) params[b[i].slice(1)] = decodeURIComponent(a[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

async function withDb<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await db().connect();
  try {
    return await fn(c);
  } finally {
    c.release();
  }
}

function checkCron(r: Req) {
  const got = Buffer.from(r.headers.get('authorization') ?? '');
  const want = Buffer.from(`Bearer ${env().CRON_SECRET}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new HttpError(401, 'unauthorized', 'cron secret required');
}

function errorBody(code: ErrorBody['error']['code'], message: string): ErrorBody {
  return { error: { code, message } };
}

export async function handle(r: Req, now = () => new Date()): Promise<Res> {
  // exact paths win over :params (/connect/strava/callback before /connect/:provider)
  const candidates = routes.filter((rt) => rt.method === r.method).map((rt) => ({ rt, p: match(r.path, rt.path) })).filter((x) => x.p);
  candidates.sort((a, b) => (a.rt.path.includes(':') ? 1 : 0) - (b.rt.path.includes(':') ? 1 : 0));
  const hit = candidates[0];
  if (!hit) {
    const anyMethod = routes.some((rt) => match(r.path, rt.path));
    return { status: anyMethod ? 405 : 404, body: errorBody('not_found', anyMethod ? 'Méthode non autorisée.' : 'Route inconnue.') };
  }
  const { rt, p } = hit;
  try {
    let out: unknown;
    if (rt.auth === 'user') {
      const user = await verifyAccessToken(r.headers.get('authorization'));
      // counted outside the request's transaction, so failed requests count too
      if (rt.limit) await rateLimit(db(), `${rt.method}${rt.path}:u:${user.id}`, rt.limit, 60);
      out = await tx(async (c) => {
        // the auth trigger creates the profile; this covers users created before it
        // existed. A token for a deleted account finds no auth user: 401, not a new row.
        await c.query('insert into public.profiles (id) select id from auth.users where id = $1 on conflict do nothing', [user.id]);
        const prof = await one<{ timezone: string }>(c, 'select timezone from public.profiles where id = $1', [user.id]);
        if (!prof) throw new HttpError(401, 'unauthorized', 'Ce compte n’existe plus.');
        const tz = prof.timezone;
        const t = now();
        return (rt.run as UserHandler)({ c, userId: user.id, email: user.email, now: t, today: svc.todayIn(tz, t) }, p!, r);
      });
    } else {
      if (rt.auth === 'cron') checkCron(r);
      if (rt.auth === 'public' && rt.limit && r.ip) await rateLimit(db(), `${rt.method}${rt.path}:ip:${r.ip}`, rt.limit, 60);
      out = await (rt.run as (p: Params, r: Req) => Promise<unknown>)(p!, r);
    }
    if (out && typeof out === 'object' && '__redirect' in out) return { status: 302, redirect: (out as { __redirect: string }).__redirect };
    return { status: out === undefined ? 204 : 200, body: out === undefined ? undefined : out };
  } catch (e) {
    if (e instanceof HttpError) return { status: e.status, body: errorBody(e.code, e.message) };
    if (e instanceof ZodError) {
      const i = e.issues[0];
      return { status: 400, body: errorBody('invalid', `${i.path.join('.') || 'requête'} : ${i.message}`) };
    }
    if ((e as { code?: string }).code === '23505') return { status: 409, body: errorBody('conflict', 'Ça existe déjà.') };
    // route and message only: never bodies, tokens or user data
    console.error(`[api] ${r.method} ${rt.path} failed: ${(e as Error).message}`);
    return { status: 500, body: errorBody('network', 'Erreur du serveur. Réessaie dans un instant.') };
  }
}

