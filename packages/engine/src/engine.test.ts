import { describe, expect, it } from 'vitest';
import {
  adapt,
  addDays,
  estimateLevel,
  formatPace,
  generatePlan,
  isHard,
  mondayOf,
  overdue,
  PlanError,
  predictTime,
  previewPlan,
  vmaFromRace,
  weekday,
  type Goal,
  type Plan,
} from './index';

const HALF: Goal = { kind: 'race', distanceM: 21_097, date: '2027-03-21', name: 'Semi de Bruxelles' };
const START = '2026-10-14'; // a Wednesday

function half(spw: 3 | 4 | 5 = 4): Plan {
  return generatePlan({ id: 'p', goal: HALF, startDate: START, sessionsPerWeek: spw, vmaKmh: 15, currentWeeklyKm: 20 });
}

describe('dates', () => {
  it('weeks start on Monday', () => {
    expect(mondayOf('2026-10-14')).toBe('2026-10-12');
    expect(mondayOf('2026-10-12')).toBe('2026-10-12');
    expect(mondayOf('2026-10-18')).toBe('2026-10-12');
    expect(weekday('2026-10-18')).toBe(6);
  });
  it('survives the October DST change (dates have no times)', () => {
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26');
    expect(addDays('2027-03-27', 2)).toBe('2027-03-29');
  });
});

describe('level', () => {
  it('a 45-minute 10 km gives a plausible VMA', () => {
    const v = vmaFromRace(10_000, 45 * 60);
    expect(v).toBeGreaterThan(14.5);
    expect(v).toBeLessThan(15.6);
  });
  it('predictTime roughly inverts vmaFromRace', () => {
    const v = vmaFromRace(10_000, 45 * 60);
    expect(Math.abs(predictTime(v, 10_000) - 45 * 60)).toBeLessThan(30);
  });
  it('estimates stay conservative and bounded', () => {
    const beginner = estimateLevel({ age: 45, sex: 'female', experience: 'none', weeklyVolumeKm: 0 });
    expect(beginner.source).toBe('estimate');
    expect(beginner.vmaKmh).toBeGreaterThanOrEqual(8);
    expect(beginner.vmaKmh).toBeLessThan(10);
    const fit = estimateLevel({ age: 30, sex: 'male', experience: 'over_3y', weeklyVolumeKm: 50 });
    expect(fit.vmaKmh).toBeGreaterThan(15);
  });
  it('zones are ordered from slow to fast', () => {
    const z = estimateLevel({ age: 30, sex: 'male', experience: '1_3y', weeklyVolumeKm: 25 }).zones;
    expect(z.ef.max).toBeGreaterThan(z.marathon.max);
    expect(z.marathon.min).toBeGreaterThan(z.half.min);
    expect(z.half.min).toBeGreaterThan(z['10k'].min);
    expect(z['10k'].min).toBeGreaterThan(z.vma.min);
    for (const r of Object.values(z)) expect(r.min).toBeLessThanOrEqual(r.max);
  });
  it('formats paces', () => {
    expect(formatPace(238)).toBe('3:58');
    expect(formatPace(360)).toBe('6:00');
  });
});

describe('plan', () => {
  it('builds every week from the start to race day', () => {
    const p = half();
    expect(p.weeks[0].startsOn).toBe('2026-10-12');
    expect(p.weeks.at(-1)!.phase).toBe('race');
    expect(p.weeks.length).toBe(23); // Mon 12 Oct -> Sun 21 Mar
    expect(p.sessions.at(-1)!.type).toBe('race');
    expect(p.sessions.at(-1)!.date).toBe(HALF.date);
  });
  it('never schedules before the start date', () => {
    expect(half().sessions.every((s) => s.date >= START)).toBe(true);
  });
  it('has the requested sessions per full week', () => {
    for (const spw of [3, 4, 5] as const) {
      const p = half(spw);
      const full = p.weeks.slice(1, -1);
      for (const w of full) {
        expect(p.sessions.filter((s) => s.weekIndex === w.index)).toHaveLength(spw);
      }
    }
  });
  it('never puts two hard sessions on consecutive days', () => {
    for (const spw of [3, 4, 5] as const) {
      const hard = half(spw).sessions.filter((s) => isHard(s.type));
      for (let i = 1; i < hard.length; i++) {
        expect(addDays(hard[i - 1].date, 1) === hard[i].date).toBe(false);
      }
    }
  });
  it('grows volume at most 10% a week and has recovery weeks', () => {
    const p = half();
    // loading weeks grow at most 10% over the previous loading week (a recovery week doesn't reset the base)
    const loading = p.weeks.filter((w) => ['base', 'build', 'specific'].includes(w.phase));
    for (let i = 1; i < loading.length; i++) {
      expect(loading[i].targetVolumeKm).toBeLessThanOrEqual(loading[i - 1].targetVolumeKm * 1.1 + 0.1);
    }
    expect(p.weeks.some((w) => w.phase === 'recovery')).toBe(true);
    expect(p.weeks.filter((w) => w.phase === 'taper').length).toBeGreaterThanOrEqual(1);
  });
  it('gives every session steps, a duration and a distance', () => {
    for (const s of half().sessions) {
      expect(s.steps.length).toBeGreaterThan(0);
      expect(s.estDurationS).toBeGreaterThan(0);
      expect(s.estDistanceM).toBeGreaterThan(0);
      expect(s.purpose.length).toBeGreaterThan(20);
    }
  });
  it('refuses plans that are too short or in the past', () => {
    const soon = { ...HALF, date: addDays(START, 20) };
    expect(() => generatePlan({ id: 'x', goal: soon, startDate: START, sessionsPerWeek: 4, vmaKmh: 15, currentWeeklyKm: 20 })).toThrow(PlanError);
    const past = { ...HALF, date: addDays(START, -1) };
    expect(() => generatePlan({ id: 'x', goal: past, startDate: START, sessionsPerWeek: 4, vmaKmh: 15, currentWeeklyKm: 20 })).toThrow(/passée/);
  });
  it('is deterministic', () => {
    expect(JSON.stringify(half())).toBe(JSON.stringify(half()));
  });
  it('golden: first full week of a 4-session half-marathon plan', () => {
    const p = half();
    const w1 = p.sessions.filter((s) => s.weekIndex === 1).map((s) => `${s.date} ${s.type} ${s.title}`);
    expect(w1).toMatchInlineSnapshot(`
      [
        "2026-10-20 vma 9 × 30 s vite / 30 s lent",
        "2026-10-22 easy Footing en endurance",
        "2026-10-23 hills 8 × 45 s en côte",
        "2026-10-25 long Sortie longue de 45 min",
      ]
    `);
  });
});

