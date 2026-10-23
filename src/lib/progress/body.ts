/**
 * Body progress loader: weigh-ins, 7-day averages, trend rate, gain-goal progress and scans for
 * the Progress tab. Missing data yields empty series and nulls, never an error.
 */
import { and, asc, desc, gt, gte, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { bodyScans, weightEntries } from "@/db/schema";
import { weeklyGainPct } from "@/lib/engine/energy";
import { seasonCalendar } from "@/lib/engine/season";
import { addDays, localDate, weekStart } from "@/lib/log/dates";
import { getNutritionSettings } from "@/lib/nutrition/settings";
import { getPlanSettings } from "@/lib/plan/settings";
import { RANGE_DAYS, rollingAvg, scanDelta, trendRateLbPerWeek, type Point, type Range, type ScanDelta, type ScanLite } from "./series";

export type { Range } from "./series";
export { RANGE_DAYS } from "./series";

const ROLLING_LOOKBACK_DAYS = 6;
const PERCENT = 100;

export type BodyProgress = {
  weights: Point[];
  avg7: Point[];
  rateLbPerWeek: number | null;
  targetRateLbPerWeek: number | null;
  /** countsFrom: the season start; with no set start weight, the first weigh-in from then on is the start. */
  gain: { startLb: number | null; currentLb: number | null; gainedLb: number | null; goalLb: number; countsFrom: string };
  scans: ScanLite[];
  scanDelta: ScanDelta | null;
};

export async function getBodyProgress(db: Db, now: Date, tz: string, range: Range): Promise<BodyProgress> {
  const today = localDate(now, tz);
  const from = addDays(today, -(RANGE_DAYS[range] - 1));

  // Fetch a week of lead-in so the first shown averages see their full window.
  const rows = await db
    .select({ date: weightEntries.localDate, value: weightEntries.weightLb })
    .from(weightEntries)
    .where(and(gte(weightEntries.localDate, addDays(from, -ROLLING_LOOKBACK_DAYS)), lte(weightEntries.localDate, today), gt(weightEntries.weightLb, 0)))
    .orderBy(asc(weightEntries.localDate));
  const all: Point[] = rows.map((r) => ({ date: r.date, value: r.value }));
  const weights = all.filter((p) => p.date >= from);
  const avg7 = rollingAvg(all).filter((p) => p.date >= from);

  // Gain numbers do not depend on the chart range: the latest 7-day average overall.
  const [latest] = await db
    .select({ date: weightEntries.localDate })
    .from(weightEntries)
    .where(and(lte(weightEntries.localDate, today), gt(weightEntries.weightLb, 0)))
    .orderBy(desc(weightEntries.localDate))
    .limit(1);
  let latestAvg: number | null = null;
  if (latest) {
    const recent = await db
      .select({ date: weightEntries.localDate, value: weightEntries.weightLb })
      .from(weightEntries)
      .where(and(gte(weightEntries.localDate, addDays(latest.date, -ROLLING_LOOKBACK_DAYS)), lte(weightEntries.localDate, latest.date), gt(weightEntries.weightLb, 0)))
      .orderBy(asc(weightEntries.localDate));
    const avg = rollingAvg(recent.map((r) => ({ date: r.date, value: r.value })));
    latestAvg = avg[avg.length - 1].value;
  }

  const ns = await getNutritionSettings(db);
  const ps = await getPlanSettings(db, now, tz);

  let startLb = ns.gainStartWeightLb;
  if (!(typeof startLb === "number" && startLb > 0)) {
    const [first] = await db
      .select({ lb: weightEntries.weightLb })
      .from(weightEntries)
      .where(and(gte(weightEntries.localDate, ps.seasonStart), gt(weightEntries.weightLb, 0)))
      .orderBy(asc(weightEntries.localDate))
      .limit(1);
    startLb = first?.lb ?? null;
  }
  const gainedLb = startLb !== null && latestAvg !== null ? Math.round((latestAvg - startLb) * 10) / 10 : null;

  // Target rate: the same phase and goal rules as the day's calorie target.
  let targetRateLbPerWeek: number | null = null;
  if (latestAvg !== null) {
    let week = null;
    try {
      const ws = weekStart(today);
      week = seasonCalendar(ps).weeks.find((w) => w.weekStart === ws) ?? null;
    } catch {
      week = null;
    }
    const remainingGoalLb = startLb !== null ? ns.gainGoalLb - (latestAvg - startLb) : ns.gainGoalLb;
    const pct = week ? weeklyGainPct({ gainPhase: week.gainPhase, phase: week.phase, remainingGoalLb }) : 0;
    targetRateLbPerWeek = (pct * latestAvg) / PERCENT;
  }

  const scanRows = await db.select().from(bodyScans).orderBy(asc(bodyScans.scannedOn), asc(bodyScans.id));
  const scans: ScanLite[] = scanRows.map((s) => ({ scannedOn: s.scannedOn, weightLb: s.weightLb, leanMassLb: s.leanMassLb, fatMassLb: s.fatMassLb }));

  return {
    weights,
    avg7,
    rateLbPerWeek: trendRateLbPerWeek(weights, today),
    targetRateLbPerWeek,
    gain: { startLb, currentLb: latestAvg, gainedLb, goalLb: ns.gainGoalLb, countsFrom: ps.seasonStart },
    scans,
    scanDelta: scanDelta(scans, ps.seasonStart),
  };
}
