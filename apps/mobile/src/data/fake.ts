// On-device implementation of Api, backed by AsyncStorage and the real plan
// engine. Stands in for the backend until /replica-backend. Same signatures.

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  adapt,
  addDays,
  estimateLevel,
  generatePlan,
  isHard,
  mondayOf,
  overdue,
  PlanError,
  previewPlan,
  zonesFromVma,
  type Adjustment,
  type ISODate,
  type Plan,
} from '@stride/engine';
import {
  ApiError,
  FREE_GOALS,
  type Activity,
  type AdjustmentRow,
  type Api,
  type Connection,
  type Entitlement,
  type LevelInfo,
  type OnboardingInput,
  type Race,
  type Settings,
  type User,
} from './api';
import { devParams, today } from './clock';
import { DEMO_RACES } from './seed';

const KEY = 'stride.fake.v1';

interface State {
  user: User | null;
  profile: OnboardingInput | null;
  level: LevelInfo | null;
  plan: Plan | null;
  activities: Activity[];
  feedback: Record<string, { rpe: number; note?: string; pain?: boolean }>;
  adjustments: AdjustmentRow[];
  entitlement: Entitlement;
  settings: Settings;
  connections: Connection[];
  seq: number;
}

const empty = (): State => ({
  user: null,
  profile: null,
  level: null,
  plan: null,
  activities: [],
  feedback: {},
  adjustments: [],
  entitlement: { tier: 'free', status: 'none', trialUsed: false },
  settings: { sessionsPerWeek: 4, nutritionEnabled: false, sessionReminder: true },
  connections: [],
  seq: 1,
});

export interface FakeOptions {
  latencyMs?: number;
  storage?: Pick<typeof AsyncStorage, 'getItem' | 'setItem' | 'removeItem'>;
  /** method names that should fail with a network error (for error states) */
  fail?: string[];
}

