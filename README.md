# Running-coach app (working name: Stride)

A rebuild of an adaptive running-plan app's core features. Planning docs are in
`replica/`: recon, architecture, design, build log and backend.

| path | what |
| --- | --- |
| `apps/mobile` | Expo app (iOS, Android, web). Runs on an on-device demo backend unless `EXPO_PUBLIC_*` settings are set |
| `apps/api` | Next.js API (Vercel) |
| `packages/engine` | plan generator and adaptation, pure TypeScript |
| `packages/server` | API routes, auth, database access, integrations, jobs |
| `packages/contract` | types and validation shared by app and server |
| `supabase/` | migrations, seed, email template |

```bash
pnpm install
pnpm --filter @stride/engine test        # plan engine
pnpm test:server                         # API against a throwaway Postgres (needs Postgres binaries)
pnpm test:api-smoke                      # the built API over HTTP (run `pnpm --filter @stride/api build` first)
pnpm test:contract                       # the app's HTTP client against the running API
pnpm --filter @stride/mobile web         # the app in a browser (demo backend)
```

Configuration: `.env.example` lists every variable. Setup steps:
`replica/backend.md`.
