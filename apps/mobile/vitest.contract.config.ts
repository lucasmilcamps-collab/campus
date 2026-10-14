import { defineConfig } from 'vitest/config';

// The client/server contract test: the app's real HTTP client against the real
// API server and database. Run with `pnpm test:contract` from the repo root.
export default defineConfig({
  test: { include: ['src/**/*.contract.ts'], testTimeout: 30_000, hookTimeout: 120_000 },
});
