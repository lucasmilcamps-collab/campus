// Account deletion that deletes. Revokes provider access first, then removes
// the auth user; every table cascades from it (profiles -> plans, sessions,
// activities, feedback, connections, tokens, push tokens, subscriptions).
// Store subscriptions are not cancelled by this: Apple and Google only let
// the runner do that, so the app says so before confirming.

import * as strava from './strava';
import type { Ctx } from './service';

export async function deleteAccount(x: Ctx): Promise<void> {
  await strava.disconnect(x.c, x.userId).catch(() => undefined);
  // the server's database role may delete from auth.users on Supabase; this
  // also ends every session (auth.sessions and refresh tokens cascade)
  await x.c.query('delete from auth.users where id = $1', [x.userId]);
  // belt and braces for databases where auth.users isn't the cascade root
  await x.c.query('delete from public.profiles where id = $1', [x.userId]);
}
