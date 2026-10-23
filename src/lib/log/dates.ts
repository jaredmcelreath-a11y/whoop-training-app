/** YYYY-MM-DD of `at` in the given IANA timezone. */
export function localDate(at: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Monday (YYYY-MM-DD) of the ISO week containing the given date string. */
export function weekStart(localDateStr: string): string {
  const [y, m, d] = localDateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const daysSinceMonday = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - daysSinceMonday);
  return dt.toISOString().slice(0, 10);
}

/** Monday of a picked YYYY-MM-DD date (from a date input), or null when it isn't a real date. */
export function weekFromDate(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== date) return null;
  return weekStart(date);
}

/** Wall-clock fields of `at` in `tz`, with hours 0-23. */
function wallParts(at: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === t)?.value);
  return {
    y: get("year"),
    mo: get("month"),
    d: get("day"),
    h: get("hour"),
    mi: get("minute"),
    s: get("second"),
  };
}

/** How far `tz`'s wall clock is ahead of UTC at instant `ms` (negative west of UTC). */
function offsetMs(ms: number, tz: string): number {
  const p = wallParts(new Date(ms), tz);
  const wall = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s);
  return wall - Math.floor(ms / 1000) * 1000;
}

/**
 * A `<input type="datetime-local">` value ("YYYY-MM-DDTHH:mm", no zone) read as wall time
 * in `tz`, returned as a UTC ISO string. DST-safe: the offset is looked up at the result.
 */
export function zonedLocalToUtc(local: string, tz: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new RangeError(`not a datetime-local value: ${local}`);
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(guess);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || h > 23 || mi > 59) {
    throw new RangeError(`not a real date and time: ${local}`);
  }
  const first = guess - offsetMs(guess, tz);
  return new Date(guess - offsetMs(first, tz)).toISOString();
}

/** `at` as a datetime-local value ("YYYY-MM-DDTHH:mm") in `tz`. */
export function toZonedLocal(at: Date, tz: string): string {
  const p = wallParts(at, tz);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${p.y}-${two(p.mo)}-${two(p.d)}T${two(p.h)}:${two(p.mi)}`;
}

/** YYYY-MM-DD shifted by `days` calendar days. */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Local noon on `date`. A past day is read "as of" noon: by then that night's sleep has ended
 * and its WHOOP cycle has started, while the next night's cycle (which can start before
 * midnight) has not.
 */
export function noonOf(date: string, tz: string): Date {
  return new Date(zonedLocalToUtc(`${date}T12:00`, tz));
}
