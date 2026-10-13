// Calendar days as ISO strings ("2026-10-19"). Runner days are local days, so no
// times and no time zones here: the caller decides what "today" is for the runner.

export type ISODate = string;

const DAY = 86_400_000;

export function toDate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: ISODate, n: number): ISODate {
  return toISO(new Date(toDate(iso).getTime() + n * DAY));
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY);
}

/** Monday of the week containing `iso`. Weeks start on Monday. */
export function mondayOf(iso: ISODate): ISODate {
  const dow = (toDate(iso).getUTCDay() + 6) % 7; // 0 = Monday
  return addDays(iso, -dow);
}

/** 0 = Monday ... 6 = Sunday */
export function weekday(iso: ISODate): number {
  return (toDate(iso).getUTCDay() + 6) % 7;
}
