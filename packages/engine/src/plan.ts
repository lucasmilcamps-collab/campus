// Plan generation. Classic periodisation (base -> build -> specific -> taper ->
// race), a recovery week every fourth week, weekly volume capped at +10% a week.
// All session text is our own.

import { addDays, daysBetween, mondayOf, type ISODate } from './dates';
import { clamp, predictTime, targetPace, zonesFromVma, type PaceZone, type PaceZones } from './level';

export const ENGINE_VERSION = '0.1.0';

export type SessionType =
  | 'easy' | 'long' | 'vma' | 'threshold' | 'race_pace' | 'hills' | 'trail' | 'strength' | 'test' | 'race' | 'rest';

export type Phase = 'base' | 'build' | 'specific' | 'taper' | 'recovery' | 'race';

export type GoalKind = 'race' | 'speed' | 'start_running' | 'injury_return' | 'evaluation';

export interface Goal {
  kind: GoalKind;
  distanceM: number;
  /** race day, or the plan's last day for non-race goals */
  date: ISODate;
  targetTimeS?: number;
  surface?: 'road' | 'trail';
  name?: string;
}

export type StepKind = 'warmup' | 'work' | 'recovery' | 'cooldown' | 'repeat';

export interface Step {
  kind: StepKind;
  durationS?: number;
  distanceM?: number;
  zone?: PaceZone | 'walk';
  /** s/km; absent for walk and repeat */
  targetPace?: number;
  repeat?: number;
  children?: Step[];
}

export type SessionStatus = 'planned' | 'done' | 'missed' | 'skipped';

export interface Session {
  id: string;
  weekIndex: number;
  date: ISODate;
  originalDate: ISODate;
  type: SessionType;
  title: string;
  purpose: string;
  steps: Step[];
  estDurationS: number;
  estDistanceM: number;
  status: SessionStatus;
}

export interface Week {
  index: number;
  startsOn: ISODate;
  phase: Phase;
  targetVolumeKm: number;
}

export interface Plan {
  id: string;
  goal: Goal;
  startDate: ISODate;
  endDate: ISODate;
  sessionsPerWeek: 3 | 4 | 5;
  vmaKmh: number;
  zones: PaceZones;
  revision: number;
  engineVersion: string;
  weeks: Week[];
  sessions: Session[];
}

export interface PlanInput {
  id: string;
  goal: Goal;
  /** first day the runner can train (usually today) */
  startDate: ISODate;
  sessionsPerWeek: 3 | 4 | 5;
  vmaKmh: number;
  currentWeeklyKm: number;
}

export const MIN_WEEKS = 6;
export const MAX_WEEKS = 52;

export class PlanError extends Error {
  constructor(public code: 'too_short' | 'too_long' | 'past_date', message: string) {
    super(message);
  }
}

/** Peak weekly volume at 4 sessions/week, by goal distance. */
function peakVolumeKm(distanceM: number, spw: 3 | 4 | 5, currentKm: number): number {
  const km = distanceM / 1000;
  const base = km <= 5 ? 30 : km <= 10 ? 38 : km <= 21.1 ? 48 : km <= 42.2 ? 62 : 70;
  const scale = { 3: 0.8, 4: 1, 5: 1.15 }[spw];
  return Math.round(Math.max(base * scale, currentKm));
}

function phaseOf(i: number, total: number): Phase {
  if (i === total - 1) return 'race';
  const taper = total >= 10 ? 2 : 1;
  if (i >= total - 1 - taper) return 'taper';
  const before = total - 1 - taper; // weeks before the taper
  if ((i + 1) % 4 === 0) return 'recovery';
  if (i < Math.round(before * 0.4)) return 'base';
  if (i < Math.round(before * 0.7)) return 'build';
  return 'specific';
}

function volumes(weeks: Phase[], startKm: number, peakKm: number): number[] {
  const out: number[] = [];
  let last = Math.max(startKm, 12);
  for (const ph of weeks) {
    let v: number;
    if (ph === 'recovery') v = last * 0.75;
    else if (ph === 'taper') v = peakKm * 0.65;
    else if (ph === 'race') v = peakKm * 0.4;
    else {
      v = Math.min(last * 1.1, peakKm);
      last = v;
    }
    out.push(Math.round(v * 10) / 10);
  }
  return out;
}

