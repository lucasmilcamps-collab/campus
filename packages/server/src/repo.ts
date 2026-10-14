// Engine Plan <-> database rows. Every read and write is scoped to a user id:
// the server connects with a role that bypasses RLS, so this file *is* the
// access rule for plan data (RLS stays on as a second line for direct reads).

import { randomUUID } from 'node:crypto';
import type { Goal, Plan, Session, Week } from '@stride/engine';
import type { GoalInput } from '@stride/contract';
import { many, one, type Db } from './db';

interface PlanRow {
  id: string;
  goal_id: string;
  tier: 'free' | 'training';
  start_date: string;
  end_date: string;
  sessions_per_week: 3 | 4 | 5;
  engine_version: string;
  revision: number;
  vma_kmh: number;
  zones: Plan['zones'];
  kind: Goal['kind'];
  distance_m: number;
  goal_date: string;
  target_time_s: number | null;
  surface: 'road' | 'trail';
  goal_name: string | null;
}

export async function loadPlan(c: Db, userId: string, opts: { lock?: boolean } = {}): Promise<Plan | null> {
  const p = await one<PlanRow>(
    c,
    `select p.id, p.goal_id, p.tier, p.start_date, p.end_date, p.sessions_per_week, p.engine_version, p.revision,
            p.vma_kmh, p.zones, g.kind, g.distance_m, g.goal_date, g.target_time_s, g.surface,
            coalesce(g.name, r.name) as goal_name
       from public.plans p
       join public.goals g on g.id = p.goal_id and g.user_id = p.user_id
       left join public.races r on r.id = g.race_id
      where p.user_id = $1 and p.status = 'active'
      ${opts.lock ? 'for update of p' : ''}`,
    [userId],
  );
  if (!p) return null;
  const weeks = await many<{ week_index: number; starts_on: string; phase: Week['phase']; target_volume_km: number }>(
    c,
    'select week_index, starts_on, phase, target_volume_km from public.plan_weeks where plan_id = $1 order by week_index',
    [p.id],
  );
  const sessions = await many<SessionRow>(c, `${SESSION_SELECT} where s.plan_id = $1 and s.user_id = $2 order by s.scheduled_on, s.created_at`, [p.id, userId]);
  return {
    id: p.id,
    goal: {
      kind: p.kind,
      distanceM: p.distance_m,
      date: p.goal_date ?? p.end_date,
      targetTimeS: p.target_time_s ?? undefined,
      surface: p.surface,
      name: p.goal_name ?? undefined,
    },
    startDate: p.start_date,
    endDate: p.end_date,
    sessionsPerWeek: p.sessions_per_week,
    vmaKmh: p.vma_kmh,
    zones: p.zones,
    revision: p.revision,
    engineVersion: p.engine_version,
    weeks: weeks.map((w) => ({ index: w.week_index, startsOn: w.starts_on, phase: w.phase, targetVolumeKm: w.target_volume_km })),
    sessions: sessions.map(toSession),
  };
}

export interface SessionRow {
  id: string;
  week_index: number;
  scheduled_on: string;
  original_on: string;
  type: Session['type'];
  title: string;
  purpose: string | null;
  steps: Session['steps'];
  est_duration_s: number;
  est_distance_m: number;
  status: Session['status'];
}

export const SESSION_SELECT = `select s.id, w.week_index, s.scheduled_on, s.original_on, s.type, s.title, s.purpose, s.steps,
  s.est_duration_s, s.est_distance_m, s.status
  from public.sessions s join public.plan_weeks w on w.id = s.week_id`;

export function toSession(r: SessionRow): Session {
  return {
    id: r.id,
    weekIndex: r.week_index,
    date: r.scheduled_on,
    originalDate: r.original_on,
    type: r.type,
    title: r.title,
    purpose: r.purpose ?? '',
    steps: r.steps,
    estDurationS: r.est_duration_s,
    estDistanceM: r.est_distance_m,
    status: r.status,
  };
}

/** Engine ids are readable strings; database ids are uuids. */
export function withUuids(plan: Plan, planId: string = randomUUID()): Plan {
  return { ...plan, id: planId, sessions: plan.sessions.map((s) => ({ ...s, id: randomUUID() })) };
}

export async function insertGoal(c: Db, userId: string, g: GoalInput): Promise<string> {
  const r = await one<{ id: string }>(
    c,
    `insert into public.goals (user_id, kind, race_id, distance_m, elevation_gain_m, surface, goal_date, target_time_s, is_primary, name)
     values ($1, $2, $3, $4, $5, $6, $7, $8, true, $9) returning id`,
    [userId, g.kind, g.raceId ?? null, g.distanceM, g.elevationGainM ?? 0, g.surface ?? 'road', g.date, g.targetTimeS ?? null, g.name ?? null],
  );
  return r!.id;
}

