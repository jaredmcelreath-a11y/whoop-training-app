import { weekFromDate, zonedLocalToUtc } from "@/lib/log/dates";

/**
 * The Today page's `?date=`: no value (or today) is today; a real earlier date is a past day.
 * A future or malformed date returns null, and the page sends it back to today.
 */
export function parseTodayDate(
  raw: string | string[] | undefined,
  today: string,
): { date: string; past: boolean } | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v === undefined) return { date: today, past: false };
  // weekFromDate doubles as the real-date check.
  if (weekFromDate(v) === null || v > today) return null;
  return { date: v, past: v < today };
}

/**
 * Local noon on `date`. A past day is read "as of" noon: by then that night's sleep has ended
 * and its WHOOP cycle has started, while the next night's cycle (which can start before
 * midnight) has not.
 */
export function noonOf(date: string, tz: string): Date {
  return new Date(zonedLocalToUtc(`${date}T12:00`, tz));
}
