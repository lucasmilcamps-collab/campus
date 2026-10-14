// Every setting the server reads, validated once. Names match .env.example.
// Integrations whose keys are absent are simply off (their routes say so).

import { z } from 'zod';

const Env = z.object({
  DATABASE_URL: z.string().min(1),
  // Supabase Auth: verify access tokens with the project's JWKS (asymmetric keys),
  // or with the legacy shared JWT secret if the project still uses one.
  SUPABASE_URL: z.url().optional(),
  SUPABASE_JWT_SECRET: z.string().min(32).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  // Public URL of this API, for OAuth redirects (no trailing slash).
  API_URL: z.url().default('http://localhost:3000'),
  // Deep link the OAuth callback sends the runner back to.
  APP_RETURN_URL: z.string().default('stride://connections'),
  // Signs OAuth state and other short-lived server tokens.
  APP_SECRET: z.string().min(32),
  // 32 bytes, base64: encrypts provider tokens at rest.
  TOKEN_ENC_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, 'TOKEN_ENC_KEY must be 32 bytes, base64'),
  CRON_SECRET: z.string().min(16),
  REVENUECAT_WEBHOOK_AUTH: z.string().min(16).optional(),
  REVENUECAT_SECRET_KEY: z.string().min(10).optional(),
  STRAVA_CLIENT_ID: z.string().optional(),
  STRAVA_CLIENT_SECRET: z.string().optional(),
  STRAVA_VERIFY_TOKEN: z.string().min(16).optional(),
  STRAVA_SUBSCRIPTION_ID: z.coerce.number().int().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Coach <coach@example.com>'),
});
export type Env = z.infer<typeof Env>;

let cached: Env | null = null;
export function env(): Env {
  if (cached) return cached;
  const parsed = Env.safeParse(process.env);
  if (!parsed.success) {
    // names only, never values
    const bad = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`server env invalid or missing: ${bad}`);
  }
  if (!parsed.data.SUPABASE_URL && !parsed.data.SUPABASE_JWT_SECRET) {
    throw new Error('server env: set SUPABASE_URL (JWKS) or SUPABASE_JWT_SECRET to verify access tokens');
  }
  cached = parsed.data;
  return cached;
}

/** Tests replace the environment wholesale. */
export function setEnvForTests(e: Partial<Env>) {
  cached = Env.parse({ ...process.env, ...e });
}
