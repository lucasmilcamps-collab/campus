// Verifies Supabase access tokens. With SUPABASE_URL set, against the project's
// published signing keys (JWKS); otherwise with the legacy shared secret.

import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { env } from './env';
import { unauthorized } from './errors';

export interface AuthUser {
  id: string;
  email: string;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

export async function verifyAccessToken(header: string | null | undefined): Promise<AuthUser> {
  const m = header?.match(/^Bearer\s+(.+)$/i);
  if (!m) throw unauthorized();
  const e = env();
  let payload: JWTPayload;
  try {
    if (e.SUPABASE_JWT_SECRET) {
      ({ payload } = await jwtVerify(m[1], new TextEncoder().encode(e.SUPABASE_JWT_SECRET), { audience: 'authenticated' }));
    } else {
      jwks ??= createRemoteJWKSet(new URL(`${e.SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
      ({ payload } = await jwtVerify(m[1], jwks, { audience: 'authenticated', issuer: `${e.SUPABASE_URL}/auth/v1` }));
    }
  } catch {
    throw unauthorized();
  }
  const sub = payload.sub;
  if (!sub || !/^[0-9a-f-]{36}$/i.test(sub)) throw unauthorized();
  return { id: sub, email: typeof payload.email === 'string' ? payload.email : '' };
}

// ---------------------------------------------------------------- short-lived server tokens (OAuth state)

const appKey = () => new TextEncoder().encode(env().APP_SECRET);

export async function signState(claims: Record<string, string>, ttlSeconds = 600): Promise<string> {
  return new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(`${ttlSeconds}s`).setAudience('oauth-state').sign(appKey());
}

export async function verifyState(token: string): Promise<Record<string, unknown>> {
  const { payload } = await jwtVerify(token, appKey(), { audience: 'oauth-state' });
  return payload as Record<string, unknown>;
}

/** Test helper: an access token shaped like Supabase's (HS256 with the test secret). */
export async function signTestAccessToken(userId: string, email = 'test@example.com'): Promise<string> {
  const secret = env().SUPABASE_JWT_SECRET;
  if (!secret) throw new Error('signTestAccessToken needs SUPABASE_JWT_SECRET');
  return new SignJWT({ email, role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret));
}
