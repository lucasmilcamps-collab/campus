# Architecture: running-coach clone (a rebuild of Campus Coach's core features)

Inputs: `replica/recon.md` (27 screens, 11 flows) and `replica/features.csv` (20 must /
16 should / 12 could / 6 skip). The name is a placeholder until `/replica-brand`.

The product is a mobile app. The web side is a small marketing site, a public race
directory and the API that the app calls. There is one Postgres database and one
TypeScript codebase. The plan engine is a pure library: it takes data in, returns a
plan, and never touches the network.

## Stack

| layer | choice | why |
| --- | --- | --- |
| mobile | Expo (React Native) + TypeScript, Expo Router | Runners use the phone, and one codebase covers iOS and Android. EAS handles builds and updates. |
| GPS tracker | `expo-location` (background) + `expo-task-manager` + `expo-speech` | The managed workflow covers background location and voice cues, so no native code is needed for v1. |
| web + API | Next.js (App Router) + TypeScript on Vercel | One deploy serves the landing page, the race-directory pages (SEO) and `/api/*` route handlers for the app. |
| shared code | pnpm monorepo: `apps/mobile`, `apps/web`, `packages/engine`, `packages/db`, `packages/ui-tokens` | The plan engine and the types are shared between server and app. |
| plan engine | `packages/engine`, pure TS, unit-tested with Vitest | It is the product, so it must be deterministic, versioned and testable without a database. |
| styling | NativeWind (Tailwind for RN) + Tailwind on web, tokens from `/replica-design` | One token set for both apps. |
| database | Postgres on Supabase | One managed database with RLS, Auth, Storage and cron (`pg_cron`) in the same box, and a free tier. |
| ORM | Drizzle (server only) | Typed SQL, migrations in the repo. The app reads through supabase-js under RLS. |
| auth | Supabase Auth: email OTP, Sign in with Apple, Google | The App Store requires Apple sign-in once Google is offered. The JWT works for both RLS and the API. |
| payments | RevenueCat over App Store / Play Billing; Stripe only if a web checkout comes later | A digital subscription sold in-app must use in-app purchase. RevenueCat handles the trial, receipts and both stores, and sends one webhook. |
| email | Resend | Transactional email (trial ending, welcome), with good deliverability for very little setup. |
| push | Expo Notifications | One API for APNs and FCM. |
| jobs | Inngest (event-driven + cron) called from Next.js | Imports, adaptation and exports need retries and backoff. `pg_cron` only nudges Inngest. |
| files | Supabase Storage | Share visuals and GPX uploads, if any. |
| hosting | Vercel (web/API), Supabase (eu-central-1, Frankfurt), EAS (mobile builds) | Everything is managed and the data stays in the EU (GDPR, FR/BE users). |
| monitoring | Sentry (mobile + web) | Crashes in the GPS tracker will only be found this way. |

There are no microservices. There is no queue beyond Inngest. There is no separate
"engine service": the engine runs inside the API routes and Inngest functions.

## Schema

Tables: **28** (26 in `public`, 2 in `private`). Access rules: **Postgres RLS** on every
`public` table. The client reads its own rows. It writes only the hand-edited fields:
settings, feedback, manual activities, push tokens and moving a session through the API.
The plan engine, imports and billing write with the service role from server code.
Provider tokens and webhook logs sit in `private`, which the Supabase API does not
expose.

The full SQL is in [`schema.sql`](schema.sql). It was loaded and tested on Postgres 16:
cross-user reads return 0 rows, a client edit to paces is refused, a client insert of a
non-manual activity is refused, and a duplicate provider import is refused.

| area | tables |
| --- | --- |
| runner | `profiles`, `runner_profiles` (current VMA, endurance index, pace zones), `reference_times` |
| goals | `races`, `goals`, `plan_secondary_goals` |
| plan | `plans`, `plan_weeks`, `sessions`, `session_steps`, `plan_adjustments` |
| doing it | `activities`, `feedback`, `watch_exports` |
| integrations | `connections`, `private.connection_tokens` |
| billing | `subscriptions`, `private.webhook_events` |
| notifications | `push_tokens`, `notification_prefs` |
| later | `learn_articles`, `crews`, `crew_members`, `crew_events`, `challenges`, `challenge_entries`, `badges`, `user_badges` |

Hard constraints the recon found, enforced in the database:

- **One active plan per runner.** Partial unique index `plans_one_active`. Same for
  the primary goal (`goals_one_active_primary`).
