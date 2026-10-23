/** Pure display helpers for the Progress tab. No database or framework imports. */
import { RANGE_DAYS, type Range, type ScanDelta } from "./series";

const SECONDS_PER_MINUTE = 60;
const PAD_SECONDS = 2;

export const RANGES = Object.keys(RANGE_DAYS) as Range[];
export const RANGE_LABEL: Record<Range, string> = { "2w": "2 Weeks", "4w": "4 Weeks", "2m": "2 Months" };

/** The `?range=` value when it is a known range, else "4w". */
export function parseRange(raw: string | string[] | undefined): Range {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v !== undefined && (RANGES as string[]).includes(v) ? (v as Range) : "4w";
}

/** "2026-10-03" -> "Oct 3" (read as UTC so the day never shifts). */
export function shortDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

/** Seconds per distance as "m:ss /<per>", e.g. 95 -> "1:35 /100 yd". */
export function paceLabel(sec: number, per: "100 yd" | "mi"): string {
  const total = Math.round(sec);
  const m = Math.floor(total / SECONDS_PER_MINUTE);
  const s = total % SECONDS_PER_MINUTE;
  return `${m}:${String(s).padStart(PAD_SECONDS, "0")} /${per}`;
}

/** Signed to one decimal: 3 -> "+3.0", -1 -> "-1.0". */
export const signed1 = (x: number) => `${x >= 0 ? "+" : "-"}${Math.abs(x).toFixed(1)}`;

/**
 * Gain-goal progress, e.g. "+4.2 of 15 lb". With no start weight the goal counts from the first
 * weigh-in on or after `countsFrom` (the season start); weigh-ins before it don't count.
 */
export function gainLine(g: { startLb: number | null; currentLb: number | null; gainedLb: number | null; goalLb: number; countsFrom: string }): string {
  if (g.currentLb === null) return "Log your weight to start tracking";
  if (g.startLb === null || g.gainedLb === null) {
    return `Starts with your first weigh-in from ${shortDate(g.countsFrom)}, or set a gain start weight in Settings`;
  }
  return `${signed1(g.gainedLb)} of ${g.goalLb} lb`;
}

const SCAN_CAVEAT = "Single scans vary; the trend across several scans matters more.";

/** Lean vs fat change since the baseline scan. */
export function scanSplitText(d: ScanDelta | null, scanCount: number): string {
  if (d === null && scanCount >= 2) return "Your scans are all from before the season started. Rescan to see lean vs fat.";
  if (d === null) return "One scan so far. Rescan to see lean vs fat.";
  const parts: string[] = [];
  if (d.leanLb !== null) parts.push(`lean ${signed1(d.leanLb)} lb`);
  if (d.fatLb !== null) parts.push(`fat ${signed1(d.fatLb)} lb`);
  if (parts.length === 0 && d.weightLb !== null) parts.push(`weight ${signed1(d.weightLb)} lb`);
  if (parts.length === 0) return `Since ${shortDate(d.from.scannedOn)}: no lean or fat numbers to compare. ${SCAN_CAVEAT}`;
  const share = d.leanSharePct === null ? "" : ` (${Math.round(d.leanSharePct)}% lean)`;
  return `Since ${shortDate(d.from.scannedOn)}: ${parts.join(", ")}${share}. ${SCAN_CAVEAT}`;
}