describe('preview', () => {
  it('shows more volume and a faster time with more sessions', () => {
    const pv = previewPlan(HALF, START, 15, 20);
    expect(pv.options.map((o) => o.sessionsPerWeek)).toEqual([3, 4, 5]);
    expect(pv.options[2].peakVolumeKm).toBeGreaterThan(pv.options[0].peakVolumeKm);
    expect(pv.options[2].predictedTimeS).toBeLessThan(pv.options[0].predictedTimeS);
    expect(pv.warnings).toEqual([]);
  });
  it('warns when the date is too close', () => {
    expect(previewPlan({ ...HALF, date: addDays(START, 14) }, START, 15, 20).warnings).toHaveLength(1);
  });
});

describe('adapt', () => {
  const today = '2026-10-20';
  const p = half();
  const vmaSession = p.sessions.find((s) => s.date === today)!;

  it('extreme RPE on a hard session slows future paces by the cap, and says so', () => {
    const { plan, adjustment } = adapt(p, { kind: 'feedback', sessionId: vmaSession.id, rpe: 5 }, today);
    expect(adjustment!.paceChangePct).toBe(5);
    expect(plan.vmaKmh).toBeCloseTo(14.3, 1);
    expect(plan.revision).toBe(2);
    expect(adjustment!.summary).toMatch(/ralentissent/);
    const before = p.sessions.find((s) => s.date > today && s.type === 'vma')!;
    const after = plan.sessions.find((s) => s.id === before.id)!;
    expect(after.steps[1].children![0].targetPace!).toBeGreaterThan(before.steps[1].children![0].targetPace!);
  });

  it('never touches today or the past', () => {
    const { plan } = adapt(p, { kind: 'feedback', sessionId: vmaSession.id, rpe: 5 }, today);
    for (const s of plan.sessions.filter((x) => x.date <= today)) {
      expect(s).toEqual(p.sessions.find((x) => x.id === s.id));
    }
  });

  it('uses a smaller cap once the runner has history', () => {
    const seasoned = { ...p, sessions: p.sessions.map((s, i) => (i < 8 ? { ...s, status: 'done' as const } : s)) };
    expect(adapt(seasoned, { kind: 'feedback', sessionId: vmaSession.id, rpe: 5 }, today).adjustment!.paceChangePct).toBe(2);
  });

  it('ignores ordinary feedback and easy sessions', () => {
    expect(adapt(p, { kind: 'feedback', sessionId: vmaSession.id, rpe: 3 }, today).adjustment).toBeNull();
    const easy = p.sessions.find((s) => s.type === 'easy')!;
    expect(adapt(p, { kind: 'feedback', sessionId: easy.id, rpe: 5 }, today).adjustment).toBeNull();
  });

  it('pain turns the next hard session into an easy run', () => {
    const { plan, adjustment } = adapt(p, { kind: 'feedback', sessionId: vmaSession.id, rpe: 4, pain: true }, today);
    const changed = plan.sessions.find((s) => s.id === adjustment!.changedSessionIds[0])!;
    expect(changed.type).toBe('easy');
    expect(adjustment!.summary).toMatch(/Douleur/);
  });

  it('two missed sessions lighten the next week', () => {
    const { adjustment } = adapt(p, { kind: 'missed', sessionIds: ['a', 'b'] }, today);
    expect(adjustment!.reason).toBe('missed_sessions');
    expect(adjustment!.changedSessionIds.length).toBeGreaterThan(0);
    expect(adapt(p, { kind: 'missed', sessionIds: ['a'] }, today).adjustment).toBeNull();
  });

  it('lists overdue sessions', () => {
    const ids = overdue(p, '2026-10-21');
    expect(ids).toEqual(p.sessions.filter((s) => s.date < '2026-10-21').map((s) => s.id));
    expect(ids).toContain(vmaSession.id);
    const done = { ...p, sessions: p.sessions.map((s) => (s.id === vmaSession.id ? { ...s, status: 'done' as const } : s)) };
    expect(overdue(done, '2026-10-21')).not.toContain(vmaSession.id);
  });
});
