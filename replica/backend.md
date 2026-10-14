# Backend

Status, 2026-10-14. Everything below is built and tested against a real Postgres
16, with Strava, RevenueCat and Resend stood in for by stubs. **Nothing runs
against your live accounts yet.** No Supabase project, store, Strava app or email
domain was created; those are yours to create (setup list below).

## What's here

| part | where | tested by |
| --- | --- | --- |
| Migrations | `supabase/migrations/` (0001 = architecture schema, 0002 = backend changes) | applied on every test run; re-run is a no-op |
| Migrate / seed | `pnpm db:migrate`, `pnpm db:seed` (fictional demo races) | idempotent, checked twice in a row |
| API contract | `packages/contract`: response types + zod schema for every request | shared by app and server |
| Server | `packages/server`: one route table, auth, validation, rate limits, services, integrations, jobs | `pnpm test:server`: 25 tests, two users |
| HTTP app | `apps/api` (Next.js 16, one catch-all route, Vercel Cron in `vercel.json`) | `pnpm test:api-smoke`: 13 checks over real HTTP |
| App client | `apps/mobile/src/data/http.ts` + `supabase.ts` | `pnpm test:contract`: the app's client against the running API, 4 tests |
| Demo backend | `apps/mobile/src/data/fake.ts`, used when the app has no API settings | browser e2e (`apps/mobile/e2e`) |

Routes: 36 under `/api` (the 35 in `architecture.md` plus `/entitlements/refresh`)
and 5 cron routes. See `packages/server/src/router.ts`.

## Auth

- **Supabase Auth.** Sign-in is a 6-digit email code: no password, so no reset
  flow to build. Apple and Google sign-in go through your own developer apps,
  using PKCE with the in-app browser.
  - Sign-in is passwordless by choice, matching the "pas de mot de passe" promise
    on S01. The skill's "email sign up with verification" is covered: a code
    *is* verification.
- **Sessions.** The skill's "http-only cookies" don't apply to a native app. On
  iOS and Android, tokens live in the Keychain / Keystore (chunked, via
  `expo-secure-store`); on web, in localStorage. "Sign out everywhere" exists
  (Profile), and it revokes every refresh token.
- **API auth.** The API verifies access tokens against your project's published
  keys (JWKS), or the legacy shared secret if your project still uses one.
- **A deleted account's token stops working at once.** Its next request gets a
  401, before the token expires.
- **Roles and teams.** None: the recon has no roles. Crews (milestone 4) will
  add `admin | member` through `crew_members.role`.
- **Account deletion** (`DELETE /me` with `{confirm: true}`) revokes Strava,
  then deletes the auth user; every table cascades from it. Tested: nothing
  remains. Store subscriptions can only be cancelled by the runner, so the
  confirmation says so.

## Database and access rules

- **Two lines of defence.** The API connects with a role that bypasses RLS, so
  *every* query in `packages/server` is scoped to the signed-in user's id; that
  is the access rule for API traffic. Row-level security stays on for every
  table, for anything that talks to Supabase directly.
- **Tested with a second user.** Through the API, B gets 404 or empty results on
  all of A's plan, sessions, feedback, activities, adjustments and connections,
  and every write B attempts on A's data fails. Directly in Postgres as the
  `authenticated` role with B's JWT claims, B sees 0 rows and updates 0 rows.
- **Not in the browser.** Provider tokens, the job queue, webhook logs and rate
  limits live in the `private` schema, which the Supabase API doesn't expose.
- **Backups.** Supabase's daily backups are on by default on paid plans; the free
  plan has none. **Before launch, use a paid plan or schedule `pg_dump` yourself.**

## Payments: RevenueCat, not Stripe

The skill's default is Stripe Checkout, but this is a mobile app selling a
digital subscription, so App Store and Google Play rules require in-app
purchase. RevenueCat wraps both stores, the trial and receipts
(`architecture.md` chose it). Stripe only comes in if we sell on the web later.