export function createFakeApi(opts: FakeOptions = {}): Api & { reset(): Promise<void>; seedDemo(): Promise<void> } {
  const storage = opts.storage ?? AsyncStorage;
  const latency = opts.latencyMs ?? 250;
  const fail = new Set(opts.fail ?? (devParams().get('fail') ?? '').split(',').filter(Boolean));
  let state: State | null = null;

  const wait = () => new Promise((r) => setTimeout(r, latency));

  async function load(): Promise<State> {
    if (state) return state;
    const raw = await storage.getItem(KEY);
    state = raw ? { ...empty(), ...JSON.parse(raw) } : empty();
    return state!;
  }
  async function save() {
    await storage.setItem(KEY, JSON.stringify(state));
  }
  function id(prefix: string) {
    return `${prefix}_${state!.seq++}`;
  }
  async function run<T>(name: string, fn: (s: State) => T | Promise<T>, write = false): Promise<T> {
    await wait();
    if (fail.has(name)) throw new ApiError('network', 'Connexion impossible. Vérifie ton réseau et réessaie.');
    const s = await load();
    const out = await fn(s);
    if (write) await save();
    return out;
  }
  function requireUser(s: State): User {
    if (!s.user) throw new ApiError('invalid', 'Connecte-toi pour continuer.');
    return s.user;
  }
  function requirePlan(s: State): Plan {
    if (!s.plan) throw new ApiError('not_found', "Tu n'as pas encore de plan.");
    return s.plan;
  }
  function record(s: State, a: Adjustment | null, reason?: AdjustmentRow['reason']): AdjustmentRow | null {
    if (!a) return null;
    const row: AdjustmentRow = {
      id: id('adj'),
      createdAt: new Date().toISOString(),
      summary: a.summary,
      paceChangePct: a.paceChangePct,
      reason: reason ?? a.reason,
      seen: false,
    };
    s.adjustments.unshift(row);
    return row;
  }
  /** The hourly "mark missed" job, run on read. */
  function sweep(s: State) {
    if (!s.plan) return;
    const late = overdue(s.plan, today());
    if (!late.length) return;
    s.plan = { ...s.plan, sessions: s.plan.sessions.map((x) => (late.includes(x.id) ? { ...x, status: 'missed' as const } : x)) };
    if (late.length >= 2) {
      const r = adapt(s.plan, { kind: 'missed', sessionIds: late }, today());
      s.plan = r.plan;
      record(s, r.adjustment);
    }
  }
  function entitled(s: State) {
    return s.entitlement.tier === 'training' && (s.entitlement.status === 'trial' || s.entitlement.status === 'active');
  }

  const api: Api & { reset(): Promise<void>; seedDemo(): Promise<void> } = {
    async reset() {
      state = empty();
      await storage.removeItem(KEY);
    },

    async seedDemo() {
      state = demoState(today());
      await save();
    },

    me: () => run('me', (s) => s.user),
    signIn: (email) =>
      run(
        'signIn',
        (s) => {
          const clean = email.trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new ApiError('invalid', 'Adresse e-mail invalide.');
          if (!s.user || s.user.email !== clean) Object.assign(s, empty(), { user: { id: 'u_1', email: clean, onboarded: false } });
          return s.user!;
        },
        true,
      ),
    signOut: () =>
      run(
        'signOut',
        (s) => {
          s.user = null;
        },
        true,
      ),

    onboarding: (input) =>
      run(
        'onboarding',
        (s) => {
          const u = requireUser(s);
          if (input.age < 14 || input.age > 99) throw new ApiError('invalid', "L'âge doit être compris entre 14 et 99 ans.");
          const lvl = estimateLevel({ ...input, sex: input.sex });
          s.profile = input;
          s.level = { vmaKmh: lvl.vmaKmh, zones: lvl.zones, source: lvl.source, measuredOn: today() };
          s.user = { ...u, firstName: input.firstName, onboarded: true };
          return s.level;
        },
        true,
      ),
    level: () => run('level', (s) => s.level),

    searchRaces: (q) =>
      run('searchRaces', () => {
        const text = (q.text ?? '').trim().toLowerCase();
        return DEMO_RACES.filter(
          (r) =>
            r.date >= today() &&
            (!text || `${r.name} ${r.city}`.toLowerCase().includes(text)) &&
            (!q.maxDistanceM || r.distanceM <= q.maxDistanceM) &&
            (!q.discipline || r.discipline === q.discipline),
        ).sort((a, b) => (a.date < b.date ? -1 : 1));
      }),
    race: (rid) =>
      run('race', () => {
        const r = DEMO_RACES.find((x) => x.id === rid);
        if (!r) throw new ApiError('not_found', 'Course introuvable.');
        return r;
      }),

    previewPlan: (goal) =>
      run('previewPlan', (s) => {
        if (!s.level) throw new ApiError('invalid', 'Termine le questionnaire avant de créer un plan.');
        return previewPlan(goal, today(), s.level.vmaKmh, s.profile?.weeklyVolumeKm ?? 0);
      }),

    createPlan: ({ goal, sessionsPerWeek }) =>
      run(
        'createPlan',
        (s) => {
          requireUser(s);
          if (!s.level) throw new ApiError('invalid', 'Termine le questionnaire avant de créer un plan.');
          if (!FREE_GOALS.includes(goal.kind) && !entitled(s)) throw new ApiError('paywall', 'Cet objectif fait partie de l’offre Entraînement.');
          try {
            s.plan = generatePlan({
              id: id('plan'),
              goal,
              startDate: today(),
              sessionsPerWeek,
              vmaKmh: s.level.vmaKmh,
              currentWeeklyKm: s.profile?.weeklyVolumeKm ?? 0,
            });
          } catch (e) {
            if (e instanceof PlanError) throw new ApiError(e.code === 'past_date' ? 'past_date' : 'too_short', e.message);
            throw e;
          }
          s.settings.sessionsPerWeek = sessionsPerWeek;
          s.adjustments = [];
          return { planId: s.plan.id };
        },
        true,
      ),
    plan: () =>
      run(
        'plan',
        (s) => {
          sweep(s);
          return s.plan;
        },
        true,
      ),
    abandonPlan: () =>
      run(
        'abandonPlan',
        (s) => {
          s.plan = null;
          s.adjustments = [];
        },
        true,
      ),

    week: (start) =>
      run(
        'week',
        (s) => {
          sweep(s);
          const p = s.plan;
          const from = mondayOf(start);
          const to = addDays(from, 6);
          return {
            sessions: p ? p.sessions.filter((x) => x.date >= from && x.date <= to) : [],
            adjustments: s.adjustments.filter((a) => !a.seen),
          };
        },
        true,
      ),
    session: (sid) =>
      run('session', (s) => {
        const x = requirePlan(s).sessions.find((y) => y.id === sid);
        if (!x) throw new ApiError('not_found', 'Séance introuvable.');
        return x;
      }),
    moveSession: (sid, to, force) =>
      run(
        'moveSession',
        (s) => {
          const p = requirePlan(s);
          const x = p.sessions.find((y) => y.id === sid);
          if (!x) throw new ApiError('not_found', 'Séance introuvable.');
          if (to < today()) throw new ApiError('invalid', 'Impossible de déplacer une séance dans le passé.');
          if (to > p.endDate) throw new ApiError('invalid', 'Impossible de déplacer une séance après ta course.');
          if (x.type === 'race') throw new ApiError('invalid', 'La course ne se déplace pas : change plutôt ton objectif.');
          const warnings: string[] = [];
          const neighbours = p.sessions.filter((y) => y.id !== sid && (y.date === addDays(to, -1) || y.date === addDays(to, 1)));
          if (isHard(x.type) && neighbours.some((y) => isHard(y.type))) warnings.push('Deux séances intenses à la suite augmentent le risque de blessure.');
          if (p.sessions.some((y) => y.id !== sid && y.date === to)) warnings.push('Il y a déjà une séance ce jour-là.');
          if (warnings.length && !force) return { warnings };
          const moved = { ...x, date: to };
          s.plan = { ...p, sessions: p.sessions.map((y) => (y.id === sid ? moved : y)).sort((a, b) => (a.date < b.date ? -1 : 1)) };
          return { session: moved, warnings };
        },
        true,
      ),
    skipSession: (sid) =>
      run(
        'skipSession',
        (s) => {
          const p = requirePlan(s);
          s.plan = { ...p, sessions: p.sessions.map((y) => (y.id === sid ? { ...y, status: 'skipped' as const } : y)) };
        },
        true,
      ),
    logActivity: (input) =>
      run(
        'logActivity',
        (s) => {
          if (input.durationS <= 0) throw new ApiError('invalid', 'Indique une durée.');
          if (input.date > today()) throw new ApiError('invalid', 'Impossible d’enregistrer une activité dans le futur.');
          let matched = input.sessionId;
          if (!matched && s.plan && (input.sport === 'run' || input.sport === 'trail')) {
            matched = s.plan.sessions.find((x) => x.date === input.date && x.status !== 'done' && x.type !== 'rest')?.id;
          }
          const act: Activity = { ...input, id: id('act'), sessionId: matched };
          s.activities.unshift(act);
          if (matched && s.plan) {
            s.plan = { ...s.plan, sessions: s.plan.sessions.map((x) => (x.id === matched ? { ...x, status: 'done' as const } : x)) };
          }
          return { ...act, matchedSessionId: matched };
        },
        true,
      ),
    activities: () => run('activities', (s) => s.activities),
    submitFeedback: ({ sessionId, rpe, pain, note }) =>
      run(
        'submitFeedback',
        (s) => {
          const p = requirePlan(s);
          if (!p.sessions.some((x) => x.id === sessionId)) throw new ApiError('not_found', 'Séance introuvable.');
          s.feedback[sessionId] = { rpe, pain, note };
          s.plan = { ...p, sessions: p.sessions.map((x) => (x.id === sessionId && x.status === 'planned' ? { ...x, status: 'done' as const } : x)) };
          const r = adapt(s.plan, { kind: 'feedback', sessionId, rpe, pain }, today());
          s.plan = r.plan;
          if (s.level && r.plan.vmaKmh !== s.level.vmaKmh) s.level = { ...s.level, vmaKmh: r.plan.vmaKmh, zones: zonesFromVma(r.plan.vmaKmh) };
          return { adjustment: record(s, r.adjustment) };
        },
        true,
      ),
    feedbackFor: (sid) => run('feedbackFor', (s) => s.feedback[sid] ?? null),
    markAdjustmentSeen: (aid) =>
      run(
        'markAdjustmentSeen',
        (s) => {
          s.adjustments = s.adjustments.map((a) => (a.id === aid ? { ...a, seen: true } : a));
        },
        true,
      ),
    adjustments: () => run('adjustments', (s) => s.adjustments),

    entitlements: () => run('entitlements', (s) => s.entitlement),
    purchase: (period) =>
      run(
        'purchase',
        (s) => {
          s.entitlement = s.entitlement.trialUsed
            ? { tier: 'training', status: 'active', trialUsed: true, period }
            : { tier: 'training', status: 'trial', trialUsed: true, trialEndsAt: addDays(today(), 14), period };
          return s.entitlement;
        },
        true,
      ),
    restorePurchases: () => run('restorePurchases', (s) => s.entitlement),

    settings: () => run('settings', (s) => s.settings),
    updateSettings: (patch) =>
      run(
        'updateSettings',
        (s) => {
          const before = s.settings;
          s.settings = { ...s.settings, ...patch };
          let adjustment: AdjustmentRow | null = null;
          if (patch.sessionsPerWeek && patch.sessionsPerWeek !== before.sessionsPerWeek && s.plan && s.level) {
            const p = s.plan;
            const t = today();
            const regenerated = generatePlan({
              id: p.id,
              goal: p.goal,
              startDate: addDays(t, 1),
              sessionsPerWeek: patch.sessionsPerWeek,
              vmaKmh: p.vmaKmh,
              currentWeeklyKm: s.profile?.weeklyVolumeKm ?? 0,
            });
            const offset = p.weeks.findIndex((w) => w.startsOn === mondayOf(addDays(t, 1)));
            s.plan = {
              ...p,
              sessionsPerWeek: patch.sessionsPerWeek,
              revision: p.revision + 1,
              sessions: [
                ...p.sessions.filter((x) => x.date <= t),
                ...regenerated.sessions.map((x) => ({ ...x, weekIndex: x.weekIndex + Math.max(0, offset) })),
              ],
            };
            adjustment = record(s, {
              fromRevision: p.revision,
              toRevision: p.revision + 1,
              reason: 'feedback',
              paceChangePct: 0,
              summary: `Ton plan passe à ${patch.sessionsPerWeek} séances par semaine à partir de demain.`,
              changedSessionIds: [],
            }, 'settings_change');
          }
          return { settings: s.settings, adjustment };
        },
        true,
      ),
    connections: () => run('connections', (s) => s.connections),
    connect: (provider) =>
      run(
        'connect',
        (s) => {
          const c: Connection = { provider, status: 'active', lastSyncedAt: new Date().toISOString() };
          s.connections = [...s.connections.filter((x) => x.provider !== provider), c];
          return c;
        },
        true,
      ),
    disconnect: (provider) =>
      run(
        'disconnect',
        (s) => {
          s.connections = s.connections.filter((x) => x.provider !== provider);
        },
        true,
      ),
    deleteAccount: () =>
      run(
        'deleteAccount',
        () => {
          state = empty();
        },
        true,
      ),
  };
  return api;
}