- **The same activity imported twice** (a webhook retry, or Strava and Garmin both
  connected) stays one row. Unique `(user_id, source, external_id)`.
- **One activity per planned session** (`activities_one_per_session`) and one
  feedback per session.
- **A provider account linked to only one user.** Unique `(provider,
  external_user_id)`. The recon FAQ notes that shared accounts break sync, so we refuse
  the link with a clear error.
- **The plan revision always moves forward.** Unique `(plan_id, to_revision)` on
  `plan_adjustments`. Two concurrent adaptations cannot both commit.
- **Pace bounds** (120–1200 s/km), RPE 1–5, 3–5 sessions/week, and repeat-step shape,
  all as check constraints.
- **Watch export is stale after a plan change.** `watch_exports.plan_revision` is
  compared with `plans.revision`.

## API

All routes are Next.js route handlers under `/api`. They authenticate with the Supabase
JWT (`Authorization: Bearer`) and run one `requireUser()` check before touching data.
"Owner" means the row belongs to `auth.uid()`. Reads that RLS already covers go straight
from the app through supabase-js and are marked *(direct)*.

### F01 onboarding / F09 re-evaluation

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST /api/onboarding | Saves the questionnaire, creates `runner_profiles` and a `reference_times` row of type `estimate`, and computes the pace zones | signed-in user | `{age, sex, experience, weeklyVolumeKm, recentRace?}` | `{vmaKmh, paceZones}` | F01 S02→S04 |
| POST /api/reference-times | Records a 1500 m test or a race result, recomputes the zones, and adapts the active plan | owner | `{source, distanceM, durationS, measuredOn}` | `{paceZones, adjustment?}` | F09 S26 |
| GET /api/me/level | Returns the current zones plus how they were estimated | owner | — | `{paceZones, source, measuredOn}` | S04 |

### F02 goal and plan

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| GET /api/races | Searches races (full-text, date, distance, D+, country) | anyone (public, cached) | `?q&from&to&minDist&maxDist&discipline&page` | `{races[], next}` | F02 S19 |
| GET /api/races/:id | Race detail with the count of members who have it as their goal | anyone | — | `{race, membersCount}` | S20 |
| POST /api/races | Submits a missing race (pending review) | signed-in user | race fields | `{race}` | F02 edge |
| POST /api/plans/preview | Dry run: weeks, volume per week and target-time estimate for 3, 4 and 5 sessions/week | signed-in user | `{goal, sessionsPerWeek?}` | `{options:[{spw, peakVolumeKm, predictedTimeS}], warnings[]}` | S06 |
| POST /api/plans | Creates the goal and plan, or returns 402 if the goal needs `training` and the runner has no entitlement | signed-in user | `{goal, sessionsPerWeek, secondaryGoals[]}` | `{planId}` / 402 `{paywall:'training'}` | F01 F02 S05→S06→S08 |
| GET /api/plans/current | The plan with its weeks and phases | owner *(direct OK)* | — | `{plan, weeks[]}` | S09 |
| POST /api/plans/current/abandon | Ends the plan | owner | `{reason?}` | `{ok}` | S24 |
| PATCH /api/plans/current/settings | Changes sessions per week or nutrition, then regenerates the future weeks | owner | `{sessionsPerWeek?, nutritionEnabled?}` | `{adjustment}` | S24 |

### F03 / F04 / F05 / F06 doing the week

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| GET /api/week?start= | The week's sessions with steps and status, plus any unseen `plan_adjustments` | owner *(direct OK)* | ISO date | `{sessions[], adjustments[]}` | F03 F04 S08 |
| GET /api/sessions/:id | Session detail with steps, paces, purpose text and export state | owner *(direct OK)* | — | `{session, steps[], exports[]}` | S10 |
| POST /api/sessions/:id/move | Moves a session to another day and warns if two hard days end up back to back | owner | `{to: date, force?: bool}` | `{session, warnings[]}` | F06 S16 |
| POST /api/sessions/:id/skip | Marks the session skipped and starts adaptation | owner | `{reason?}` | `{adjustment?}` | F05 |
| POST /api/sessions/:id/export | Sends the structured workout to the linked watch. Refused outside the current week and for `test` sessions | owner + Training | `{provider, toleranceSPerKm, targetOn}` | `{export}` | F03 S11 |
| POST /api/activities | Uploads a phone-tracker run or a manual activity, and matches it to a session | owner | `{source:'tracker'|'manual', sessionId?, startedAt, timezone, durationS, distanceM, elevationM, laps[], polyline?}` | `{activity, matchedSessionId?}` | F04 F07 S12 S15 |
| GET /api/activities?before= | The journal, as a paged list | owner *(direct OK)* | cursor | `{activities[], next}` | S17 |
| GET /api/activities/:id/summary | Planned vs actual per step | owner | — | `{steps:[{planned, actual}], totals}` | S14 |
| POST /api/feedback | Saves RPE, a note and a pain flag, then emits `feedback.created` for adaptation | owner | `{sessionId|activityId, rpe, note?, pain?}` | `{feedback}` | F05 S13 |
| POST /api/adjustments/:id/seen | Dismisses the "plan updated" banner | owner *(direct OK)* | — | `{ok}` | S08 |
| GET /api/stats?range= | Weekly volume, pace trend and predicted race time | owner | `8w|26w|1y` | `{weeks[], trend[], predictedTimeS}` | S18 |