- **Webhook** (`POST /api/webhooks/revenuecat`): checks the Authorization header
  (constant-time comparison), stores the event id (a repeat is a no-op), then
  **re-reads the subscriber from RevenueCat's API** and writes our
  `subscriptions` row. It never trusts the event body's state.
- **The server decides.** Paid goals are refused with 402 when
  `subscriptions` says no. The app never decides.
- **Cancelling** is the stores' own one-tap flow; the trial email tells the
  runner where.
- **Not done:** the purchase button in the app. The RevenueCat SDK is a native
  module (needs an EAS development build, not Expo Go or web). Until it's added,
  the real backend's paywall says purchases aren't available yet;
  `/entitlements/refresh` (restore) works.

## Email and jobs

- **Email.** Resend, from your domain. Today it sends one email (trial ending,
  4 days before); the template is ours (`packages/server/src/email.ts`). Sign-in
  codes are sent by Supabase Auth: point its SMTP at Resend and paste
  `supabase/templates/magic_link.html`.
- **Jobs.** A Postgres queue (`private.jobs`): dedupe keys, exponential
  backoff, `dead` after `max_attempts`, and the last error kept. Tested: a
  failing job retries, then lands dead.

  | cron | schedule (UTC) | does |
  | --- | --- | --- |
  | `/api/cron/drain` | every minute | runs due jobs |
  | `/api/cron/mark-missed` | hourly | overdue sessions → missed, using each runner's own "today" |
  | `/api/cron/reminders` | every 15 min | queues a push when a runner's reminder time passes, in their zone |
  | `/api/cron/trial-ending` | daily 07:13 | queues the trial email |
  | `/api/cron/cleanup` | daily 03:23 | old webhook payloads, rate-limit windows, finished jobs |

  Vercel's Hobby plan runs crons once a day at most. The per-minute drain needs
  Pro, or any external scheduler calling the URL with the `CRON_SECRET` bearer.

## Integrations

| integration | API | scopes | review / approval | rate limits | status |
| --- | --- | --- | --- | --- | --- |
| Strava | developers.strava.com, OAuth 2 + webhooks | `activity:read_all` only (needed for runs kept private) | none to start; you're limited to 1 connected athlete until you request a capacity increase, which Strava reviews (takes weeks) | 200 req / 15 min, 2,000 / day per app by default | built, tested against stubs |
| Garmin | Connect Developer Program (Training API to push workouts, Activity API) | per program | partner application and approval (weeks) | per agreement | not started: apply now |
| Coros, Suunto | partner programs | per program | partner application | per agreement | not started |
| RevenueCat | REST v1 + webhooks | secret key, server only | none | generous | built (server), tested against stubs |
| Resend | REST | API key, server only | verify your sending domain (SPF, DKIM) | per plan | built, tested against stubs |
| Expo push | exp.host push API | none (Expo push tokens) | none | per Expo limits | sending built; the app doesn't register tokens yet |
| Apple / Google sign-in | through Supabase Auth | email, name | Apple: Services ID and key; Google: OAuth consent screen. Basic scopes don't need Google's long verification | n/a | built in the app, not run live |

Strava notes:
- **Webhooks aren't signed.** We check the subscription id, store the event id,
  and re-read the activity with the athlete's token, so a forged event can at
  most make us fetch something real.
- **Deauthorisation:** the link is marked revoked and the tokens are deleted.
- **One athlete, one account:** an athlete linked to another account is refused.
- **Terms:** data stays private to its owner, and isn't used for model training.

## Setup, in order (yours to do)

1. **Supabase.** Create a project in an EU region (Frankfurt).
   - Run `DATABASE_URL=… pnpm db:migrate` (or `supabase db push`, not both),
     then `pnpm db:seed`.
   - Authentication → enable Email (OTP) and set the template from
     `supabase/templates/`; set SMTP to Resend.
   - Enable Apple and Google with your developer credentials. Add
     `stride://auth` to Redirect URLs.
   - Copy the URL, anon key and connection string into the env vars.
2. **Vercel.** Import `apps/api` and set every server variable from
   `.env.example`. The cron schedule comes from `vercel.json`.
