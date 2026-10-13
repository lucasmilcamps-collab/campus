# Build log

App: `apps/mobile` (Expo SDK 57, Expo Router, React Native 0.86, web via react-native-web).
Engine: `packages/engine` (pure TypeScript, 30 tests).
Data: `apps/mobile/src/data/fake.ts`, an on-device fake with the same interface
as the planned API (`src/data/api.ts`). `/replica-backend` swaps it for the real
client; no screen changes.

Checks run on every screen below, in a browser against the web export:
- `e2e/slice.mjs`: the core loop end to end
- `e2e/states.mjs`: empty, error, long content, 1440px, keyboard-only and the other must-have flows

Both pass with no console errors. Screenshots are in `replica/clone-screens/`, at
390×844 unless the name says 1440.

| ID | date | status | missing | harder than expected |
| --- | --- | --- | --- | --- |
| S01 Welcome / auth | 2026-10-13 | partial | Apple and Google sign-in, email code (OTP): need Supabase Auth. Email-only on the fake layer. "Voir une démo" loads a seeded runner. | — |
| S02 Questionnaire | 2026-10-13 | done | — | `useMutation` captured the first render's data, so submits sent stale values. Fixed in the hook for every screen. |
| S03 Strava (onboarding) | — | stub | everything; needs real OAuth | — |
| S04 Level | 2026-10-13 | done | — | Fixed %VMA bands put threshold slower than 10 km pace for mid-level runners. Race-pace zones now come from predicted race times. |
| S05 Goal | 2026-10-13 | done | no native date picker (DD/MM/YYYY field with validation); ultra uses the trail/road templates | — |
| S06 Plan setup | 2026-10-13 | done | — | run/walk programmes needed their own engine path, not race templates with 30 s VMA reps |
| S07 Paywall | 2026-10-13 | partial | real purchases (RevenueCat, App Store, Play); prices are placeholders until `/replica-launch` | — |
| S08 Home | 2026-10-13 | done | — | `/` was claimed by both the entry gate and the home tab; home moved to `/home`. Screens blanked on every refetch; loading now shows only when there is no data yet. |
| S09 Plan overview | 2026-10-13 | done | — | — |
| S10 Session detail | 2026-10-13 | done | — | — |
| S11 Export to watch | — | stub | everything; needs the Garmin/Coros/Suunto partner programs | — |
| S12 Phone tracker | — | stub | everything (background GPS, audio cues, offline buffer) | — |
| S13 Feedback | 2026-10-13 | done | — | — |
| S14 Session summary | — | stub | planned vs actual needs real activity data (tracker or imports) | — |
| S15 Manual activity | 2026-10-13 | done | — | — |
| S16 Move session | 2026-10-13 | done | — | — |
| S17 Journal | 2026-10-13 | done | — | — |
| S18 Stats | — | stub | charts | — |
| S19 Race search | 2026-10-13 | partial | date and D+ filters; real race data (8 fictional demo races) | — |
| S20 Race detail | 2026-10-13 | partial | map; real member counts | — |
| S21 Learn | — | stub | milestone 4 | — |
| S22 Crews | — | stub | milestone 4 | — |
| S23 Challenges | — | stub | milestone 4 | — |
| S24 Profile | 2026-10-13 | done | GDPR data export (needs backend); the account-deletion confirmation is an inline banner, not a dialog | Changing sessions per week regenerated sessions with IDs that collided with past ones (11 duplicates). New sessions now get revision-scoped IDs. |
| S25 Connections | 2026-10-13 | partial | real OAuth and webhooks per provider | — |
| S26 Re-evaluate | — | stub | milestone 3 | — |
| S27 Notifications | — | stub | push and email need the backend | — |

Screens: 17 built (12 done, 5 partial), 10 stubs. Must-haves in `features.csv`: 14 yes, 6 partial, 0 no.

## Cross-cutting notes

- **Keyboard on web.** react-native-web only activates `role="button"` with
  Enter or Space. Radios, segmented options, the effort scale and day tabs got
  web key handling (`keyActivate` in `theme`). The older `accessibilityState`
  prop never reached the DOM, so web screen readers saw no checked or selected
  state. All primitives now use `aria-*` props.
- **Tokens.** No raw colours or font sizes outside the generated
  `src/theme/tokens.ts`. Deviation from the design step: `StyleSheet` with
  `tokens.ts` instead of NativeWind, which needed fragile monorepo build
  config. A few fixed sizes remain in primitives: the 56px effort circles, the
  6px day dots and the 120px step-label column. Move them into `tokens.json`
  if they need to change.
- **Font.** The system font for now. Inter (OFL) loads with `expo-font` when
  the build moves to native.
- **TypeScript.** `tsc` overflows the default stack on this app's library
  types (deep generics). `npm run typecheck` runs it with
  `--stack-size=16000`, which finishes with 0 errors.
- **Dev query parameters** (web only): `?seed=new|demo`, `?today=YYYY-MM-DD`,
  `?fail=<method,…>`. See `apps/mobile/e2e/README.md`.
- **Sandbox limits.** The Expo version API (`api.expo.dev`) is blocked here, so
  SDK versions were pinned from `expo/bundledNativeModules.json`. Run
  `npx expo install --fix` on a normal network. No iOS or Android build has
  run yet. Everything was verified on the web build only.
- **Commits.** Screens were built in batches, not one commit per screen:
  shell + slice, states + fixes, then this matrix update.