### F08 connections

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| GET /api/connect/:provider/start | Starts OAuth with a `state` that carries the user id and a PKCE verifier | owner | — | 302 to provider | F08 S25 |
| GET /api/connect/:provider/callback | Exchanges the code, stores encrypted tokens, subscribes to the provider's webhooks, and refuses an account already linked elsewhere | provider redirect | `code, state` | 302 to app deep link | F08 |
| DELETE /api/connect/:provider | Revokes the link at the provider and deletes the tokens | owner | — | `{ok}` | S25 |

### Billing, notifications, account

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| GET /api/entitlements | The current tier, trial state and renewal date. The app also asks the RevenueCat SDK directly | owner *(direct OK)* | — | `{tier, status, trialEndsAt}` | S07 |
| POST /api/push-tokens | Registers an Expo push token | owner *(direct OK)* | `{token, platform}` | `{ok}` | S27 |
| PATCH /api/notification-prefs | Sets the reminder time and toggles | owner *(direct OK)* | prefs | `{prefs}` | S24 |
| GET /api/me/export | GDPR export as a JSON zip | owner | — | file | S24 |
| DELETE /api/me | GDPR delete: revokes provider links, deletes the auth user (cascades), and keeps only the billing records the law requires | owner | `{confirm:true}` | `{ok}` | S24 |

### Later (milestone 4)

| method path | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| POST /api/crews | Creates a crew | signed-in user | `{name, city?}` | `{crew, inviteUrl}` | F10 S22 |
| POST /api/crews/join | Joins a crew with an invite code | signed-in user | `{code}` | `{crew}` | F10 |
| POST /api/crews/:id/events | Adds a crew calendar event | member | `{title, startsAt, raceId?}` | `{event}` | S22 |
| POST /api/challenges/:id/join | Joins a challenge | member / anyone for global | — | `{entry}` | F10 S23 |
| GET /api/learn/:slug | Learn article, with the body withheld when `requires_tier` exceeds the user's tier | signed-in user | — | `{article}` | S21 |

**Routes: 35** (30 in milestones 1–3, 5 later), plus 5 webhook endpoints.

### Webhooks in

| from | path | events | handling |
| --- | --- | --- | --- |
| RevenueCat | POST /api/webhooks/revenuecat | INITIAL_PURCHASE, RENEWAL, CANCELLATION, EXPIRATION, BILLING_ISSUE, TRIAL_* | Checks the shared-secret header and inserts into `private.webhook_events` (a duplicate means a no-op). Then it re-fetches the subscriber from the RevenueCat REST API and upserts `subscriptions`. It never trusts the event's ordering. |
| Strava | GET+POST /api/webhooks/strava | subscription validation, activity create/update/delete, athlete deauthorize | Records the event id, then queues `activity.import` in Inngest. It answers within 2 s, as Strava requires. |
| Garmin Health/Activity API | POST /api/webhooks/garmin | activity push, deregistration | Same pattern. Needs Garmin Connect Developer Program approval. |
| Coros, Suunto | POST /api/webhooks/{coros,suunto} | activity push | Same pattern. Needs partner approval for each brand. |

Webhooks out: none in v1.

### Jobs (Inngest)

