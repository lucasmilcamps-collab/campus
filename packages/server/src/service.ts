// One function per API method. Each runs inside a transaction (see router.ts)
// with the caller's user id, and every query is scoped to that id.

import {
  adapt,
  addDays,
  estimateLevel,
  generatePlan,
  isHard,
  mondayOf,
  overdue,
  PlanError,
  predictTime,
  previewPlan,
  zonesFromVma,
  type Adjustment,
  type Goal,
  type ISODate,
  type Plan,
  type Preview,
  type Session,
} from '@stride/engine';
import {
  FREE_GOALS,
  type Activity,
  type ActivityInput,
  type AdjustmentRow,
  type Connection,
  type Entitlement,
  type GoalInput,
  type LevelInfo,
  type OnboardingInput,
  type Race,
  type Settings,
  type User,
} from '@stride/contract';
import type pg from 'pg';
import { many, one } from './db';
import { HttpError, invalid, notFound } from './errors';
import { insertGoal, insertPlan, loadPlan, savePlanDiff, SESSION_SELECT, toSession, withUuids, type SessionRow } from './repo';

export interface Ctx {
  c: pg.PoolClient;
  userId: string;
  email: string;
  /** the runner's local calendar day (profiles.timezone) */
  today: ISODate;
  now: Date;
}

