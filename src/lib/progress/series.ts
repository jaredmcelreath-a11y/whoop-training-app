/**
 * Pure body-progress series helpers: rolling averages, gap splitting, trend rate and scan deltas.
 * No database or framework imports; every date is a YYYY-MM-DD string.
 */
import { addDays, weekStart } from "@/lib/log/dates";

export type Point = { date: string; value: number };
export type Range = "2w" | "4w" | "2m";

/** Days shown per range, inclusive of today. */
export const RANGE_DAYS: Record<Range, number> = { "2w": 14, "4w": 28, "2m": 61 };

/** A gap longer than this many days breaks a chart line. */
export const MAX_GAP_DAYS = 7;
/** Fewest weigh-ins in the trend window for a rate to be shown. */
export const MIN_TREND_POINTS = 8;

const ROLLING_DAYS = 7;
const TREND_WINDOW_DAYS = 28;
const DAYS_PER_WEEK = 7;
const PERCENT = 100;
const MS_PER_DAY = 86_400_000;

const round1 = (x: number) => Math.round(x * 10) / 10;
export const dayNumber = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / MS_PER_DAY);

/** One point per input date: the mean of input points in [date - (windowDays - 1), date], to 0.1. */
export function rollingAvg(points: Point[], windowDays = ROLLING_DAYS): Point[] {
  return points.map((p) => {
    const from = addDays(p.date, -(windowDays - 1));
    const inWindow = points.filter((q) => q.date >= from && q.date <= p.date);
    return { date: p.date, value: round1(inWindow.reduce((a, q) => a + q.value, 0) / inWindow.length) };
  });
}

/** Splits date-ordered points into runs wherever consecutive points are more than maxGapDays apart. */
export function splitAtGaps(points: Point[], maxGapDays = MAX_GAP_DAYS): Point[][] {
  const out: Point[][] = [];
  for (const p of points) {
    const seg = out[out.length - 1];
    if (seg && dayNumber(p.date) - dayNumber(seg[seg.length - 1].date) <= maxGapDays) seg.push(p);
    else out.push([p]);
  }
  return out;
}

/** Least-squares slope (lb per week) over [asOf - 27, asOf]; null with fewer than MIN_TREND_POINTS points. */
export function trendRateLbPerWeek(points: Point[], asOf: string): number | null {
  const from = addDays(asOf, -(TREND_WINDOW_DAYS - 1));
  const xs = points.filter((p) => p.date >= from && p.date <= asOf);
  if (xs.length < MIN_TREND_POINTS) return null;
  const x0 = dayNumber(from);
  const n = xs.length;
  const mx = xs.reduce((a, p) => a + (dayNumber(p.date) - x0), 0) / n;
  const my = xs.reduce((a, p) => a + p.value, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of xs) {
    const dx = dayNumber(p.date) - x0 - mx;
    sxy += dx * (p.value - my);
    sxx += dx * dx;
  }
  return sxx === 0 ? null : (sxy / sxx) * DAYS_PER_WEEK;
}

export type ScanLite = { scannedOn: string; weightLb: number | null; leanMassLb: number | null; fatMassLb: number | null };
export type ScanDelta = {
  from: ScanLite;
  to: ScanLite;
  weightLb: number | null;
  leanLb: number | null;
  fatLb: number | null;
  leanSharePct: number | null;
};

const diff = (a: number | null, b: number | null) => (a === null || b === null ? null : b - a);

/**
 * Change from the baseline scan to the latest scan. The baseline is the latest scan on or before
 * fromDate (the season start, so a scan taken just before it counts), else the earliest scan.
 * A null fromDate uses the earliest scan. Null with fewer than two scans or when the baseline is
 * the latest scan. leanSharePct is lean / (lean + fat) x 100, only when both changes are known,
 * neither is negative and their sum is positive (a pure gain split).
 */