| job | trigger / schedule | does |
| --- | --- | --- |
| `activity.import` | provider webhook | Fetches the activity with the user's token (refreshing it if needed), upserts `activities` on `(user, source, external_id)`, matches the session, and emits `activity.matched` |
| `session.match` | `activity.matched` / manual or tracker upload | Matches the session of the same local day and type that is closest in distance, sets it `done`, and prompts for feedback (push) |
| `plan.adapt` | `feedback.created`, `session.skipped`, `reference.updated`, settings change | Locks the plan row (`select … for update`), runs the engine on future sessions only, writes the new steps, bumps the revision, inserts `plan_adjustments` with a readable summary, and marks open watch exports `stale` |
| `sessions.mark_missed` | hourly | Sessions still `planned` whose local day ended more than 36 h ago become `missed` and feed `plan.adapt` (batched per user per day) |
| `reminders.session` | every 15 min | Pushes "today: 6×3' threshold" to users whose `reminder_local_time` falls in the window in their own time zone |
| `trial.ending_email` | daily 08:00 Europe/Paris | Emails users whose trial ends in 4 days (as the original does, per the recon FAQ) |
| `tokens.refresh` | every 30 min | Refreshes provider tokens that expire within 1 h, and sets `connections.status='error'` on failure |
| `exports.resend_stale` | `plan.adapted` | Re-sends this week's exported sessions that are now stale, if the user turned on auto-update |
| `cleanup` | daily 03:00 UTC | Deletes processed `webhook_events` older than 30 days and orphaned storage files |
| `account.delete` | `DELETE /api/me` | Revokes provider links, deletes storage files, then deletes the auth user |

## The parts that bite