export function todayIn(timeZone: string, now = new Date()): ISODate {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

// ---------------------------------------------------------------- profile and level

export async function me(x: Ctx): Promise<User> {
  const p = await one<{ first_name: string | null; onboarding_completed_at: string | null }>(
    x.c,
    'select first_name, onboarding_completed_at from public.profiles where id = $1',
    [x.userId],
  );
  if (!p) throw notFound('Profil introuvable.');
  return { id: x.userId, email: x.email, firstName: p.first_name ?? undefined, onboarded: !!p.onboarding_completed_at };
}

export async function onboarding(x: Ctx, i: OnboardingInput): Promise<LevelInfo> {
  const lvl = estimateLevel({ ...i });
  const year = Number(x.today.slice(0, 4));
  await x.c.query(
    `update public.profiles set first_name = $2, birth_year = $3, sex = $4, onboarding_completed_at = coalesce(onboarding_completed_at, now())
      where id = $1`,
    [x.userId, i.firstName ?? null, year - i.age, i.sex],
  );
  await x.c.query(
    `insert into public.runner_profiles (user_id, experience, weekly_volume_km, runs_per_week_now, vma_kmh, pace_zones)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (user_id) do update set experience = excluded.experience, weekly_volume_km = excluded.weekly_volume_km,
       runs_per_week_now = excluded.runs_per_week_now, vma_kmh = excluded.vma_kmh, pace_zones = excluded.pace_zones`,
    [x.userId, i.experience, i.weeklyVolumeKm, i.runsPerWeekNow, lvl.vmaKmh, JSON.stringify(lvl.zones)],
  );
  const ref = i.recent ?? { distanceM: 10_000, durationS: predictTime(lvl.vmaKmh, 10_000) };
  await x.c.query('update public.reference_times set is_current = false where user_id = $1 and is_current', [x.userId]);
  await x.c.query(
    `insert into public.reference_times (user_id, source, distance_m, duration_s, measured_on) values ($1, $2, $3, $4, $5)`,
    [x.userId, i.recent ? 'race' : 'estimate', ref.distanceM, ref.durationS, x.today],
  );
  return { vmaKmh: lvl.vmaKmh, zones: lvl.zones, source: lvl.source, measuredOn: x.today };
}

export async function level(x: Ctx): Promise<LevelInfo | null> {
  const r = await one<{ vma_kmh: number | null; pace_zones: LevelInfo['zones']; source: string | null; measured_on: string | null }>(
    x.c,
    `select rp.vma_kmh, rp.pace_zones, rt.source, rt.measured_on
       from public.runner_profiles rp
       left join public.reference_times rt on rt.user_id = rp.user_id and rt.is_current
      where rp.user_id = $1`,
    [x.userId],
  );
  if (!r || !r.vma_kmh) return null;
  return { vmaKmh: r.vma_kmh, zones: r.pace_zones, source: r.source === 'estimate' || !r.source ? 'estimate' : 'race', measuredOn: r.measured_on ?? x.today };
}

async function runner(x: Ctx) {
  const r = await one<{ vma_kmh: number | null; weekly_volume_km: number; sessions_per_week: 3 | 4 | 5 }>(
    x.c,
    'select vma_kmh, weekly_volume_km, sessions_per_week from public.runner_profiles where user_id = $1',
    [x.userId],
  );
  if (!r?.vma_kmh) throw invalid('Termine le questionnaire avant de créer un plan.');
  return r as { vma_kmh: number; weekly_volume_km: number; sessions_per_week: 3 | 4 | 5 };
}

// ---------------------------------------------------------------- races (public)

type RaceRow = { id: string; name: string; race_date: string; city: string | null; distance_m: number; elevation_gain_m: number; discipline: 'road' | 'trail'; members: number };
const toRace = (r: RaceRow): Race => ({
  id: r.id,
  name: r.name,
  date: r.race_date,
  city: r.city ?? '',
  distanceM: r.distance_m,
  elevationGainM: r.elevation_gain_m,
  discipline: r.discipline,
  membersCount: r.members,
});
const RACE_SELECT = `select r.id, r.name, r.race_date, r.city, r.distance_m, r.elevation_gain_m, r.discipline,
  (select count(*) from public.goals g where g.race_id = r.id and g.status = 'active')::int as members
  from public.races r`;

export async function searchRaces(c: pg.PoolClient, today: ISODate, q: { text?: string; maxDistanceM?: number; discipline?: 'road' | 'trail' }): Promise<Race[]> {
  const rows = await many<RaceRow>(
    c,
    `${RACE_SELECT}
      where r.status = 'published' and r.race_date >= $1
        and ($2::text is null or r.search @@ plainto_tsquery('simple', $2) or r.name ilike '%' || $2 || '%' or r.city ilike '%' || $2 || '%')
        and ($3::int is null or r.distance_m <= $3)
        and ($4::text is null or r.discipline = $4)
      order by r.race_date limit 50`,
    [today, q.text || null, q.maxDistanceM ?? null, q.discipline ?? null],
  );
  return rows.map(toRace);
}

export async function race(c: pg.PoolClient, id: string): Promise<Race> {
  const r = await one<RaceRow>(c, `${RACE_SELECT} where r.id = $1 and r.status = 'published'`, [id]);
  if (!r) throw notFound('Course introuvable.');
  return toRace(r);
}

// ---------------------------------------------------------------- plans

const toGoal = (g: GoalInput): Goal => ({ kind: g.kind, distanceM: g.distanceM, date: g.date, targetTimeS: g.targetTimeS, surface: g.surface, name: g.name });

export async function preview(x: Ctx, goal: GoalInput): Promise<Preview> {
  const r = await runner(x);
  return previewPlan(toGoal(goal), x.today, r.vma_kmh, r.weekly_volume_km);
}

export async function entitled(x: Ctx): Promise<boolean> {
  const s = await one<{ tier: string; status: string; trial_ends_at: Date | null; current_period_ends_at: Date | null }>(
    x.c,
    'select tier, status, trial_ends_at, current_period_ends_at from public.subscriptions where user_id = $1',
    [x.userId],
  );
  if (!s || s.tier !== 'training') return false;
  if (s.status === 'trial') return !s.trial_ends_at || s.trial_ends_at > x.now;
  if (s.status === 'active' || s.status === 'grace' || s.status === 'cancelled') return !s.current_period_ends_at || s.current_period_ends_at > x.now;
  return false;
}

export async function createPlan(x: Ctx, i: { goal: GoalInput; sessionsPerWeek: 3 | 4 | 5 }): Promise<{ planId: string }> {
  const free = FREE_GOALS.includes(i.goal.kind);
  if (!free && !(await entitled(x))) throw new HttpError(402, 'paywall', 'Cet objectif fait partie de l’offre Entraînement.');
  const r = await runner(x);
  if (i.goal.raceId) {
    const rc = await one<{ name: string; race_date: string }>(x.c, "select name, race_date from public.races where id = $1 and status = 'published'", [i.goal.raceId]);
    if (!rc) throw notFound('Course introuvable.');
    i.goal.name ??= rc.name;
  }
  let plan: Plan;
  try {
    plan = withUuids(
      generatePlan({ id: 'new', goal: toGoal(i.goal), startDate: x.today, sessionsPerWeek: i.sessionsPerWeek, vmaKmh: r.vma_kmh, currentWeeklyKm: r.weekly_volume_km }),
    );
  } catch (e) {
    if (e instanceof PlanError) throw new HttpError(400, e.code === 'past_date' ? 'past_date' : 'too_short', e.message);
    throw e;
  }
  // one active plan and one active primary goal per runner
  await x.c.query("update public.plans set status = 'abandoned' where user_id = $1 and status = 'active'", [x.userId]);
  await x.c.query("update public.goals set status = 'abandoned' where user_id = $1 and status = 'active' and is_primary", [x.userId]);
  const goalId = await insertGoal(x.c, x.userId, i.goal);
  await insertPlan(x.c, x.userId, goalId, free ? 'free' : 'training', plan);
  await x.c.query('update public.runner_profiles set sessions_per_week = $2 where user_id = $1', [x.userId, plan.sessionsPerWeek]);
  return { planId: plan.id };
}

async function recordAdjustment(x: Ctx, planId: string, a: Adjustment, reason?: AdjustmentRow['reason'], feedbackId?: string): Promise<AdjustmentRow> {
  const r = await one<{ id: string; created_at: Date }>(
    x.c,
    `insert into public.plan_adjustments (user_id, plan_id, from_revision, to_revision, reason, trigger_feedback_id, pace_change_pct, summary, diff)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id, created_at`,
    [x.userId, planId, a.fromRevision, a.toRevision, reason ?? a.reason, feedbackId ?? null, a.paceChangePct, a.summary, JSON.stringify({ sessions: a.changedSessionIds })],
  );
  return { id: r!.id, createdAt: r!.created_at.toISOString(), summary: a.summary, paceChangePct: a.paceChangePct, reason: reason ?? a.reason, seen: false };
}

/** The "mark missed" job, also run on read: overdue sessions become missed;
 *  two or more lighten the coming week. Returns the plan after the sweep. */
export async function sweep(x: Ctx): Promise<Plan | null> {
  const p = await loadPlan(x.c, x.userId, { lock: true });
  if (!p) return null;
  const late = overdue(p, x.today);
  if (!late.length) return p;
  let after: Plan = { ...p, sessions: p.sessions.map((s) => (late.includes(s.id) ? { ...s, status: 'missed' as const } : s)) };
  let adj: Adjustment | null = null;
  if (late.length >= 2) {
    const r = adapt(after, { kind: 'missed', sessionIds: late }, x.today);
    after = r.plan;
    adj = r.adjustment;
  }
  await savePlanDiff(x.c, x.userId, p, after);
  if (adj) await recordAdjustment(x, p.id, adj);
  return after;
}

export async function plan(x: Ctx): Promise<Plan | null> {
  return sweep(x);
}

export async function abandonPlan(x: Ctx): Promise<void> {
  await x.c.query("update public.plans set status = 'abandoned' where user_id = $1 and status = 'active'", [x.userId]);
  await x.c.query("update public.goals set status = 'abandoned' where user_id = $1 and status = 'active' and is_primary", [x.userId]);
}

async function unseenAdjustments(x: Ctx): Promise<AdjustmentRow[]> {
  return (await adjustments(x)).filter((a) => !a.seen);
}

export async function week(x: Ctx, start: ISODate): Promise<{ sessions: Session[]; adjustments: AdjustmentRow[] }> {
  const p = await sweep(x);
  const from = mondayOf(start);
  const to = addDays(from, 6);
  return {
    sessions: p ? p.sessions.filter((s) => s.date >= from && s.date <= to) : [],
    adjustments: p ? await unseenAdjustments(x) : [],
  };
}

export async function session(x: Ctx, id: string): Promise<Session> {
  const r = await one<SessionRow>(x.c, `${SESSION_SELECT} where s.id = $1 and s.user_id = $2`, [id, x.userId]);
  if (!r) throw notFound('Séance introuvable.');
  return toSession(r);
}

async function lockedPlan(x: Ctx): Promise<Plan> {
  const p = await loadPlan(x.c, x.userId, { lock: true });
  if (!p) throw notFound('Tu n’as pas encore de plan.');
  return p;
}

export async function moveSession(x: Ctx, id: string, to: ISODate, force?: boolean): Promise<{ session?: Session; warnings: string[] }> {
  const p = await lockedPlan(x);
  const s = p.sessions.find((y) => y.id === id);
  if (!s) throw notFound('Séance introuvable.');
  if (to < x.today) throw invalid('Impossible de déplacer une séance dans le passé.');
  if (to > p.endDate) throw invalid('Impossible de déplacer une séance après ta course.');
  if (s.type === 'race') throw invalid('La course ne se déplace pas : change plutôt ton objectif.');
  if (s.status !== 'planned') throw invalid('Seule une séance prévue peut être déplacée.');
  const warnings: string[] = [];
  const near = p.sessions.filter((y) => y.id !== id && (y.date === addDays(to, -1) || y.date === addDays(to, 1)));
  if (isHard(s.type) && near.some((y) => isHard(y.type))) warnings.push('Deux séances intenses à la suite augmentent le risque de blessure.');
  if (p.sessions.some((y) => y.id !== id && y.date === to)) warnings.push('Il y a déjà une séance ce jour-là.');
  if (warnings.length && !force) return { warnings };
  const week = p.weeks.find((w) => w.startsOn === mondayOf(to));
  const moved = { ...s, date: to, weekIndex: week?.index ?? s.weekIndex };
  await savePlanDiff(x.c, x.userId, p, { ...p, sessions: p.sessions.map((y) => (y.id === id ? moved : y)) });
  return { session: moved, warnings };
}

export async function skipSession(x: Ctx, id: string): Promise<void> {
  const p = await lockedPlan(x);
  const s = p.sessions.find((y) => y.id === id);
  if (!s) throw notFound('Séance introuvable.');
  if (s.status !== 'planned') throw invalid('Cette séance n’est plus prévue.');
  await savePlanDiff(x.c, x.userId, p, { ...p, sessions: p.sessions.map((y) => (y.id === id ? { ...y, status: 'skipped' as const } : y)) });
}

// ---------------------------------------------------------------- activities and feedback

type ActivityRow = { id: string; session_id: string | null; source: Activity['source']; sport: Activity['sport']; started_at: Date; timezone: string; duration_s: number; distance_m: number; rpe: number | null; note: string | null };
const toActivity = (r: ActivityRow): Activity => ({
  id: r.id,
  sessionId: r.session_id ?? undefined,
  source: r.source,
  sport: r.sport,
  date: todayIn(r.timezone, r.started_at),
  durationS: r.duration_s,
  distanceM: r.distance_m,
  rpe: r.rpe ?? undefined,
  note: r.note ?? undefined,
});

async function profileTz(x: Ctx): Promise<string> {
  return (await one<{ timezone: string }>(x.c, 'select timezone from public.profiles where id = $1', [x.userId]))?.timezone ?? 'Europe/Paris';
}

/** Matches an activity to the planned session of the same local day, if any. */
export async function matchSession(x: Ctx, date: ISODate, sport: Activity['sport']): Promise<string | undefined> {
  if (sport !== 'run' && sport !== 'trail') return undefined;
  const r = await one<{ id: string }>(
    x.c,
    `select s.id from public.sessions s join public.plans p on p.id = s.plan_id and p.status = 'active'
      where s.user_id = $1 and s.scheduled_on = $2 and s.status in ('planned', 'missed') and s.type <> 'rest'
        and not exists (select 1 from public.activities a where a.session_id = s.id)
      order by s.created_at limit 1`,
    [x.userId, date],
  );
  return r?.id;
}

export async function logActivity(x: Ctx, i: ActivityInput): Promise<Activity & { matchedSessionId?: string }> {
  if (i.date > x.today) throw invalid('Impossible d’enregistrer une activité dans le futur.');
  let sessionId = i.sessionId;
  if (sessionId) {
    const s = await one<{ id: string }>(x.c, 'select id from public.sessions where id = $1 and user_id = $2', [sessionId, x.userId]);
    if (!s) throw notFound('Séance introuvable.');
    const taken = await one(x.c, 'select 1 from public.activities where session_id = $1', [sessionId]);
    if (taken) throw new HttpError(409, 'conflict', 'Cette séance a déjà une activité enregistrée.');
  } else {
    sessionId = await matchSession(x, i.date, i.sport);
  }
  const tz = await profileTz(x);
  // a manual entry has a day, not a time: store local noon so the day survives any zone
  const r = await one<ActivityRow>(
    x.c,
    `insert into public.activities (user_id, session_id, source, sport, started_at, timezone, duration_s, distance_m, rpe, note)
     values ($1, $2, $3, $4, ($5::date + time '12:00') at time zone $6, $6, $7, $8, $9, $10)
     returning id, session_id, source, sport, started_at, timezone, duration_s, distance_m, rpe, note`,
    [x.userId, sessionId ?? null, i.source, i.sport, i.date, tz, i.durationS, i.distanceM, i.rpe ?? null, i.note ?? null],
  );
  if (sessionId) await x.c.query("update public.sessions set status = 'done', completed_at = now() where id = $1 and user_id = $2", [sessionId, x.userId]);
  return { ...toActivity(r!), matchedSessionId: sessionId };
}

export async function activities(x: Ctx): Promise<Activity[]> {
  return (
    await many<ActivityRow>(
      x.c,
      `select id, session_id, source, sport, started_at, timezone, duration_s, distance_m, rpe, note
         from public.activities where user_id = $1 order by started_at desc limit 200`,
      [x.userId],
    )
  ).map(toActivity);
}

export async function submitFeedback(x: Ctx, i: { sessionId: string; rpe: 1 | 2 | 3 | 4 | 5; pain?: boolean; note?: string }): Promise<{ adjustment: AdjustmentRow | null }> {
  const p = await lockedPlan(x);
  if (!p.sessions.some((s) => s.id === i.sessionId)) throw notFound('Séance introuvable.');
  const fb = await one<{ id: string }>(
    x.c,
    `insert into public.feedback (user_id, session_id, rpe, pain, note) values ($1, $2, $3, $4, $5)
     on conflict (session_id) where session_id is not null do update set rpe = excluded.rpe, pain = excluded.pain, note = excluded.note
     returning id`,
    [x.userId, i.sessionId, i.rpe, !!i.pain, i.note ?? null],
  );
  const done: Plan = { ...p, sessions: p.sessions.map((s) => (s.id === i.sessionId && s.status !== 'done' ? { ...s, status: 'done' as const } : s)) };
  const r = adapt(done, { kind: 'feedback', sessionId: i.sessionId, rpe: i.rpe, pain: i.pain }, x.today);
  await savePlanDiff(x.c, x.userId, p, r.plan);
  if (r.plan.vmaKmh !== p.vmaKmh) {
    await x.c.query('update public.runner_profiles set vma_kmh = $2, pace_zones = $3 where user_id = $1', [x.userId, r.plan.vmaKmh, JSON.stringify(zonesFromVma(r.plan.vmaKmh))]);
  }
  return { adjustment: r.adjustment ? await recordAdjustment(x, p.id, r.adjustment, undefined, fb!.id) : null };
}

export async function feedbackFor(x: Ctx, sessionId: string): Promise<{ rpe: number; note?: string; pain?: boolean } | null> {
  const r = await one<{ rpe: number; note: string | null; pain: boolean }>(x.c, 'select rpe, note, pain from public.feedback where session_id = $1 and user_id = $2', [sessionId, x.userId]);
  return r ? { rpe: r.rpe, note: r.note ?? undefined, pain: r.pain } : null;
}

export async function adjustments(x: Ctx): Promise<AdjustmentRow[]> {
  const rows = await many<{ id: string; created_at: Date; summary: string; pace_change_pct: number | null; reason: AdjustmentRow['reason'] | 'goal_change' | 'new_reference'; seen_at: Date | null }>(
    x.c,
    `select a.id, a.created_at, a.summary, a.pace_change_pct, a.reason, a.seen_at
       from public.plan_adjustments a join public.plans p on p.id = a.plan_id and p.status = 'active'
      where a.user_id = $1 order by a.created_at desc limit 50`,
    [x.userId],
  );
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at.toISOString(),
    summary: r.summary,
    paceChangePct: r.pace_change_pct ?? 0,
    reason: r.reason === 'goal_change' || r.reason === 'new_reference' ? 'settings_change' : r.reason,
    seen: !!r.seen_at,
  }));
}