export function scanDelta(scans: ScanLite[], fromDate: string | null): ScanDelta | null {
  const sorted = [...scans].sort((a, b) => a.scannedOn.localeCompare(b.scannedOn));
  if (sorted.length < 2) return null;
  const before = fromDate === null ? [] : sorted.filter((s) => s.scannedOn <= fromDate);
  const from = before.length ? before[before.length - 1] : sorted[0];
  const to = sorted[sorted.length - 1];
  if (from === to) return null;
  const leanLb = diff(from.leanMassLb, to.leanMassLb);
  const fatLb = diff(from.fatMassLb, to.fatMassLb);
  const total = leanLb !== null && fatLb !== null ? leanLb + fatLb : null;
  return {
    from,
    to,
    weightLb: diff(from.weightLb, to.weightLb),
    leanLb,
    fatLb,
    leanSharePct: leanLb !== null && fatLb !== null && leanLb >= 0 && fatLb >= 0 && total !== null && total > 0 ? (leanLb / total) * PERCENT : null,
  };
}

export type AdherenceRow = { localDate: string; kind: string; status: "planned" | "done" | "skipped" };
export type AdherenceWeek = { weekStart: string; planned: number; done: number; skipped: number; missed: number; pct: number | null };

/**
 * Per-week plan adherence. Rest rows are ignored; only rows dated before today count as planned.
 * missed = past rows still "planned". pct = done / planned, rounded; null when nothing was planned.
 */
export function weeklyAdherence(rows: AdherenceRow[], today: string): AdherenceWeek[] {
  const weeks = new Map<string, AdherenceWeek>();
  for (const r of rows) {
    if (r.kind === "rest" || r.localDate >= today) continue;
    const ws = weekStart(r.localDate);
    const w = weeks.get(ws) ?? { weekStart: ws, planned: 0, done: 0, skipped: 0, missed: 0, pct: null };
    w.planned += 1;
    if (r.status === "done") w.done += 1;
    else if (r.status === "skipped") w.skipped += 1;
    else w.missed += 1;
    weeks.set(ws, w);
  }
  // Weeks that only hold future rows still appear, with nothing planned yet.
  for (const r of rows) {
    if (r.kind === "rest" || r.localDate < today) continue;
    const ws = weekStart(r.localDate);
    if (!weeks.has(ws)) weeks.set(ws, { weekStart: ws, planned: 0, done: 0, skipped: 0, missed: 0, pct: null });
  }
  return [...weeks.values()]
    .map((w) => ({ ...w, pct: w.planned === 0 ? null : Math.round((w.done / w.planned) * PERCENT) }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export type LiftSet = { localDate: string; exerciseId: string; exerciseName: string; reps: number; weightLb: number | null };
export type LiftWeek = { weekStart: string; topWeightLb: number | null; topReps: number; sets: number };
export type LiftSeries = { exerciseId: string; name: string; weekly: LiftWeek[] };

/** Per-exercise weekly top set (heaviest weight, most reps at it), most recently trained exercise first. */
export function liftSeries(sets: LiftSet[]): LiftSeries[] {
  const byEx = new Map<string, { name: string; last: string; weeks: Map<string, LiftSet[]> }>();
  for (const s of sets) {
    const ex = byEx.get(s.exerciseId) ?? { name: s.exerciseName, last: s.localDate, weeks: new Map<string, LiftSet[]>() };
    if (s.localDate > ex.last) ex.last = s.localDate;
    const ws = weekStart(s.localDate);
    ex.weeks.set(ws, [...(ex.weeks.get(ws) ?? []), s]);
    byEx.set(s.exerciseId, ex);
  }
  return [...byEx.entries()]
    .sort((a, b) => b[1].last.localeCompare(a[1].last))
    .map(([exerciseId, ex]) => ({
      exerciseId,
      name: ex.name,
      weekly: [...ex.weeks.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([ws, list]) => {
          const weights = list.map((s) => s.weightLb).filter((w): w is number => w !== null);
          const top = weights.length ? Math.max(...weights) : null;
          const pool = top === null ? list : list.filter((s) => s.weightLb === top);
          return { weekStart: ws, topWeightLb: top, topReps: Math.max(...pool.map((s) => s.reps)), sets: list.length };
        }),
    }));
}