/** Inserts a freshly generated plan (ids already uuids). */
export async function insertPlan(c: Db, userId: string, goalId: string, tier: 'free' | 'training', plan: Plan): Promise<void> {
  await c.query(
    `insert into public.plans (id, user_id, goal_id, tier, start_date, end_date, sessions_per_week, engine_version, revision, vma_kmh, zones)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [plan.id, userId, goalId, tier, plan.startDate, plan.endDate, plan.sessionsPerWeek, plan.engineVersion, plan.revision, plan.vmaKmh, JSON.stringify(plan.zones)],
  );
  const weekIds = await insertWeeks(c, plan.id, plan.weeks);
  for (const s of plan.sessions) await insertSession(c, userId, plan.id, weekIds.get(s.weekIndex)!, s);
}

async function insertWeeks(c: Db, planId: string, weeks: Week[]): Promise<Map<number, string>> {
  const ids = new Map<number, string>();
  for (const w of weeks) {
    const r = await one<{ id: string }>(
      c,
      `insert into public.plan_weeks (plan_id, week_index, starts_on, phase, target_volume_km) values ($1, $2, $3, $4, $5)
       on conflict (plan_id, week_index) do update set phase = excluded.phase, target_volume_km = excluded.target_volume_km
       returning id`,
      [planId, w.index, w.startsOn, w.phase, w.targetVolumeKm],
    );
    ids.set(w.index, r!.id);
  }
  return ids;
}

async function insertSession(c: Db, userId: string, planId: string, weekId: string, s: Session) {
  await c.query(
    `insert into public.sessions (id, user_id, plan_id, week_id, scheduled_on, original_on, type, title, purpose, steps,
                                  est_duration_s, est_distance_m, status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [s.id, userId, planId, weekId, s.date, s.originalDate, s.type, s.title, s.purpose, JSON.stringify(s.steps), s.estDurationS, s.estDistanceM, s.status],
  );
}

const SESSION_FIELDS = ['date', 'type', 'title', 'purpose', 'steps', 'estDurationS', 'estDistanceM', 'status', 'weekIndex'] as const;
const changed = (a: Session, b: Session) => SESSION_FIELDS.some((f) => JSON.stringify(a[f]) !== JSON.stringify(b[f]));

/** Writes whatever the engine changed between `before` and `after`. One code
 *  path for adaptation, moves, skips and regeneration. Caller holds the plan lock. */
export async function savePlanDiff(c: Db, userId: string, before: Plan, after: Plan): Promise<void> {
  await c.query(
    `update public.plans set revision = $3, vma_kmh = $4, zones = $5, sessions_per_week = $6
      where id = $1 and user_id = $2`,
    [after.id, userId, after.revision, after.vmaKmh, JSON.stringify(after.zones), after.sessionsPerWeek],
  );
  const weekChanged = after.weeks.filter((w) => {
    const b = before.weeks.find((x) => x.index === w.index);
    return !b || b.targetVolumeKm !== w.targetVolumeKm || b.phase !== w.phase;
  });
  const weekIds = new Map((await many<{ id: string; week_index: number }>(c, 'select id, week_index from public.plan_weeks where plan_id = $1', [after.id])).map((w) => [w.week_index, w.id]));
  if (weekChanged.length) for (const [k, v] of await insertWeeks(c, after.id, weekChanged)) weekIds.set(k, v);

  const old = new Map(before.sessions.map((s) => [s.id, s]));
  const keep = new Set(after.sessions.map((s) => s.id));
  for (const s of before.sessions) {
    if (!keep.has(s.id)) await c.query('delete from public.sessions where id = $1 and user_id = $2', [s.id, userId]);
  }
  for (const s of after.sessions) {
    const b = old.get(s.id);
    if (!b) {
      await insertSession(c, userId, after.id, weekIds.get(s.weekIndex)!, s);
    } else if (changed(b, s)) {
      await c.query(
        `update public.sessions set scheduled_on = $3, type = $4, title = $5, purpose = $6, steps = $7,
                est_duration_s = $8, est_distance_m = $9, status = $10, week_id = $11,
                completed_at = case when $10 = 'done' then coalesce(completed_at, now()) else completed_at end
          where id = $1 and user_id = $2`,
        [s.id, userId, s.date, s.type, s.title, s.purpose, JSON.stringify(s.steps), s.estDurationS, s.estDistanceM, s.status, weekIds.get(s.weekIndex)],
      );
    }
  }
}
