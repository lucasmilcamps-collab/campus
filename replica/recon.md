# Recon map: Campus Coach "Running & Trail" (iOS + Android, web site secondary)

Scope: the core training loop. Pick a race goal, get an adaptive plan, run this week's
sessions (from your phone or a watch), give feedback, and the plan adapts. Also
covered: race calendar, watch/Strava sync, and the subscription paywall. The community,
Crews and Gut Training parts are mapped but sit at should/could.
For: proposed, to confirm. A French-speaking (FR/BE) running-coach app sold as a
subscription, with the user's own brand.
Date: 2026-10-13

> **How this was made.** This sandbox's network policy blocks campus.coach and the app
> stores, so nothing was opened directly. Everything below comes from public sources
> read through web search: the official site, the FAQ, the changelog, the store
> listings, the community forum, press and reviews. There was no account and no
> screenshots. Screens and states were inferred from that text, so they are less
> certain than a hands-on walkthrough. Before `/replica-build`, do a walkthrough of
> your own account (or the free "évaluation" programme) to confirm the S-rows marked
> *(inferred)*.

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | help center (FAQ) | https://faq.campus.coach/fr/category/utiliser-campus-10aqvll/ | how the app is used, watch export rules |
| 2 | FAQ: features | https://faq.campus.coach/fr/category/les-fonctionnalites-campus-s4yjrf/ | feature list |
| 3 | FAQ: paces | https://faq.campus.coach/fr/category/les-allures-1rf7p6h/ | paces come from a reference time, with a feel and heart-rate table |
| 4 | FAQ: managing training | https://faq.campus.coach/fr/category/gerer-son-entrainement-gzg8u/ | moving and changing sessions |
| 5 | FAQ: watch export | https://faq.campus.coach/fr/article/comment-exporter-mes-seances-sur-ma-montre-1xcyc69/ | pace tolerance, current week only, no test session |
| 6 | FAQ: nothing to import | https://faq.campus.coach/fr/article/campus-ne-trouve-aucune-seance-a-importer-est-ce-normal-3t9w33/ | history only after connecting, no shared accounts |
| 7 | FAQ: subscription | https://faq.campus.coach/fr/category/abonnement-1vrwrh3 , https://faq.campus.coach/fr/article/combien-coute-un-abonnement-campus-1ydseg8/ | cancel anytime, 14-day trial, email 4 days before the trial ends |
| 8 | pricing / offers | https://campus.coach/abonnement , https://community.campus.coach/c/actualite-campus-running/evolution-des-offres-campus-on-t-explique-tout-simplement | Free (evaluation, beginner, injury-return); Training €15/mo or €119/yr; Premium renamed Training on 2026-01-12 |
| 9 | Campus Pro | https://www.campus.coach/campus-pro | €499/yr, direct access to human experts |
| 10 | changelog | https://www.campus.coach/en/updates | sessions per week (3–5), pace estimate at signup, new identity, race calendar |
| 11 | changelog: sessions per week | https://www.campus.coach/nouveautes/choisis-ton-nombre-de-seances-par-semaine-sur-campus-coach | picker shows the effect on volume and target time |
| 12 | changelog: pace estimate | https://www.campus.coach/nouveautes/estime-tes-allures-de-course-a-pied-sur-campus-coach | age, experience and volume, plus optional Strava; 1500 m test optional |
| 13 | changelog: feedback algorithm | https://www.campus.coach/nouveautes/notre-algorithme-sameliore-pour-mieux-prendre-en-compte-tes-feedbacks | "extreme" RPE on hard sessions; up to 5% / ~2% pace change |
| 14 | changelog: phone tracker | https://campus.coach/nouveautes/tracker-dactivite-courir-sans-montre-gps-avec-campus-coach | run without a watch: live guidance and post-run analysis |
| 15 | changelog: race calendar | https://www.campus.coach/nouveautes/calendrier-courses-course-a-pied | filters, set a race as the goal, members registered |
| 16 | race directory (web) | https://www.campus.coach/courses/recherche , https://www.campus.coach/en/races | public race search |
| 17 | goals features | https://www.campus.coach/en/features/goals | goal types and difficulty level |
| 18 | features overview | https://www.campus.coach/en/running-app-campus , https://www.campus.coach/en/features | plan length 6 weeks–12 months, secondary races |
| 19 | Gut Training | https://www.campus.coach/en/features/gut-training-running-nutrition | race nutrition built into long and hard sessions |
| 20 | App Store | https://apps.apple.com/fr/app/running-trail-campus-coach/id6446962176 | pitch, Campus Learn, journal (5.10), redesigned session screens |
| 21 | App Store (BE) | https://apps.apple.com/be/app/campus-coach-running-trail/id6446962176 | 5.6 session summary, 5.7 manual activity and share visual |
| 22 | Google Play | https://play.google.com/store/apps/details?id=campus.coach.mobileApp | 6.1.0 Crews, goal screen, watch brands |
| 23 | community app | https://apps.apple.com/fr/app/id6475767164 , https://community.campus.coach | separate forum, themed rooms |
| 24 | events / challenges | https://www.campus.coach/communaute-events-challenges | challenges by level, badges |
| 25 | Crews press | https://presseagence.fr/paris-running-lapplication-campus-lance-les-crews-pour-reinventer-la-course-en-groupe/ | groups, shared calendar, group challenges |
| 26 | 5.0 "Home of your run" | https://community.campus.coach/c/actualite-campus-running/mise-a-jour-5-0-0-home-of-your-run | personalised onboarding |
| 27 | review: 12-week half test | https://www.casadeltravel.fr/campus-coach-avis-test-semi-marathon/ | sample week structure |
| 28 | review: TRC | https://blog.therunningcollective.fr/campus-coach-l-application-running-avis-trc/ | overview, pros and cons |
| 29 | Trustpilot | https://www.trustpilot.com/review/campus.coach | Garmin export takes too many taps; community praised |
| 30 | the user's own account | not used | no access from this sandbox |
| 31 | public API docs | none found | none published |

