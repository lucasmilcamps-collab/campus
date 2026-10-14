// The API contract shared by the app and the server: response types and the
// zod schemas every request body and query is validated against.

import { z } from 'zod';
import type { GoalKind, ISODate, PaceZones } from '@stride/engine';

// ---------------------------------------------------------------- response types

export interface User {
  id: string;
  email: string;
  firstName?: string;
  onboarded: boolean;
}

export interface LevelInfo {
  vmaKmh: number;
  zones: PaceZones;
  source: 'estimate' | 'race';
  measuredOn: ISODate;
}

export interface Race {
  id: string;
  name: string;
  date: ISODate;
  city: string;
  distanceM: number;
  elevationGainM: number;
  discipline: 'road' | 'trail';
  membersCount: number;
}

export interface AdjustmentRow {
  id: string;
  createdAt: string;
  summary: string;
  paceChangePct: number;
  reason: 'feedback' | 'missed_sessions' | 'settings_change' | 'move';
  seen: boolean;
}

export type Sport = 'run' | 'trail' | 'walk' | 'bike' | 'swim' | 'strength' | 'other';

export interface Activity {
  id: string;
  sessionId?: string;
  source: 'tracker' | 'manual' | 'strava' | 'garmin';
  sport: Sport;
  date: ISODate;
  durationS: number;
  distanceM: number;
  rpe?: number;
  note?: string;
}

export interface Entitlement {
  tier: 'free' | 'training';
  status: 'none' | 'trial' | 'active' | 'cancelled';
  trialUsed: boolean;
  trialEndsAt?: ISODate;
  period?: 'month' | 'year';
}

export type Provider = 'strava' | 'garmin' | 'coros' | 'suunto';

export interface Connection {
  provider: Provider;
  status: 'active' | 'error';
  lastSyncedAt?: string;
}

export interface Settings {
  sessionsPerWeek: 3 | 4 | 5;
  nutritionEnabled: boolean;
  sessionReminder: boolean;
}

export const FREE_GOALS: GoalKind[] = ['evaluation', 'start_running', 'injury_return'];

export type ErrorCode = 'paywall' | 'not_found' | 'invalid' | 'too_short' | 'past_date' | 'conflict' | 'network' | 'unauthorized' | 'rate_limited';

/** Error body every non-2xx JSON response carries. */
export interface ErrorBody {
  error: { code: ErrorCode; message: string };
}

// ---------------------------------------------------------------- request schemas

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date attendue au format AAAA-MM-JJ');
const rpe = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
const spw = z.union([z.literal(3), z.literal(4), z.literal(5)]);

export const OnboardingInput = z.strictObject({
  firstName: z.string().trim().min(1).max(60).optional(),
  age: z.number().int().min(14).max(99),
  sex: z.enum(['female', 'male', 'other', 'undisclosed']),
  experience: z.enum(['none', 'under_1y', '1_3y', 'over_3y']),
  weeklyVolumeKm: z.number().min(0).max(300),
  runsPerWeekNow: z.number().int().min(0).max(14),
  recent: z.strictObject({ distanceM: z.number().int().min(1000).max(250_000), durationS: z.number().int().min(120).max(172_800) }).optional(),
});
export type OnboardingInput = z.infer<typeof OnboardingInput>;

export const GoalInput = z.strictObject({
  kind: z.enum(['race', 'speed', 'start_running', 'injury_return', 'evaluation']),
  distanceM: z.number().int().min(1000).max(250_000),
  date: isoDate,
  targetTimeS: z.number().int().min(60).max(172_800).optional(),
  surface: z.enum(['road', 'trail']).optional(),
  name: z.string().trim().max(120).optional(),
  raceId: z.uuid().optional(),
  elevationGainM: z.number().int().min(0).max(20_000).optional(),
});
export type GoalInput = z.infer<typeof GoalInput>;

export const PreviewInput = z.strictObject({ goal: GoalInput });
export const CreatePlanInput = z.strictObject({ goal: GoalInput, sessionsPerWeek: spw });

export const RaceQuery = z.strictObject({
  text: z.string().trim().max(80).optional(),
  maxDistanceM: z.coerce.number().int().positive().optional(),
  discipline: z.enum(['road', 'trail']).optional(),
});

export const WeekQuery = z.strictObject({ start: isoDate });
export const MoveInput = z.strictObject({ to: isoDate, force: z.boolean().optional() });

export const ActivityInput = z.strictObject({
  sessionId: z.uuid().optional(),
  source: z.enum(['tracker', 'manual']),
  sport: z.enum(['run', 'trail', 'walk', 'bike', 'swim', 'strength', 'other']),
  date: isoDate,
  durationS: z.number().int().min(1).max(172_800),
  distanceM: z.number().int().min(0).max(400_000),
  rpe: rpe.optional(),
  note: z.string().trim().max(2000).optional(),
});
export type ActivityInput = z.infer<typeof ActivityInput>;

export const FeedbackInput = z.strictObject({
  sessionId: z.uuid(),
  rpe,
  pain: z.boolean().optional(),
  note: z.string().trim().max(2000).optional(),
});

export const SettingsPatch = z
  .strictObject({ sessionsPerWeek: spw.optional(), nutritionEnabled: z.boolean().optional(), sessionReminder: z.boolean().optional() })
  .refine((o) => Object.keys(o).length > 0, 'rien à modifier');

export const PushTokenInput = z.strictObject({
  token: z.string().regex(/^(Expo|Exponent)PushToken\[[^\]]+\]$/),
  platform: z.enum(['ios', 'android']),
});

export const DeleteAccountInput = z.strictObject({ confirm: z.literal(true) });
export const ProviderParam = z.enum(['strava', 'garmin', 'coros', 'suunto']);
