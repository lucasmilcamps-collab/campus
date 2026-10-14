// The real Api: Supabase Auth for identity, our /api for everything else.
// Same interface as the fake, so no screen knows which one it talks to.

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ErrorBody, GoalInput } from '@stride/contract';
import { ApiError, type Api, type Connection, type GoalWithRace, type User } from './api';

export function createHttpApi(baseUrl: string, sb: SupabaseClient): Api {
  async function token(): Promise<string | null> {
    return (await sb.auth.getSession()).data.session?.access_token ?? null;
  }

  async function call<T>(method: string, path: string, body?: unknown, query?: Record<string, string | number | undefined>): Promise<T> {
    const t = await token();
    if (!t) throw new ApiError('unauthorized', 'Connecte-toi pour continuer.');
    const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== '') as [string, string][])}` : '';
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api${path}${qs}`, {
        method,
        headers: { Authorization: `Bearer ${t}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError('network', 'Connexion impossible. Vérifie ton réseau et réessaie.');
    }
    if (res.status === 204) return undefined as T;
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const e = (data as ErrorBody | null)?.error;
      throw new ApiError(e?.code ?? 'network', e?.message ?? `Erreur ${res.status}`);
    }
    return data as T;
  }

  async function publicGet<T>(path: string, query?: Record<string, string | number | undefined>): Promise<T> {
    const qs = query ? `?${new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined && v !== '') as [string, string][])}` : '';
    const res = await fetch(`${baseUrl}/api${path}${qs}`).catch(() => {
      throw new ApiError('network', 'Connexion impossible. Vérifie ton réseau et réessaie.');
    });
    const data = await res.json();
    if (!res.ok) throw new ApiError((data as ErrorBody).error.code, (data as ErrorBody).error.message);
    return data as T;
  }

  const me = async (): Promise<User | null> => ((await token()) ? call<User>('GET', '/me') : null);
  const toGoal = (g: GoalWithRace): GoalInput => ({ ...g });

  return {
    capabilities: { oauth: true, emailCode: true, purchases: false, demo: false },

    me,
    async requestSignIn(email) {
      const { error } = await sb.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } });
      if (error) throw new ApiError(error.status === 429 ? 'rate_limited' : 'invalid', error.status === 429 ? 'Trop de demandes. Réessaie dans une minute.' : 'Impossible d’envoyer le code. Vérifie ton adresse.');
      return { codeSent: true };
    },
    async verifySignIn(email, code) {
      const { error } = await sb.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
      if (error) throw new ApiError('invalid', 'Code incorrect ou expiré.');
      return (await me())!;
    },
    async signInWithProvider(provider) {
      const redirectTo = Linking.createURL('auth');
      const { data, error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
      if (error || !data.url) throw new ApiError('invalid', 'Connexion impossible pour le moment.');
      const r = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (r.type !== 'success') return null;
      const code = new URL(r.url).searchParams.get('code');
      if (!code) return null;
      const ex = await sb.auth.exchangeCodeForSession(code);
      if (ex.error) throw new ApiError('invalid', 'Connexion impossible pour le moment.');
      return me();
    },
    async signOut(everywhere) {
      await sb.auth.signOut({ scope: everywhere ? 'global' : 'local' });
    },

    onboarding: (input) => call('POST', '/onboarding', input),
    level: () => call('GET', '/me/level'),

    searchRaces: (q) => publicGet('/races', q),
    race: (id) => publicGet(`/races/${encodeURIComponent(id)}`),
    previewPlan: (goal) => call('POST', '/plans/preview', { goal: toGoal(goal) }),
    createPlan: ({ goal, sessionsPerWeek }) => call('POST', '/plans', { goal: toGoal(goal), sessionsPerWeek }),
    plan: () => call('GET', '/plans/current'),
    abandonPlan: () => call('POST', '/plans/current/abandon'),

    week: (start) => call('GET', '/week', undefined, { start }),
    session: (id) => call('GET', `/sessions/${encodeURIComponent(id)}`),
    moveSession: (id, to, force) => call('POST', `/sessions/${encodeURIComponent(id)}/move`, { to, force }),
    skipSession: (id) => call('POST', `/sessions/${encodeURIComponent(id)}/skip`),
    logActivity: (input) => call('POST', '/activities', input),
    activities: () => call('GET', '/activities'),
    submitFeedback: (input) => call('POST', '/feedback', input),
    feedbackFor: (id) => call('GET', `/sessions/${encodeURIComponent(id)}/feedback`),
    markAdjustmentSeen: (id) => call('POST', `/adjustments/${encodeURIComponent(id)}/seen`),
    adjustments: () => call('GET', '/adjustments'),

    entitlements: () => call('GET', '/entitlements'),
    // Store purchases go through the RevenueCat SDK in a development build
    // (native module; not in Expo Go or on web). Until it is added, say so.
    purchase: () => Promise.reject(new ApiError('invalid', 'Les achats ne sont pas encore disponibles dans cette version de l’app.')),
    restorePurchases: () => call('POST', '/entitlements/refresh'),

    settings: () => call('GET', '/settings'),
    updateSettings: (patch) => call('PATCH', '/settings', patch),
    connections: () => call('GET', '/connections'),
    async connect(provider): Promise<Connection> {
      const { url } = await call<{ url: string }>('POST', `/connect/${provider}/start`);
      const r = await WebBrowser.openAuthSessionAsync(url, 'stride://connections');
      const list = await call<Connection[]>('GET', '/connections');
      const c = list.find((x) => x.provider === provider);
      if (!c) {
        const result = r.type === 'success' ? new URL(r.url).searchParams.get('result') : 'cancel';
        throw new ApiError(
          'invalid',
          result === 'in_use' ? 'Ce compte est déjà relié à un autre profil.' : result === 'scope' ? 'Autorise l’accès à tes activités pour les importer.' : 'Connexion annulée.',
        );
      }
      return c;
    },
    disconnect: (provider) => call('DELETE', `/connect/${provider}`),
    async deleteAccount() {
      await call('DELETE', '/me', { confirm: true });
      await sb.auth.signOut({ scope: 'local' });
    },
  };
}
