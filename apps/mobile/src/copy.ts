// All user-facing labels that are reused across screens. French first; other
// locales come later through the same keys. Every string here is our own.

import type { SessionType } from '@stride/engine';
import { formatDuration, formatPace, toDate } from '@stride/engine';

export const SESSION_LABEL: Record<SessionType, string> = {
  easy: 'Footing',
  long: 'Sortie longue',
  vma: 'VMA',
  threshold: 'Seuil',
  race_pace: 'Allure course',
  hills: 'Côtes',
  trail: 'Trail',
  strength: 'Renfo',
  test: 'Test',
  race: 'Course',
  rest: 'Repos',
};

export const ZONE_LABEL: Record<string, string> = {
  ef: 'Endurance',
  marathon: 'Allure marathon',
  half: 'Allure semi',
  '10k': 'Allure 10 km',
  threshold: 'Seuil',
  vma: 'VMA',
  walk: 'Marche',
};

export const RPE_LABEL = ['', 'Très facile', 'Facile', 'Moyen', 'Dur', 'Extrême'] as const;

export const STEP_LABEL = {
  warmup: 'Échauffement',
  work: 'Effort',
  recovery: 'Récup',
  cooldown: 'Retour au calme',
  repeat: 'Bloc',
} as const;

export const PHASE_LABEL = {
  base: 'Fondations',
  build: 'Développement',
  specific: 'Spécifique',
  taper: 'Affûtage',
  recovery: 'Récupération',
  race: 'Semaine de course',
} as const;

const DAYS_SHORT = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
const DAYS_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const dow = (iso: string) => (toDate(iso).getUTCDay() + 6) % 7;

export const dayShort = (iso: string) => DAYS_SHORT[dow(iso)];
export const dayNum = (iso: string) => String(toDate(iso).getUTCDate());
export const dayLong = (iso: string) => `${DAYS_LONG[dow(iso)]} ${toDate(iso).getUTCDate()} ${MONTHS[toDate(iso).getUTCMonth()]}`;
export const dateLong = (iso: string) => `${toDate(iso).getUTCDate()} ${MONTHS[toDate(iso).getUTCMonth()]} ${toDate(iso).getUTCFullYear()}`;

export const km = (m: number) => `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`;
export const pace = (s: number) => `${formatPace(s)} /km`;
export const paceSpoken = (s: number) => `${Math.floor(s / 60)} minutes ${Math.round(s % 60)} par kilomètre`;
export const duration = formatDuration;

export function raceTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.round(s % 60);
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}