/** A runner three weeks into a half-marathon plan, for demos and screenshots. */
export function demoState(t: ISODate): State {
  const s = empty();
  const start = addDays(mondayOf(t), -21);
  s.user = { id: 'u_demo', email: 'demo@example.com', firstName: 'Camille', onboarded: true };
  s.profile = { firstName: 'Camille', age: 34, sex: 'female', experience: '1_3y', weeklyVolumeKm: 22, runsPerWeekNow: 3 };
  const lvl = estimateLevel({ age: 34, sex: 'female', experience: '1_3y', weeklyVolumeKm: 22, recent: { distanceM: 10_000, durationS: 52 * 60 + 30 } });
  s.level = { vmaKmh: lvl.vmaKmh, zones: lvl.zones, source: 'race', measuredOn: start };
  const race = DEMO_RACES.find((r) => r.distanceM > 21_000 && r.distanceM < 21_200)!;
  const raceDate = addDays(start, 7 * 18 + 6);
  let plan = generatePlan({
    id: 'plan_demo',
    goal: { kind: 'race', distanceM: race.distanceM, date: raceDate, name: race.name },
    startDate: start,
    sessionsPerWeek: 4,
    vmaKmh: lvl.vmaKmh,
    currentWeeklyKm: 22,
  });
  const past = plan.sessions.filter((x) => x.date < t);
  const missedId = past[past.length - 3]?.id;
  plan = {
    ...plan,
    sessions: plan.sessions.map((x) => (x.date < t ? { ...x, status: x.id === missedId ? ('missed' as const) : ('done' as const) } : x)),
  };
  s.plan = plan;
  s.activities = plan.sessions
    .filter((x) => x.status === 'done')
    .reverse()
    .map((x, i) => ({
      id: `act_demo_${i}`,
      sessionId: x.id,
      source: i % 3 === 0 ? ('manual' as const) : ('strava' as const),
      sport: 'run' as const,
      date: x.date,
      durationS: x.estDurationS + ((i * 37) % 120) - 60,
      distanceM: x.estDistanceM + ((i * 113) % 400) - 200,
      rpe: 2 + (i % 3),
    }));
  for (const a of s.activities) s.feedback[a.sessionId!] = { rpe: a.rpe! };
  s.adjustments = [
    {
      id: 'adj_demo',
      createdAt: new Date().toISOString(),
      summary: 'Séance VMA ressentie extrême : tes allures ralentissent un peu (VMA 3:58 → 4:10 /km).',
      paceChangePct: 5,
      reason: 'feedback',
      seen: false,
    },
  ];
  s.entitlement = { tier: 'training', status: 'trial', trialUsed: true, trialEndsAt: addDays(t, 9), period: 'year' };
  s.connections = [{ provider: 'strava', status: 'active', lastSyncedAt: new Date().toISOString() }];
  s.seq = 100;
  return s;
}

export type { Race };
