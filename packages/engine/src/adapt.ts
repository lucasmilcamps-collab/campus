// Adaptation. Changes only sessions after `today`, by bounded amounts, and always
// says what changed in plain words (the summary shown on the home screen).

import { addDays, type ISODate } from './dates';
import { formatPace, paceFromKmh, zonesFromVma } from './level';
import { isHard, type Plan, type Session, type Step } from './plan';

export interface FeedbackEvent {
  kind: 'feedback';
  sessionId: string;
  /** 1 very easy ... 5 extreme */
  rpe: 1 | 2 | 3 | 4 | 5;
  pain?: boolean;
}

export interface MissedEvent {
  kind: 'missed';
  sessionIds: string[];
}

export type AdaptEvent = FeedbackEvent | MissedEvent;

export interface Adjustment {
  fromRevision: number;
  toRevision: number;
  reason: 'feedback' | 'missed_sessions';
  /** + = paces slower, - = faster, as a % of speed */
  paceChangePct: number;
  summary: string;
  changedSessionIds: string[];
}

export interface AdaptResult {
  plan: Plan;
  adjustment: Adjustment | null;
}

/** Runners with little history get bigger corrections; the model is less sure of them. */
export function paceCapPct(completedSessions: number): number {
  return completedSessions < 6 ? 5 : 2;
}

function retarget(steps: Step[], zones: Plan['zones']): Step[] {
  return steps.map((s) => {
    if (s.kind === 'repeat') return { ...s, children: retarget(s.children ?? [], zones) };
    if (!s.zone || s.zone === 'walk') return s;
    return { ...s, targetPace: Math.round((zones[s.zone].min + zones[s.zone].max) / 2) };
  });
}

function withVma(plan: Plan, today: ISODate, vmaKmh: number): { sessions: Session[]; changed: string[] } {
  const zones = zonesFromVma(vmaKmh);
  const changed: string[] = [];
  const sessions = plan.sessions.map((s) => {
    if (s.date <= today || s.status !== 'planned') return s;
    changed.push(s.id);
    return { ...s, steps: retarget(s.steps, zones) };
  });
  return { sessions, changed };
}

export function adapt(plan: Plan, event: AdaptEvent, today: ISODate): AdaptResult {
  const completed = plan.sessions.filter((s) => s.status === 'done').length;

  if (event.kind === 'feedback') {
    const s = plan.sessions.find((x) => x.id === event.sessionId);
    if (!s) return { plan, adjustment: null };

    if (event.pain) {
      // Next hard session in the coming 4 days becomes an easy run.
      const next = plan.sessions.find(
        (x) => x.date > today && x.date <= addDays(today, 4) && x.status === 'planned' && isHard(x.type) && x.type !== 'race',
      );
      if (!next) return { plan, adjustment: null };
      const ef = Math.round((plan.zones.ef.min + plan.zones.ef.max) / 2);
      const sessions = plan.sessions.map((x) =>
        x.id === next.id
          ? {
              ...x,
              type: 'easy' as const,
              title: 'Footing doux (remplace la séance intense)',
              purpose: "Tu as signalé une douleur : on allège. Si elle persiste plus de quelques jours, consulte un professionnel de santé.",
              steps: [{ kind: 'work' as const, durationS: 30 * 60, zone: 'ef' as const, targetPace: ef }],
              estDurationS: 30 * 60,
              estDistanceM: Math.round((30 * 60 * 1000) / ef),
            }
          : x,
      );
      return bump(plan, sessions, {
        reason: 'feedback',
        paceChangePct: 0,
        summary: `Douleur signalée : ta séance « ${next.title} » devient un footing doux.`,
        changedSessionIds: [next.id],
      });
    }

    if (!isHard(s.type)) return { plan, adjustment: null };
    const cap = paceCapPct(completed);
    let pct = 0;
    if (event.rpe === 5) pct = cap;
    else if (event.rpe <= 2) pct = -cap / 2;
    if (pct === 0) return { plan, adjustment: null };

    const vma = Math.round(plan.vmaKmh * (1 - pct / 100) * 10) / 10;
    const { sessions, changed } = withVma(plan, today, vma);
    const oldV = formatPace(paceFromKmh(plan.vmaKmh));
    const newV = formatPace(paceFromKmh(vma));
    const summary =
      pct > 0
        ? `Séance ressentie extrême : tes allures ralentissent un peu (VMA ${oldV} → ${newV} /km).`
        : `Séance facile pour toi : tes allures accélèrent un peu (VMA ${oldV} → ${newV} /km).`;
    return bump({ ...plan, vmaKmh: vma, zones: zonesFromVma(vma) }, sessions, {
      reason: 'feedback',
      paceChangePct: pct,
      summary,
      changedSessionIds: changed,
    });
  }

  // Missed sessions: two or more in a row lighten the next 7 days by ~15%.
  if (event.sessionIds.length < 2) return { plan, adjustment: null };
  const until = addDays(today, 7);
  const changed: string[] = [];
  const sessions = plan.sessions.map((x) => {
    if (x.date <= today || x.date > until || x.status !== 'planned' || x.type === 'race') return x;
    changed.push(x.id);
    return {
      ...x,
      steps: scaleDurations(x.steps, 0.85),
      estDurationS: Math.round(x.estDurationS * 0.85),
      estDistanceM: Math.round(x.estDistanceM * 0.85),
    };
  });
  if (!changed.length) return { plan, adjustment: null };
  return bump(plan, sessions, {
    reason: 'missed_sessions',
    paceChangePct: 0,
    summary: `${event.sessionIds.length} séances manquées : on allège la semaine qui vient pour reprendre en douceur.`,
    changedSessionIds: changed,
  });
}

function scaleDurations(steps: Step[], k: number): Step[] {
  return steps.map((s) => {
    if (s.kind === 'repeat') return { ...s, repeat: Math.max(2, Math.round((s.repeat ?? 2) * k)) };
    if (s.kind === 'work' && s.durationS) return { ...s, durationS: Math.round((s.durationS * k) / 60) * 60 };
    return s;
  });
}

function bump(plan: Plan, sessions: Session[], a: Omit<Adjustment, 'fromRevision' | 'toRevision'>): AdaptResult {
  const toRevision = plan.revision + 1;
  return {
    plan: { ...plan, sessions, revision: toRevision },
    adjustment: { ...a, fromRevision: plan.revision, toRevision },
  };
}

/** Sessions still planned whose day is over: they become missed. */
export function overdue(plan: Plan, today: ISODate): string[] {
  return plan.sessions.filter((s) => s.status === 'planned' && s.date < today && s.type !== 'rest').map((s) => s.id);
}
