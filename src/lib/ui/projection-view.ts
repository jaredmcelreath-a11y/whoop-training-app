/** Text for the projected-finish card on Today. Pure. */
import { RULES } from "@/lib/engine/rules/catalog";

const S_PER_MIN = 60;
const S_PER_H = 3600;
const MIN_PER_H = 60;
const pad = (n: number) => String(n).padStart(2, "0");

/** 24150 → "6:42:30". */
export function hms(s: number): string {
  const t = Math.round(s);
  return `${Math.floor(t / S_PER_H)}:${pad(Math.floor((t % S_PER_H) / S_PER_MIN))}:${pad(t % S_PER_MIN)}`;
}

/** m:ss under an hour, h:mm:ss from an hour. */
const span = (s: number) => (s < S_PER_H ? `${Math.floor(s / S_PER_MIN)}:${pad(s % S_PER_MIN)}` : hms(s));

/** "▼ 1:12 from last week" (faster), "▲ 0:45 from last week" (slower), or the first/same line. */
export function changeLine(current: number, previous: number | null): string {
  if (previous === null) return "First Projection";
  const d = Math.round(current - previous);
  if (d === 0) return "Same as last week";
  return `${d < 0 ? "▼" : "▲"} ${span(Math.abs(d))} from last week`;
}

/** "Goal: Under 6:00", from the setting or the race.projection default. */
export function goalLine(goalSec: number | null): string {
  const g = goalSec ?? RULES["race.projection"].params.defaultGoalSec;
  return `Goal: Under ${Math.floor(g / S_PER_H)}:${pad(Math.floor((g % S_PER_H) / S_PER_MIN))}`;
}

/** A leg's time with units, rounded to the minute: 2617 → "44m", 12600 → "3h 30m". */
export function legTime(s: number): string {
  const totalMin = Math.round(s / S_PER_MIN);
  const h = Math.floor(totalMin / MIN_PER_H);
  const m = totalMin % MIN_PER_H;
  return h ? `${h}h ${m}m` : `${m}m`;
}

type Week = { weekStart: string; totalS: number; initialTotalS: number | null };

const shortDay = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(new Date(`${iso}T00:00:00Z`));

/**
 * The progress chart's points, oldest first: "Start" (the very first projection, when the
 * first week was later recomputed, e.g. after entering starting paces), then each week.
 */
export function progressPoints(weeks: readonly Week[]): { label: string; totalS: number }[] {
  if (!weeks.length) return [];
  const first = weeks[0];
  const start = first.initialTotalS !== null && first.initialTotalS !== first.totalS ? [{ label: "Start", totalS: first.initialTotalS }] : [];
  return [...start, ...weeks.map((w) => ({ label: shortDay(w.weekStart), totalS: w.totalS }))];
}