export async function markAdjustmentSeen(x: Ctx, id: string): Promise<void> {
  const r = await x.c.query('update public.plan_adjustments set seen_at = now() where id = $1 and user_id = $2', [id, x.userId]);
  if (!r.rowCount) throw notFound();
}

// ---------------------------------------------------------------- billing (read side; writes come from the RevenueCat webhook)

export async function entitlements(x: Ctx): Promise<Entitlement> {
  const s = await one<{ tier: 'free' | 'training'; status: string; period: 'month' | 'year' | null; trial_used: boolean; trial_ends_at: Date | null }>(
    x.c,
    'select tier, status, period, trial_used, trial_ends_at from public.subscriptions where user_id = $1',
    [x.userId],
  );
  if (!s) return { tier: 'free', status: 'none', trialUsed: false };
  const paid = await entitled(x);
  const status: Entitlement['status'] = !paid ? 'none' : s.status === 'trial' ? 'trial' : s.status === 'cancelled' ? 'cancelled' : 'active';
  return {
    tier: paid ? 'training' : 'free',
    status,
    trialUsed: s.trial_used,
    trialEndsAt: s.trial_ends_at ? todayIn('UTC', s.trial_ends_at) : undefined,
    period: s.period ?? undefined,
  };
}

// ---------------------------------------------------------------- settings

