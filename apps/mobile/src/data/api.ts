// The app's data contract. Mirrors the routes in replica/architecture.md, one
// method per route. `fake.ts` implements it on-device for now; the real client
// (Supabase + /api routes) will implement the same interface, so no screen
// changes when it is swapped in.

import type { Goal, ISODate, Plan, Preview, Session } from '@stride/engine';

export type {
  Activity,
  AdjustmentRow,
  Connection,
  Entitlement,
  LevelInfo,
  OnboardingInput,
  Race,
  Settings,
  User,
} from '@stride/contract';
export { FREE_GOALS } from '@stride/contract';
import type { Activity, AdjustmentRow, Connection, Entitlement, ErrorCode, LevelInfo, OnboardingInput, Race, Settings, User } from '@stride/contract';

/** A goal as the app sends it: engine fields plus the directory race, if any. */
export type GoalWithRace = Goal & { raceId?: string; elevationGainM?: number };

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}


export interface Api {
  /** what this backend can do, so screens only offer what works */
  capabilities: { oauth: boolean; emailCode: boolean; purchases: boolean; demo: boolean };

  // auth (Supabase Auth). Email: request a code, then verify it. A backend
  // without codes (the fake) signs in on the request and returns the user.
  me(): Promise<User | null>;
  requestSignIn(email: string): Promise<{ codeSent: boolean; user?: User }>;
  verifySignIn(email: string, code: string): Promise<User>;
  signInWithProvider(provider: 'apple' | 'google'): Promise<User | null>;
  signOut(everywhere?: boolean): Promise<void>;

  // F01 / F09
  onboarding(input: OnboardingInput): Promise<LevelInfo>;
  level(): Promise<LevelInfo | null>;

  // F02
  searchRaces(q: { text?: string; maxDistanceM?: number; discipline?: 'road' | 'trail' }): Promise<Race[]>;
  race(id: string): Promise<Race>;
  previewPlan(goal: GoalWithRace): Promise<Preview>;
  createPlan(input: { goal: GoalWithRace; sessionsPerWeek: 3 | 4 | 5 }): Promise<{ planId: string }>;
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
