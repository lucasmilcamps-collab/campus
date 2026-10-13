// Parsing user-typed values. Pure, unit-tested.

/** "47:30" or "1:45:20" -> seconds; null when unreadable. */
export function parseTime(s: string): number | null {
  const parts = s.trim().split(':').map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d{1,2}$/.test(p))) return null;
  const n = parts.map(Number);
  const [h, m, sec] = parts.length === 3 ? n : [0, n[0], n[1]];
  if (m > 59 || sec > 59) return null;
  const total = h * 3600 + m * 60 + sec;
  return total > 0 ? total : null;
}

/** "21/03/2027" -> "2027-03-21"; null when not a real calendar date. */
export function parseDateFR(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** "2027-03-21" -> "21/03/2027" */
export function formatDateFR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