- **The plan engine is the product.** Base it on public training science: VDOT / VMA
  pace tables, a speed–duration curve, classic periodisation (base → build → specific →
  taper), and the 10% weekly-volume ceiling. Do not use Campus's method. Version it
  (`plans.engine_version`). Adaptation edits **future** sessions only and caps each
  change (≈ ±5% pace for new users, ±2% for established ones, following the public
  changelog's behaviour). It keeps a golden-file test suite: profile + goal + feedback
  sequence → expected plan.
- **Time zones and daylight saving.** Sessions are `date` values in the runner's own
  time zone, not timestamps. "Today", "missed" and reminder times are computed with
  `profiles.timezone` (IANA). Activities keep `started_at` in UTC plus the time zone
  they were run in, so a run abroad matches the right planned day. Weeks start on
  Monday. Test the last Sunday of March and of October.
- **Idempotency.** Every webhook goes into `private.webhook_events (provider, event_id)`
  first, and a conflict means it was already handled. Imports are upserts on the
  provider id. Feedback and activity POSTs accept an `Idempotency-Key` header, because
  the tracker uploads on a flaky connection and retries.
- **Races.**
  - Two adaptations at once (feedback arrives just as the hourly missed-session job
    runs): solved by a row lock on `plans` plus the unique revision.
  - A user moves a session while an adaptation is rewriting it: the move goes through
    the same lock.
  - A watch export of a revision that has been replaced: marked `stale`.
- **Rate limits.**
  - Strava: 200 requests per 15 min and 2,000 per day per app by default. Don't
    backfill history on connect; the recon says the original doesn't either. Fetch
    only on webhook, and ask Strava for a higher limit before launch.
  - Garmin, Coros and Suunto: limits come with the partner agreement.
- **Platform approvals (schedule risk, not code risk).**
  - Garmin Connect Developer Program (Training API to push workouts, Activity API to
    read runs).
  - Coros and Suunto partner programs.
  - Strava API terms forbid using Strava data for AI/ML training and limit showing it
    to other users. Strava data stays private to its owner, so Crews and challenges
    don't count activities that came from Strava.
  - Apply in week 1. Approvals take weeks.
- **In-app purchase rules.** A digital subscription bought inside the app must go
  through App Store / Play Billing. The EU (DMA) allows external purchase links with
  their own fees and wording, so keep v1 IAP-only. Entitlement is checked on the
  server (`subscriptions`) for every paid route, not only in the app.
- **Background GPS.** iOS needs "Always" location to be justified in the App Review
  notes, plus the background-location mode. Android needs a foreground service
  notification. Battery: sample every 1–2 s while running and pause on auto-pause. Save
  points to local SQLite as the run goes, so a crash or a kill loses nothing, and
  upload when the run ends.
- **Offline.** The week view, session detail and tracker must work with no signal
  (trail runs). Cache the current and next week on the device. Feedback and activities
  queue locally and sync with idempotency keys.
- **Search.** Use Postgres full-text search (`races.search` GIN) plus filters. That is
  enough for a few thousand races. You don't need Algolia.
- **Email deliverability.** Resend with SPF, DKIM and DMARC on your own domain, and
  transactional email only. Marketing email is opt-in (`marketing_email`).
- **GDPR.** Health-adjacent data: RPE, the pain flag, heart rate and GPS traces. Host
  in the EU, have a DPA with every processor, offer export and deletion endpoints, keep
  GPS polylines private, and add a privacy policy that names Strava and Garmin as
  sources. Ask for consent for the optional pain and heart-rate fields.
- **Multi-tenancy.** Not relevant: it's a single consumer tenant. Crews are the only
  shared data, guarded by `is_crew_member()`.
- **File size limits.** A tracker upload is about 1 point/s × 3 h ≈ 10k points.
  Compress it as an encoded polyline (≈ 50 KB), and cap the request at 2 MB.

## Build order

### 1. Vertical slice: sign up → plan → run → feedback → plan changes (ugly)

- Screens: S01, S02, S04, S05 (race goal by hand, no directory), S06 (fixed 4/week),
  S08, S10, S13.
- Tables: `profiles`, `runner_profiles`, `reference_times`, `goals`, `plans`,
  `plan_weeks`, `sessions`, `session_steps`, `activities`, `feedback`,
  `plan_adjustments`.
- Routes: `POST /api/onboarding`, `POST /api/plans`, `GET /api/week`,
  `GET /api/sessions/:id`, `POST /api/activities` (manual only), `POST /api/feedback`.
  Plus the `plan.adapt` job, which runs inline at first.
- Engine v0: pace zones from the estimate, and a 3-phase plan from a half-marathon
  template, built from public science.
- Done when a new user can create a plan, log a run, rate it "extrême", and see the next
  hard session's paces slow down, with a banner saying so.

### 2. Must-haves (from `features.csv`)

- **Onboarding.** Apple and Google sign-in (S01) and all ~10 questions (S02).
- **Goals and plan.**
  - All goal types (S05).
  - 3–5 sessions/week with `POST /api/plans/preview` (S06).
  - Plan lengths from 6 weeks to 12 months.
  - The plan overview (S09).
  - Move a session (S16, `/move`).
  - Mark sessions done or missed, with `sessions.mark_missed`.
  - Engine v1 with golden tests.
- **Strava.** Connect (S25, F08), the webhook, `activity.import`, `session.match`,
  and planned-vs-actual matching.
- **Paywall.** RevenueCat products with a 14-day trial (S07). Wire up the free
  programmes (evaluation, beginner, injury return), the 402 on paid goals, the
  RevenueCat webhook and the `subscriptions` table.
- **Account.** GDPR export and delete. These are not in the matrix but must ship.

### 3. Should-haves

- **Phone tracker** with step guidance and audio cues (S12), offline queue and local
  SQLite.
- **Session summary**, planned vs actual (S14).
- **Watch export:** Garmin first (S11, `/export`, tolerance, stale handling), then
  Coros, Suunto and Apple Watch (WorkoutKit) as approvals arrive.
- **Trail.** Sessions with D+ targets.
- **Plan options.** Secondary races and the 1500 m test / re-evaluation (S26).
- **Logging.** Manual activity (S15), journal (S17) and stats (S18).
- **Race directory** (S19, S20, `GET /api/races*`), seeded from your own sources, plus
  user submissions.
- **Notifications.** Push reminders and the trial-ending email (S27). Difficulty slider.

### 4. Could-haves, then fixes

- **Content.** Learn articles (S21) and the Gut Training nutrition notes.
- **Strength.** Strength sessions.
- **Sharing.** A share visual of a completed session.
- **Community.** Crews, crew events and challenges (S22, S23), and badges.
- **Races.** "Members running this race" on the race page, and the public web race
  directory for SEO.
- **Fixes from `/replica-entrepreneur`.** It hasn't run yet. Two fixes from the recon
  are already designed in:
  - a readable "what changed" summary on every adaptation (`plan_adjustments.summary`);
  - fewer taps to put a session on the watch: an auto-export setting that pushes the
    whole current week, instead of one session at a time.

## Changes made while building the backend

See `replica/backend.md` → "Decisions that differ". In short:
- workout steps are a jsonb column on `sessions`;
- a Postgres job queue replaces Inngest;
- cron routes are GET;
- account deletion is SQL on `auth.users`;
- RevenueCat stays the payment path (in-app purchase rules); Stripe is for a
  later web checkout only.