## Core loop

Choose a race goal → Campus builds a periodised plan with personal paces → each week you
run the sessions (watch export, phone tracker or Strava sync) and rate how they felt → the
plan and paces adapt. People pay for **the plan that adapts to you**.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Welcome / auth | first launch | sign up or log in | logo, value prop carousel, email + Apple/Google buttons | default, error *(inferred)* |
| S02 | Onboarding questionnaire | after signup | about 10 questions on fitness, habits and goal | stepper, single/multi choice cards, numeric inputs (age, weekly volume), progress bar | per step, back, validation error *(inferred)* |
| S03 | Strava connect (onboarding) | optional step in S02 | improve the level estimate from history | OAuth button, skip link | connected, skipped, failed |
| S04 | Level and pace estimate | end of S02 | show the estimated level and pace zones; offer the 1500 m test instead | pace table (EF, marathon, half, 10K, threshold, VMA), "do a test" CTA | estimated, test-based, too-old result |
| S05 | Goal picker | onboarding, or Profile → new goal | choose a goal: 5K/10K/half/marathon/trail/ultra, speed, start running, injury return | goal cards, race search entry, date picker, target-time input, difficulty slider | free goal vs paid goal (paywall) |
| S06 | Plan setup | after S05 | sessions per week (3–5) with the effect on volume and target, plan length (6 wk–12 mo), secondary races | segmented picker, impact preview, race list | valid, too-short-for-goal warning *(inferred)* |
| S07 | Paywall / offers | starting a paid goal, settings | Free vs Training (monthly/yearly), 14-day trial, link to Pro | plan cards, price toggle, store purchase sheet | trial eligible, already subscribed, purchase failed, restore |
| S08 | Home / this week | tab 1 | week view of the plan: today's session, the week's sessions, progress to the race | week strip, session cards (type colour, duration, distance), countdown to race, phase label | empty (no plan), rest day, all done, missed session |
| S09 | Plan overview | Home → see plan | the whole plan by week or phase, with volume per week | week accordion or list, volume bars, phase chips (base, specific, taper) | past/current/future weeks |
| S10 | Session detail | tap a session | structured workout: warm-up, blocks (e.g. 6×3' at threshold), cool-down, target paces, purpose text (Campus Learn) | step list with repeat groups, pace chips, totals, Export / Start / Move / Mark done CTAs | road vs trail, test session (no export), done, missed |
| S11 | Export to watch sheet | S10 → Exporter | send the session to Garmin/Coros/Suunto/Apple | pace-tolerance stepper (default ±15 s/km), date picker, brand | no watch connected, out of current week (blocked), success, error |
| S12 | Phone tracker (live run) | S10 → Start | GPS run with live step guidance and audio cues | big metrics (pace, distance, time, step remaining), step progress, pause/lap/stop, audio toggle, D+ for trail | GPS searching, running, paused, step change, finished, permission denied |
| S13 | Session feedback | after a run (tracker, watch sync, or manual) | rate how it felt (RPE, including "extrême") and add a note | emoji/RPE scale, note textarea, pain flag *(inferred)* | required/optional, submitted |
| S14 | Session summary | after S13, or tap a completed session | planned vs actual per step, pace, HR, splits; share visual | comparison table, chart, map, "share" button | full data, partial (no HR), manual entry |
| S15 | Add manual activity | Home/Journal → + | log a run or other activity done outside the plan | type select, date, duration, distance, RPE, note | valid, error |
| S16 | Move / swap session | S10 or long-press | move a session to another day or skip it | day picker, warning on spacing | allowed, conflict warning *(inferred)* |
| S17 | Training journal | tab or profile | list of past sessions with personal notes | timeline list, filters | empty, filled |
| S18 | Stats / progress | tab | volume per week, pace trend, estimated race time | charts, KPI tiles | empty, filled |
| S19 | Race calendar search | tab Races / web /courses/recherche | find races by date, place, distance, D+ | search, filters, result list, map *(inferred)* | no results, filled, loading |
| S20 | Race detail | tap a race | info, members going, "set as goal" | header, facts, member count, CTA | goal set, past race |
| S21 | Campus Learn article | from S10 or Learn tab | coach explainers per session type and pace | article reader, audio *(inferred)* | read, locked (paid) *(inferred)* |
| S22 | Community / Crews | tab | crews: members, shared calendar, group challenges by km/time/D+ | crew list, crew feed, challenge progress, invite link | no crew, member, admin |
| S23 | Challenges and badges | community tab | challenges by level, earned badges | challenge cards, progress, badge grid | joined, completed |
| S24 | Profile and settings | tab | account, connected apps, training settings (nutrition on/off, sessions per week, units), subscription | list rows, toggles | — |
| S25 | Connected apps | Settings → Applications connectées | link Garmin, Coros, Suunto, Strava, Apple Health | brand rows, connect/disconnect | connected, error, wrong account |
| S26 | Re-evaluation / 1500 m test | S04 or settings, or new goal | update the reference time | test instructions, result input | old result, new result |
| S27 | Notifications | system / in-app | session reminders, trial ending (email), plan updated | push, banner | — |

Count: 27 screens (9 marked as partly inferred).

## Flows

```
F01 New runner gets a plan (free path)
    S01 -> S02 -> (S03 skip) -> S04 -> S05 (free goal: "start running" or evaluation week) -> S06 -> S08
    happy path clicks: about 16 (10 questions + 6 confirmations)
    edge: under-age, Strava OAuth fails, user has no reference time, goal is paid -> S07

F02 Runner prepares a race (paid)
    S08/S24 -> S05 (search race S19 -> S20 "set as goal") -> S06 (3–5 per week, secondary races) -> S07 trial -> S08
    happy path clicks: about 8
    edge: race date too close for a plan (under 6 weeks), race in the past, trial already used, purchase cancelled,
          race not in the directory (enter it by hand)

F03 Run today's session with a watch
    S08 -> S10 -> S11 (tolerance, date) -> [run on watch] -> sync -> S13 -> S14
    happy path clicks: 5 (Trustpilot says too many; the number to beat)
    edge: session not in current week (export blocked), test session (no export), watch not linked,
          wrong Garmin account, activity done before linking does not import

F04 Run today's session with the phone
    S08 -> S10 -> S12 (start, follow steps, stop) -> S13 -> S14
    happy path clicks: 4
    edge: GPS denied or lost, app backgrounded, phone call mid-step, trail with no signal

F05 Feedback changes the plan
    S13 (RPE "extrême" on a VMA/threshold session) -> plan recompute -> S08 shows updated paces (banner)
    happy path clicks: 2
    edge: several missed sessions in a row, conflicting feedback, users say it's unclear what changed

F06 Reshuffle the week
    S08 -> S10 -> S16 (move to another day) -> S08
    happy path clicks: 3
    edge: two hard sessions back-to-back, move past the race date

F07 Log an outside activity
    S08 -> S15 -> S13 -> S17
    happy path clicks: 4
    edge: non-running activity (planned support), duplicate of a synced activity

F08 Connect a watch or Strava
    S24 -> S25 -> brand OAuth -> S25 connected
    happy path clicks: 4
    edge: OAuth denied, token expired, two Campus users sharing one account

F09 Re-evaluate level
    S24 -> S26 (1500 m test or new reference time) -> S04 -> plan paces updated
    happy path clicks: 4

F10 Join a crew and a challenge
    S22 -> join via link -> crew feed -> S23 join challenge
    happy path clicks: 3
    edge: invite expired, leaves crew mid-challenge

F11 Cancel the subscription
    S24 -> S07 (manage) -> store subscription page
    edge: plan continues to end of period; paid goal locks afterwards (FAQ: can cancel without stopping the plan)
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary, secondary, ghost, danger, brand (Apple/Google/Strava/Garmin) | default, pressed, disabled, loading | all |
| Choice card | single, multi, with icon | default, selected, disabled | S02, S05, S06, S07 |
| Stepper / progress bar | onboarding, plan progress | — | S02, S08 |
| Segmented control | 3/4/5 per week, monthly/yearly | selected | S06, S07 |
| Number stepper | pace tolerance, target time | min/max | S05, S11 |
| Date picker | day, race date | disabled days | S05, S11, S16 |
| Week strip | — | today, done, missed, rest | S08 |
| Session card | by type: EF, long run, VMA, threshold, race pace, trail, strength, test, rest | planned, done, missed, locked | S08, S09, S17 |
| Workout step list | warm-up, block, repeat group, recovery, cool-down | current (live), done | S10, S12, S14 |
| Pace chip | per zone, colour-coded | — | S04, S10, S12 |
| Pace zone table | — | estimated, test-based | S04, S26 |
| RPE scale | 5 levels from easy to "extrême" | selected | S13 |
| Live metric tile | large, small | normal, warning (off pace) | S12 |
| Chart | bar (volume), line (pace trend), planned-vs-actual | empty, filled | S09, S14, S18 |
| Map | route | — | S14, S19 |
| Bottom sheet | export, move, filters | open, closed | S11, S16, S19 |
| Paywall card | free, training monthly, training yearly, pro | recommended, current | S07 |
| Banner / toast | info (plan updated), success, error | — | S08, S11 |
| List row | nav, toggle, connected-app | — | S24, S25 |
| Race card | — | goal, members count | S19, S20 |
| Badge | earned, locked | — | S23 |
| Bottom tab bar | 4–5 tabs (Home, Plan, Races, Community, Profile) *(inferred)* | active | all main |
| Empty state | no plan, no activity, no crew | — | S08, S17, S22 |

## Inferred data model

```
User        id, email, auth_provider, first_name, birth_year, sex, created_at, locale, units
            evidence: S01, S02 ("age"), FAQ    confidence: high

RunnerProfile  user_id, experience_level, weekly_volume_km, sessions_per_week (3..5),
            reference_time {distance, duration, measured_at, source: estimate|test_1500|race|strava},
            vma_kmh (derived), difficulty_level, nutrition_enabled (bool)
            evidence: S02, S04, S06, sources 11/12/19    confidence: high (fields), medium (names)

PaceZone    profile_id, zone (EF | marathon | half | 10k | threshold | S60 | vma), min_s_per_km, max_s_per_km, hr_hint
            evidence: FAQ paces, changelog "S60"    confidence: medium

Goal        id, user_id, type (race | speed | start | injury_return | evaluation), race_id?, distance_m,
            elevation_gain_m?, date, target_time?, is_primary, status (active|done|abandoned)
            evidence: S05, goals page, "secondary races"    confidence: high

Race        id, name, date, city, country, distance_m, elevation_gain_m, discipline (road|trail), url,
            participants_count (Campus members)
            evidence: S19/S20, race directory    confidence: high

Plan        id, user_id, goal_id, start_date, end_date, weeks, sessions_per_week, tier (free|training),
            status, version (bumps on recompute)
            evidence: S06, S09, F05    confidence: medium (versioning is a guess)

PlanWeek    plan_id, index, phase (base|build|specific|taper|recovery) [guess], target_volume_km
            evidence: S09, review sample week    confidence: guess

Session     id, plan_id, week_index, scheduled_date, type (EF|long|vma|threshold|race_pace|trail|strength|test|rest),
            title, purpose_text, est_duration_s, est_distance_m, status (planned|done|missed|skipped|moved),
            surface (road|trail), nutrition_guidance?
            evidence: S08, S10, FAQ    confidence: high

SessionStep session_id, order, kind (warmup|work|recovery|cooldown|repeat), repeat_count, duration_s?,
            distance_m?, pace_zone, target_pace_s_per_km
            evidence: S10, export to watch (structured workout)    confidence: high

Activity    id, user_id, session_id?, source (tracker|garmin|coros|suunto|strava|apple|manual), external_id,
            started_at, duration_s, distance_m, elevation_gain_m, avg_hr?, polyline?, laps (json), activity_type
            evidence: S12, S14, S15, FAQ "history only after connecting"    confidence: high

Feedback    activity_id/session_id, rpe (1..5, 5 = extrême), note, pain? [guess]
            evidence: S13, algorithm changelog, journal    confidence: high (rpe, note), guess (pain)

Connection  user_id, provider, external_user_id, access_token, refresh_token, scopes, connected_at
            evidence: S25, FAQ    confidence: high

WatchExport session_id, provider, tolerance_s_per_km, target_date, external_workout_id, status
            evidence: S11    confidence: high

Subscription user_id, tier (free|training|pro), period (month|year), store (apple|google|web), status
            (trial|active|cancelled|expired), trial_ends_at, renews_at
            evidence: S07, FAQ    confidence: high

Crew        id, name, city?, invite_code, owner_id; CrewMember crew_id, user_id, role
CrewEvent   crew_id, title, date, race_id?
Challenge   id, crew_id?, metric (distance|time|elevation), target, starts_at, ends_at; ChallengeEntry
Badge       id, name; UserBadge user_id, badge_id, earned_at
            evidence: S22/S23, press, events page    confidence: medium

LearnArticle id, slug, title, body, session_type?, locked
            evidence: S21, App Store "Campus Learn"    confidence: medium
```

Relationships: User 1-1 RunnerProfile, User 1-n Goal, Goal 1-1 Plan (primary goal; secondary
goals reference the same Plan), Plan 1-n PlanWeek 1-n Session 1-n SessionStep,
Session 0-1 Activity, Activity 0-1 Feedback, User 1-n Connection, Session 0-n WatchExport,
Race 1-n Goal, User 1-1 Subscription, Crew n-n User, Crew 1-n Challenge, User n-n Badge.

## Feature matrix

See `features.csv`. Must: 20, should: 16, could: 12, skip: 6.

## Out of scope (cannot or should not be cloned)

- **Their training method and coaching content.** That covers the calibration of the
  pace and adaptation algorithm, the session library, the plan templates and the Campus
  Learn text. You can rebuild a plan generator from public training science (VDOT/VMA
  zones, periodisation), not from theirs.
- **The race directory data.** This is their curated database of French races. Use
  your own sources or user-submitted races.
- **The community and its 600K members, and their content.** You get the feature, not
  the network.
- **Human coaches (Campus Pro).** That is a service, not software.
- **Partner deals.** Running Heroes bibs and race-organiser partnerships.
- **Watch platforms.** The Garmin Connect / Coros / Suunto training APIs need partner
  approval from each vendor. Strava is open, but its API terms forbid using its data to
  train AI models or to build a competing app's dataset. Check them before using Strava
  history for level estimation.
- **Brand.** The name "Campus", the logo, the illustrations, the copy and the brand colours.

## Size

Screens 27, flows 11, entities 17. Hard parts:

1. **The plan generator and its adaptation.** It does periodisation, pace zones from a
   reference time, the 3–5 sessions/week trade-off, secondary races, and recomputing
   from RPE and missed sessions without disrupting the plan. This is the product. Build it
   as a deterministic, testable engine.
2. **Watch export and activity import.** That means structured workouts to Garmin
   Training API, Coros and Suunto, activity webhooks from each provider and Strava, then
   matching each activity to its planned session. It needs partner approvals and
   different APIs per brand.
3. **The phone GPS tracker.** It needs background location, audio cues per step,
   pause/resume, battery use and D+ for trail, on both iOS and Android.

Also: in-app purchases on both stores with a trial, and push and email reminders.

Size: **L (a quarter)** for the core loop on mobile (F01–F06, F08, the paywall). Add
Crews, challenges, the race directory and Gut Training and it reaches XL; those come
after launch.
