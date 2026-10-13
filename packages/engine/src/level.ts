// Level and pace zones.
//
// Model: VMA (maximal aerobic speed, km/h) and the share of it a runner can hold
// for a given duration. The shares follow the endurance curve published in the
// running literature (Péronnet & Thibault 1989; the %VMA-by-duration tables used
// in French coaching courses). Nothing here comes from any app's method.

export type PaceZone = 'ef' | 'marathon' | 'half' | '10k' | 'threshold' | 'vma';

export interface ZoneRange {
  /** seconds per km, fast end */
  min: number;
  /** seconds per km, slow end */
  max: number;
}

export type PaceZones = Record<PaceZone, ZoneRange>;

export type Experience = 'none' | 'under_1y' | '1_3y' | 'over_3y';

export interface LevelInput {
  age: number;
  sex: 'female' | 'male' | 'other' | 'undisclosed';
  experience: Experience;
  weeklyVolumeKm: number;
  /** a recent race or test, if the runner has one */
  recent?: { distanceM: number; durationS: number };
}

export interface Level {
  vmaKmh: number;
  source: 'estimate' | 'race';
  zones: PaceZones;
}

// [minutes, fraction of VMA that can be held for that long]
const ENDURANCE_CURVE: Array<[number, number]> = [
  [4, 1.0],
  [6, 1.0],
  [10, 0.95],
  [20, 0.91],
  [40, 0.87],
  [60, 0.84],
  [90, 0.81],
  [120, 0.79],
  [180, 0.75],
  [240, 0.72],
  [360, 0.66],
];

/** Fraction of VMA a runner can hold for `minutes`. Interpolated on log(time). */
export function sustainableFraction(minutes: number): number {
  const pts = ENDURANCE_CURVE;
  if (minutes <= pts[0][0]) return pts[0][1];
  if (minutes >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  for (let i = 1; i < pts.length; i++) {
    const [t1, f1] = pts[i];
    if (minutes <= t1) {
      const [t0, f0] = pts[i - 1];
      const r = (Math.log(minutes) - Math.log(t0)) / (Math.log(t1) - Math.log(t0));
      return f0 + r * (f1 - f0);
    }
  }
  return pts[pts.length - 1][1];
}

/** VMA from a race result: speed / sustainable fraction at that duration. */
export function vmaFromRace(distanceM: number, durationS: number): number {
  const speedKmh = distanceM / 1000 / (durationS / 3600);
  return speedKmh / sustainableFraction(durationS / 60);
}

/** Rough VMA from the questionnaire. Deliberately conservative: an estimate
 *  that is too slow costs a few easy weeks; too fast causes injuries. */
export function estimateVma(i: Omit<LevelInput, 'recent'>): number {
  const base: Record<Experience, number> = { none: 10, under_1y: 11.5, '1_3y': 13, over_3y: 14.5 };
  let v = base[i.experience];
  v += Math.min(i.weeklyVolumeKm, 60) * 0.04;
  if (i.sex === 'female') v -= 1;
  if (i.age > 35) v -= (i.age - 35) * 0.06;
  if (i.age < 18) v -= (18 - i.age) * 0.2;
  return clamp(v, 8, 22);
}

/** Predicted race time for a distance at a given VMA (iterates the curve). */
export function predictTime(vmaKmh: number, distanceM: number): number {
  let minutes = (distanceM / 1000 / (vmaKmh * 0.85)) * 60;
  for (let i = 0; i < 20; i++) {
    const speed = vmaKmh * sustainableFraction(minutes);
    minutes = (distanceM / 1000 / speed) * 60;
  }
  return Math.round(minutes * 60);
}

export function paceFromKmh(kmh: number): number {
  return Math.round(3600 / kmh);
}

/** Race-pace zones come from the predicted race time at each distance; threshold
 *  is what can be held for about an hour; easy running is 65-72% of VMA. Fixed
 *  percentage bands for every zone break down across levels (a 52-minute 10 km
 *  runner's 10 km pace *is* roughly threshold), so only ef and vma use them. */
export function zonesFromVma(vmaKmh: number): PaceZones {
  const racePace = (m: number) => predictTime(vmaKmh, m) / (m / 1000);
  const band = (centre: number, spread: number): ZoneRange => ({
    min: Math.round(centre * (1 - spread)),
    max: Math.round(centre * (1 + spread)),
  });
  return {
    ef: { min: paceFromKmh(vmaKmh * 0.72), max: paceFromKmh(vmaKmh * 0.65) },
    marathon: band(racePace(42_195), 0.01),
    half: band(racePace(21_097), 0.01),
    '10k': band(racePace(10_000), 0.01),
    threshold: band(3600 / (vmaKmh * sustainableFraction(60)), 0.01),
    vma: { min: paceFromKmh(vmaKmh), max: paceFromKmh(vmaKmh * 0.98) },
  };
}

export function estimateLevel(i: LevelInput): Level {
  const fromRace = i.recent && i.recent.distanceM >= 1000 && i.recent.durationS > 0;
  const vma = fromRace ? clamp(vmaFromRace(i.recent!.distanceM, i.recent!.durationS), 8, 25) : estimateVma(i);
  const vmaKmh = Math.round(vma * 10) / 10;
  return { vmaKmh, source: fromRace ? 'race' : 'estimate', zones: zonesFromVma(vmaKmh) };
}

/** Middle of a zone, the single target shown on a step. */
export function targetPace(zones: PaceZones, z: PaceZone): number {
  return Math.round((zones[z].min + zones[z].max) / 2);
}

export function formatPace(sPerKm: number): string {
  const m = Math.floor(sPerKm / 60);
  const s = Math.round(sPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDuration(totalS: number): string {
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = Math.round(totalS % 60);
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')}`;
  if (s === 0) return `${m} min`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