/** Days of the week (0 = Monday) by sessions per week. Hard days never touch. */
const LAYOUT: Record<3 | 4 | 5, Array<'q1' | 'q2' | 'easy' | 'long'>> = {
  3: ['q1', 'easy', 'long'],
  4: ['q1', 'easy', 'q2', 'long'],
  5: ['easy', 'q1', 'easy', 'q2', 'long'],
};
const DAYS: Record<3 | 4 | 5, number[]> = {
  3: [1, 3, 6],
  4: [1, 3, 4, 6],
  5: [0, 1, 3, 4, 6],
};

const WARMUP_S = 15 * 60;
const COOLDOWN_S = 10 * 60;

function step(kind: StepKind, durationS: number, zone: PaceZone | 'walk', zones: PaceZones): Step {
  return { kind, durationS, zone, targetPace: zone === 'walk' ? undefined : targetPace(zones, zone) };
}

function intervals(n: number, workS: number, zone: PaceZone, recS: number, zones: PaceZones): Step[] {
  return [
    step('warmup', WARMUP_S, 'ef', zones),
    {
      kind: 'repeat',
      repeat: n,
      children: [step('work', workS, zone, zones), step('recovery', recS, 'ef', zones)],
    },
    step('cooldown', COOLDOWN_S, 'ef', zones),
  ];
}

interface Built {
  type: SessionType;
  title: string;
  purpose: string;
  steps: Step[];
}

const PURPOSE: Record<SessionType, string> = {
  easy: "Courir lentement construit ton moteur aérobie sans fatigue. Tu dois pouvoir parler en phrases complètes.",
  long: "La sortie longue habitue ton corps à durer : tendons, réserves d’énergie, mental. Reste en aisance du début à la fin.",
  vma: "Des efforts courts près de ta vitesse maximale pour élever ton plafond. Les récupérations comptent autant que les efforts.",
  threshold: "Le seuil, c’est l’allure « confortablement difficile ». Le travailler repousse le moment où tu t’essouffles.",
  race_pace: "Répéter l’allure de ta course pour qu’elle devienne familière le jour J.",
  hills: "Les côtes renforcent les jambes et la foulée, avec moins de chocs qu’à plat.",
  trail: "Varier les terrains et le dénivelé pour préparer ton corps aux sentiers.",
  strength: "Renforcement général : gainage, mollets, fessiers. Moins de blessures, meilleure foulée.",
  test: "Un effort maximal pour mettre à jour tes allures. Échauffe-toi bien et donne tout.",
  race: "Jour de course. Pars prudemment, garde ton allure, finis fort.",
  rest: "Repos. C’est pendant la récupération que tu progresses.",
};

function durationOf(steps: Step[]): number {
  return steps.reduce(
    (t, s) => t + (s.kind === 'repeat' ? (s.repeat ?? 1) * durationOf(s.children ?? []) : s.durationS ?? 0),
    0,
  );
}

function distanceOf(steps: Step[]): number {
  return steps.reduce((d, s) => {
    if (s.kind === 'repeat') return d + (s.repeat ?? 1) * distanceOf(s.children ?? []);
    if (s.distanceM) return d + s.distanceM;
    if (!s.durationS) return d;
    const pace = s.targetPace ?? 600; // walking ~10 min/km
    return d + (s.durationS / pace) * 1000;
  }, 0);
}

function quality(slot: 'q1' | 'q2', phase: Phase, goal: Goal, zones: PaceZones, weekInPhase: number): Built {
  const longGoal = goal.distanceM >= 21_000;
  if (phase === 'taper') {
    return slot === 'q1'
      ? { type: 'race_pace', title: '3 × 5 min allure course', purpose: PURPOSE.race_pace, steps: intervals(3, 300, raceZone(goal), 120, zones) }
      : { type: 'easy', title: 'Footing avec accélérations', purpose: PURPOSE.easy, steps: [step('work', 35 * 60, 'ef', zones)] };
  }
  if (phase === 'base') {
    if (slot === 'q1') {
      const n = 8 + Math.min(weekInPhase, 4);
      return { type: 'vma', title: `${n} × 30 s vite / 30 s lent`, purpose: PURPOSE.vma, steps: intervals(n, 30, 'vma', 30, zones) };
    }
    return { type: 'hills', title: '8 × 45 s en côte', purpose: PURPOSE.hills, steps: intervals(8, 45, '10k', 75, zones) };
  }
  if (phase === 'build') {
    if (slot === 'q1') {
      const n = 5 + Math.min(weekInPhase, 3);
      return { type: 'vma', title: `${n} × 3 min allure VMA`, purpose: PURPOSE.vma, steps: intervals(n, 180, 'vma', 120, zones) };
    }
    const n = 2 + Math.min(weekInPhase, 2);
    return { type: 'threshold', title: `${n} × 8 min au seuil`, purpose: PURPOSE.threshold, steps: intervals(n, 480, 'threshold', 120, zones) };
  }
  // specific
  if (slot === 'q1') {
    const min = longGoal ? 15 : 8;
    const n = 3;
    return {
      type: 'race_pace',
      title: `${n} × ${min} min allure course`,
      purpose: PURPOSE.race_pace,
      steps: intervals(n, min * 60, raceZone(goal), 120, zones),
    };
  }
  return { type: 'threshold', title: '2 × 12 min au seuil', purpose: PURPOSE.threshold, steps: intervals(2, 720, 'threshold', 180, zones) };
}