3. **RevenueCat.** Create the project and add the App Store and Play products:
   a `training` entitlement, monthly and yearly products with a 14-day trial.
   Set the webhook URL `https://<api>/api/webhooks/revenuecat` and an
   Authorization value (→ `REVENUECAT_WEBHOOK_AUTH`).
4. **Strava.** Create your API application with callback domain = your API
   domain. Create the push subscription with your `STRAVA_VERIFY_TOKEN`, and
   store the returned id. Request the athlete capacity increase early.
5. **Resend.** Verify your domain and set `EMAIL_FROM`.
6. **Garmin, Coros and Suunto partner applications.** Start now; they gate S11.
7. **App build.** Set the three `EXPO_PUBLIC_*` variables. Without them the app
   stays on its demo backend.

## Security checklist

- [x] **Secrets only in env vars.** `.env*` is git-ignored (except
  `.env.example`). The web bundle was checked: no server secret names or server
  code in it.
- [x] **Input validated on the server, on every route.** zod schemas in
  `packages/contract`, strict objects so unknown fields are refused, uuids
  checked on path params, JSON-only bodies capped at 1 MB.
- [x] **Authorisation on every read and write, tested with a second user.** Via
  the API and directly in Postgres with RLS.
- [~] **Rate limits.** Per user and per route on every write (and exports and
  deletion); per IP on public routes. Counted outside the request transaction,
  so failed requests count (a bug the tests caught). Sign-in and email-code
  limits are Supabase Auth's: **check them in its dashboard (Auth → Rate
  Limits)**; they aren't in this repo.
- [x] **Webhooks.** RevenueCat: constant-time Authorization check plus a re-read
  from its API. Strava: subscription-id check plus a re-read with the athlete's
  token (Strava doesn't sign). Both idempotent.
- [x] **Uploads: no uploads yet.** Tracker GPS traces arrive as an encoded
  polyline inside the 1 MB JSON cap. Revisit when share images land (Supabase
  Storage, own bucket, size and type limits).
- [x] **No user data in URLs or logs.**
  - Error logs carry route and message only, never bodies or tokens; the smoke
    test checks server output.
  - Two URLs carry ids: the OAuth `state` (signed, expires in 10 min) and
    RevenueCat subscriber URLs (our user uuid, server to RevenueCat only).
- [~] **Dependencies audited** (`pnpm audit --prod`): 4 findings, 2 moderate and
  2 high, **none in the API or server runtime**.
  - All four come through Expo's CLI and build tooling: `uuid` < 11.1.1,
    `decode-uri-component` ≤ 0.4.2, `node-forge` ≤ 1.4.0 (no patched release
    yet), `braces` ≤ 3.0.3 (no patched release).
  - Re-check on each Expo SDK update. Not forced with overrides: a major `uuid`
    jump under Expo risks breaking the toolchain.
- [~] **Privacy policy.** Not written yet (`/replica-launch`). It must list:
  Supabase (database, auth; EU), Vercel (API hosting), RevenueCat, Apple and
  Google (payments), Strava (only if connected), Resend (email), Expo (push),
  and Sentry once added.

Also done:
- Provider tokens encrypted at rest (AES-256-GCM, app-level key; the test
  checks the stored bytes don't contain the token).
- OAuth state signed and expiring.
- `no-store` and `nosniff` on every API response.
- A GDPR export (`GET /me/export`).

## Decisions that differ from `architecture.md`

- **Steps.** `session_steps` became `sessions.steps` (jsonb): always read and
  written with their session, never queried alone.
- **Jobs.** The Postgres job queue replaced Inngest: one less vendor, with the
  retries, backoff and dead-letter state the skill asks for, all testable
  locally.
- **Cron routes are GET**, as Vercel Cron calls them, protected by `CRON_SECRET`.
- **Activities keep a manual RPE and note.** Plans keep their speed model (VMA
  and zones). Goals have a name for races entered by hand.
- **Account deletion is SQL** on `auth.users`: no admin API call or service-role
  key needed.
- **Interim app name.** The app slug and deep-link scheme are `stride` until
  `/replica-brand`.