export async function settings(x: Ctx): Promise<Settings> {
  const r = await one<{ sessions_per_week: 3 | 4 | 5; nutrition_enabled: boolean; session_reminder: boolean }>(
    x.c,
    `select coalesce(rp.sessions_per_week, 4) as sessions_per_week, coalesce(rp.nutrition_enabled, false) as nutrition_enabled,
            coalesce(np.session_reminder, true) as session_reminder
       from public.profiles pr
       left join public.runner_profiles rp on rp.user_id = pr.id
       left join public.notification_prefs np on np.user_id = pr.id
      where pr.id = $1`,
    [x.userId],
  );
  return { sessionsPerWeek: r?.sessions_per_week ?? 4, nutritionEnabled: r?.nutrition_enabled ?? false, sessionReminder: r?.session_reminder ?? true };
}

export async function updateSettings(x: Ctx, patch: Partial<Settings>): Promise<{ settings: Settings; adjustment: AdjustmentRow | null }> {
  const before = await settings(x);
  if (patch.sessionsPerWeek !== undefined || patch.nutritionEnabled !== undefined) {
    await x.c.query(
      `update public.runner_profiles set sessions_per_week = coalesce($2, sessions_per_week), nutrition_enabled = coalesce($3, nutrition_enabled)
        where user_id = $1`,
      [x.userId, patch.sessionsPerWeek ?? null, patch.nutritionEnabled ?? null],
    );
  }
  if (patch.sessionReminder !== undefined) {
    await x.c.query(
      `insert into public.notification_prefs (user_id, session_reminder) values ($1, $2)
       on conflict (user_id) do update set session_reminder = excluded.session_reminder`,
      [x.userId, patch.sessionReminder],
    );
  }
  let adjustment: AdjustmentRow | null = null;
  const p = patch.sessionsPerWeek && patch.sessionsPerWeek !== before.sessionsPerWeek ? await loadPlan(x.c, x.userId, { lock: true }) : null;
  if (p && patch.sessionsPerWeek && p.goal.kind !== 'start_running' && p.goal.kind !== 'injury_return') {
    const r = await runner(x);
    const from = addDays(x.today, 1);
    const regen = withUuids(
      generatePlan({ id: 'regen', goal: p.goal, startDate: from, sessionsPerWeek: patch.sessionsPerWeek, vmaKmh: p.vmaKmh, currentWeeklyKm: r.weekly_volume_km }),
      p.id,
    );
    const offset = p.weeks.findIndex((w) => w.startsOn === mondayOf(from));
    const shift = Math.max(0, offset);
    const after: Plan = {
      ...p,
      sessionsPerWeek: patch.sessionsPerWeek,
      revision: p.revision + 1,
      weeks: p.weeks.map((w) => {
        const n = regen.weeks.find((rw) => rw.index + shift === w.index);
        return n && w.startsOn >= mondayOf(from) ? { ...w, targetVolumeKm: n.targetVolumeKm, phase: n.phase } : w;
      }),
      sessions: [
        ...p.sessions.filter((s) => s.date <= x.today || s.status !== 'planned'),
        ...regen.sessions.map((s) => ({ ...s, weekIndex: s.weekIndex + shift })),
      ],
    };
    await savePlanDiff(x.c, x.userId, p, after);
    adjustment = await recordAdjustment(
      x,
      p.id,
      { fromRevision: p.revision, toRevision: after.revision, reason: 'feedback', paceChangePct: 0, summary: `Ton plan passe à ${patch.sessionsPerWeek} séances par semaine à partir de demain.`, changedSessionIds: [] },
      'settings_change',
    );
  }
  return { settings: await settings(x), adjustment };
}

