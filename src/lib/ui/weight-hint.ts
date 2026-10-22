import type { WeightTrend } from "@/lib/log/body";

/** "2026-03-05" → "Mar 5". The string is already a local date, so format it as UTC. */
function shortDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(
    new Date(`${dateStr}T00:00:00Z`),
  );
}

/** The hint under Today's weight chip: weigh-in date, plus the 7-day trend when both weeks exist. */
export function weightHint(w: WeightTrend): string {
  if (!w.latest) return "Log Weight";
  const date = shortDate(w.latest.date);
  if (w.avg7 === null || w.avg7Prev === null) return date;
  const d = Math.round((w.avg7 - w.avg7Prev) * 10) / 10;
  const sign = d > 0 ? "+" : d < 0 ? "-" : "±";
  return `${date} · avg ${w.avg7.toFixed(1)} (${sign}${Math.abs(d).toFixed(1)})`;
}