function raceZone(goal: Goal): PaceZone {
  const km = goal.distanceM / 1000;
  if (km <= 10) return '10k';
  if (km <= 21.1) return 'half';
  return 'marathon';
}

function easyOfKm(km: number, zones: PaceZones, title = 'Footing en endurance'): Built {
  const s = Math.round(((km * targetPace(zones, 'ef')) / 60) / 5) * 5 * 60;
  return { type: 'easy', title, purpose: PURPOSE.easy, steps: [step('work', clamp(s, 25 * 60, 75 * 60), 'ef', zones)] };
}

function longOfKm(km: number, zones: PaceZones, goal: Goal): Built {
  const cap = goal.distanceM >= 42_000 ? 150 : goal.distanceM >= 21_000 ? 110 : 80;
  const min = clamp(Math.round(((km * targetPace(zones, 'ef')) / 60) / 5) * 5, 40, cap);
  const h = Math.floor(min / 60);
  const rest = min % 60;
  const label = h > 0 ? `${h} h ${String(rest).padStart(2, '0')}` : `${min} min`;
  return { type: 'long', title: `Sortie longue de ${label}`, purpose: PURPOSE.long, steps: [step('work', min * 60, 'ef', zones)] };
}

function raceSession(goal: Goal, zones: PaceZones): Built {
  const km = goal.distanceM / 1000;
  const label = km === 21.0975 || Math.abs(km - 21.1) < 0.05 ? 'semi-marathon' : km >= 42 && km < 42.3 ? 'marathon' : `${km.toLocaleString('fr-FR')} km`;
  return {
    type: 'race',
    title: goal.name ? `Course : ${goal.name}` : `Jour J : ${label}`,
    purpose: PURPOSE.race,
    steps: [{ kind: 'work', distanceM: goal.distanceM, zone: raceZone(goal), targetPace: targetPace(zones, raceZone(goal)) }],
  };
}

function finish(b: Built, id: string, weekIndex: number, date: ISODate): Session {
  return {
    id,
    weekIndex,
    date,
    originalDate: date,
    type: b.type,
    title: b.title,
    purpose: b.purpose,
    steps: b.steps,
    estDurationS: durationOf(b.steps) || (b.steps[0]?.distanceM ? Math.round((b.steps[0].distanceM / 1000) * (b.steps[0].targetPace ?? 360)) : 0),
    estDistanceM: Math.round(distanceOf(b.steps)),
    status: 'planned',
  };
}

export function planLengthWeeks(startDate: ISODate, goalDate: ISODate): number {
  return Math.floor(daysBetween(mondayOf(startDate), goalDate) / 7) + 1;
}

