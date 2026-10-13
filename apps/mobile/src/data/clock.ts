import { Platform } from 'react-native';
import type { ISODate } from '@stride/engine';

const web = Platform.OS === 'web' && typeof window !== 'undefined';

/** URL query parameters on web (?today=2026-10-21&seed=demo&fail=week). Empty on native. */
export function devParams(): URLSearchParams {
  return web ? new URLSearchParams(window.location.search) : new URLSearchParams();
}

/** The runner's local calendar day. On web, ?today= overrides it for the rest
 *  of the browser session (survives navigation), for screenshots and tests. */
export function today(): ISODate {
  const forced = devParams().get('today');
  if (forced && /^\d{4}-\d{2}-\d{2}$/.test(forced)) {
    try {
      window.sessionStorage.setItem('stride.today', forced);
    } catch {}
    return forced;
  }
  if (web) {
    try {
      const kept = window.sessionStorage.getItem('stride.today');
      if (kept) return kept;
    } catch {}
  }
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Capture ?today= before the router rewrites the URL on the first redirect.
if (web) today();