// ---------------------------------------------------------------- connections

export async function connections(x: Ctx): Promise<Connection[]> {
  const rows = await many<{ provider: Connection['provider']; status: string; last_synced_at: Date | null }>(
    x.c,
    "select provider, status, last_synced_at from public.connections where user_id = $1 and provider <> 'apple_health' order by provider",
    [x.userId],
  );
  return rows.filter((r) => r.status !== 'revoked').map((r) => ({ provider: r.provider, status: r.status === 'active' ? 'active' : 'error', lastSyncedAt: r.last_synced_at?.toISOString() }));
}

// ---------------------------------------------------------------- push, export

export async function registerPushToken(x: Ctx, token: string, platform: 'ios' | 'android'): Promise<void> {
  await x.c.query(
    `insert into public.push_tokens (user_id, expo_token, platform) values ($1, $2, $3)
     on conflict (expo_token) do update set user_id = excluded.user_id, platform = excluded.platform`,
    [x.userId, token, platform],
  );
}

/** GDPR export: everything we hold about the runner, without secrets. */
export async function exportData(x: Ctx): Promise<Record<string, unknown>> {
  const q = (sql: string) => many(x.c, sql, [x.userId]);
  return {
    exportedAt: x.now.toISOString(),
    profile: await q('select first_name, birth_year, sex, locale, timezone, units, created_at from public.profiles where id = $1'),
    runnerProfile: await q('select experience, weekly_volume_km, runs_per_week_now, sessions_per_week, difficulty, nutrition_enabled, vma_kmh, pace_zones from public.runner_profiles where user_id = $1'),
    referenceTimes: await q('select source, distance_m, duration_s, measured_on from public.reference_times where user_id = $1'),
    goals: await q('select kind, distance_m, goal_date, target_time_s, status, name from public.goals where user_id = $1'),
    plans: await q('select id, start_date, end_date, sessions_per_week, status, revision from public.plans where user_id = $1'),
    sessions: await q('select plan_id, scheduled_on, type, title, status from public.sessions where user_id = $1 order by scheduled_on'),
    activities: await q('select source, sport, started_at, duration_s, distance_m, elevation_gain_m, avg_hr, rpe, note from public.activities where user_id = $1'),
    feedback: await q('select session_id, rpe, pain, note, created_at from public.feedback where user_id = $1'),
    adjustments: await q('select summary, reason, created_at from public.plan_adjustments where user_id = $1'),
    connections: await q('select provider, status, created_at from public.connections where user_id = $1'),
    subscription: await q('select tier, status, period, store, trial_ends_at, current_period_ends_at from public.subscriptions where user_id = $1'),
  };
}