export function generatePlan(input: PlanInput): Plan {
  const { goal, startDate, sessionsPerWeek: spw, vmaKmh } = input;
  if (daysBetween(startDate, goal.date) < 0) throw new PlanError('past_date', 'La date est déjà passée.');
  const nWeeks = planLengthWeeks(startDate, goal.date);
  if (nWeeks < MIN_WEEKS) throw new PlanError('too_short', `Il faut au moins ${MIN_WEEKS} semaines de préparation.`);
  if (nWeeks > MAX_WEEKS) throw new PlanError('too_long', `Un plan dure au plus ${MAX_WEEKS} semaines.`);

  const zones = zonesFromVma(vmaKmh);
  const isRace = goal.kind === 'race';
  const phases = Array.from({ length: nWeeks }, (_, i) => {
    const p = phaseOf(i, nWeeks);
    return !isRace && p === 'race' ? 'taper' : p;
  });
  const vols = volumes(phases, input.currentWeeklyKm, peakVolumeKm(goal.distanceM, spw, input.currentWeeklyKm));
  const firstMonday = mondayOf(startDate);

  const weeks: Week[] = [];
  const sessions: Session[] = [];
  const phaseCount: Partial<Record<Phase, number>> = {};

  phases.forEach((phase, wi) => {
    const startsOn = addDays(firstMonday, wi * 7);
    weeks.push({ index: wi, startsOn, phase, targetVolumeKm: vols[wi] });
    const inPhase = (phaseCount[phase] = (phaseCount[phase] ?? -1) + 1);
    const vol = vols[wi];
    const slots = LAYOUT[spw];
    const days = DAYS[spw];

    slots.forEach((slot, si) => {
      const date = addDays(startsOn, days[si]);
      if (date < startDate) return; // first week may start mid-week
      if (date > goal.date) return;
      const id = `${input.id}-w${wi}-${si}`;
      let built: Built;
      if (phase === 'race' && isRace) {
        // race week: the race replaces the long run; nothing hard in the last 3 days
        if (slot === 'long' || date >= goal.date) return;
        built =
          slot === 'q1' && daysBetween(date, goal.date) > 3
            ? { type: 'race_pace', title: '3 × 3 min allure course', purpose: PURPOSE.race_pace, steps: intervals(3, 180, raceZone(goal), 120, zones) }
            : easyOfKm(6, zones, 'Footing léger avant la course');
      } else if (phase === 'recovery') {
        built = slot === 'long' ? longOfKm(vol * 0.3, zones, goal) : easyOfKm(vol * 0.2, zones, 'Footing de récupération');
      } else if (slot === 'long') {
        built = longOfKm(vol * 0.32, zones, goal);
      } else if (slot === 'easy') {
        built = easyOfKm(vol * (spw === 3 ? 0.3 : 0.18), zones);
      } else {
        built = quality(slot, phase, goal, zones, inPhase);
      }
      sessions.push(finish(built, id, wi, date));
    });
    if (phase === 'race' && isRace) {
      sessions.push(finish(raceSession(goal, zones), `${input.id}-w${wi}-race`, wi, goal.date));
    }
  });

  sessions.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return {
    id: input.id,
    goal,
    startDate,
    endDate: goal.date,
    sessionsPerWeek: spw,
    vmaKmh,
    zones,
    revision: 1,
    engineVersion: ENGINE_VERSION,
    weeks,
    sessions,
  };
}

export interface PreviewOption {
  sessionsPerWeek: 3 | 4 | 5;
  peakVolumeKm: number;
  predictedTimeS: number;
}

export interface Preview {
  weeks: number;
  options: PreviewOption[];
  warnings: string[];
}

/** S06: what 3, 4 or 5 sessions a week means for volume and the predicted time.
 *  More volume over the plan is worth a little speed, capped and honest. */
export function previewPlan(goal: Goal, startDate: ISODate, vmaKmh: number, currentWeeklyKm: number): Preview {
  const weeks = planLengthWeeks(startDate, goal.date);
  const warnings: string[] = [];
  if (weeks < MIN_WEEKS) warnings.push(`Moins de ${MIN_WEEKS} semaines avant la date : choisis une date plus lointaine.`);
  if (weeks > MAX_WEEKS) warnings.push(`Plus de ${MAX_WEEKS} semaines : on commencera plus tard.`);
  const gainWeeks = clamp(weeks, 0, 20);
  const options = ([3, 4, 5] as const).map((spw) => {
    const gain = { 3: 0.015, 4: 0.025, 5: 0.032 }[spw] * (gainWeeks / 20);
    return {
      sessionsPerWeek: spw,
      peakVolumeKm: peakVolumeKm(goal.distanceM, spw, currentWeeklyKm),
      predictedTimeS: predictTime(vmaKmh * (1 + gain), goal.distanceM),
    };
  });
  return { weeks, options, warnings };
}

export function weekOf(plan: Plan, date: ISODate): Session[] {
  const start = mondayOf(date);
  const end = addDays(start, 6);
  return plan.sessions.filter((s) => s.date >= start && s.date <= end);
}

export function isHard(type: SessionType): boolean {
  return type === 'vma' || type === 'threshold' || type === 'race_pace' || type === 'hills' || type === 'test' || type === 'race';
}
