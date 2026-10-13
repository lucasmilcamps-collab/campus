// The app's data contract. Mirrors the routes in replica/architecture.md, one
// method per route. `fake.ts` implements it on-device for now; the real client
// (Supabase + /api routes) will implement the same interface, so no screen
// changes when it is swapped in.

import type { Goal, GoalKind, ISODate, PaceZones, Plan, Preview, Session } from '@stride/engine';

export interface User {
  id: string;
  email: string;
  firstName?: string;
  onboarded: boolean;
}

export interface OnboardingInput {
  firstName?: string;
  age: number;
  sex: 'female' | 'male' | 'other' | 'undisclosed';
  experience: 'none' | 'under_1y' | '1_3y' | 'over_3y';
  weeklyVolumeKm: number;
  runsPerWeekNow: number;
  recent?: { distanceM: number; durationS: number };
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

export interface Activity {
  id: string;
  sessionId?: string;
  source: 'tracker' | 'manual' | 'strava' | 'garmin';
  sport: 'run' | 'trail' | 'walk' | 'bike' | 'swim' | 'strength' | 'other';
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

export interface Connection {
  provider: 'strava' | 'garmin' | 'coros' | 'suunto';
  status: 'active' | 'error';
  lastSyncedAt?: string;
}

export interface Settings {
  sessionsPerWeek: 3 | 4 | 5;
  nutritionEnabled: boolean;
  sessionReminder: boolean;
}

export class ApiError extends Error {
  constructor(
    public code: 'paywall' | 'not_found' | 'invalid' | 'too_short' | 'past_date' | 'conflict' | 'network',
    message: string,
  ) {
    super(message);
  }
}

export const FREE_GOALS: GoalKind[] = ['evaluation', 'start_running', 'injury_return'];

export interface Api {
  // auth (Supabase Auth later)
  me(): Promise<User | null>;
  signIn(email: string): Promise<User>;
  signOut(): Promise<void>;

  // F01 / F09
  onboarding(input: OnboardingInput): Promise<LevelInfo>;
  level(): Promise<LevelInfo | null>;

  // F02
  searchRaces(q: { text?: string; maxDistanceM?: number; discipline?: 'road' | 'trail' }): Promise<Race[]>;
  race(id: string): Promise<Race>;
  previewPlan(goal: Goal): Promise<Preview>;
  createPlan(input: { goal: Goal; sessionsPerWeek: 3 | 4 | 5 }): Promise<{ planId: string }>;
  plan(): Promise<Plan | null>;
  abandonPlan(): Promise<void>;

  // F03-F06
  week(start: ISODate): Promise<{ sessions: Session[]; adjustments: AdjustmentRow[] }>;
  session(id: string): Promise<Session>;
  moveSession(id: string, to: ISODate, force?: boolean): Promise<{ session?: Session; warnings: string[] }>;
  skipSession(id: string): Promise<void>;
  logActivity(input: Omit<Activity, 'id'>): Promise<Activity & { matchedSessionId?: string }>;
  activities(): Promise<Activity[]>;
  submitFeedback(input: { sessionId: string; rpe: 1 | 2 | 3 | 4 | 5; pain?: boolean; note?: string }): Promise<{ adjustment: AdjustmentRow | null }>;
  feedbackFor(sessionId: string): Promise<{ rpe: number; note?: string; pain?: boolean } | null>;
  markAdjustmentSeen(id: string): Promise<void>;
  adjustments(): Promise<AdjustmentRow[]>;

  // billing (RevenueCat later)
  entitlements(): Promise<Entitlement>;
  purchase(period: 'month' | 'year'): Promise<Entitlement>;
  restorePurchases(): Promise<Entitlement>;

  // settings, connections, account
  settings(): Promise<Settings>;
  updateSettings(patch: Partial<Settings>): Promise<{ settings: Settings; adjustment: AdjustmentRow | null }>;
  connections(): Promise<Connection[]>;
  connect(provider: Connection['provider']): Promise<Connection>;
  disconnect(provider: Connection['provider']): Promise<void>;
  deleteAccount(): Promise<void>;
}
