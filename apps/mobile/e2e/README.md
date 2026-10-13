# End-to-end checks (web build)

```bash
cd apps/mobile
EXPO_OFFLINE=1 npx expo export --platform web --output-dir dist
npx serve -s dist -l 8081          # any static server with SPA fallback
node e2e/slice.mjs http://localhost:8081 ../../replica/clone-screens
```

`slice.mjs` drives the vertical slice the way a runner would (roles and labels,
no test IDs needed): sign up, questionnaire, level, goal, plan setup, paywall
and trial, home, missed sessions, a hard session rated "Extrême", the plan
adapting with its reason, and the tabs. It saves screenshots for replica-diff
and fails on any console error.

Dev query parameters (web only): `?seed=new` (empty account), `?seed=demo`
(a runner three weeks into a half-marathon plan), `?today=YYYY-MM-DD` (pins
the date for the browser session), `?fail=week,plan` (those API calls fail,
to see error states).

`/replica-test` grows this into the full Playwright suite.
