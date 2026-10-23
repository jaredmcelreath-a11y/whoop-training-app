/**
 * Today's strain target (rule strain.dailyTarget): the middle of your own WHOOP day strain on
 * past days with the same kind of planned training, or a starting range until there are enough.
 * Pure: every number is a rule param.
 */
import { RULES } from "@/lib/engine/rules/catalog";

export type DayType = "rest" | "easy" | "long" | "hard" | "strength";

export type StrainTarget = { low: number; high: number; estimate: boolean; type: DayType; days: number };

type SessionLike = { kind: string; intensity: string; durationMin: number; details: Record<string, unknown> };

const ENDURANCE = new Set(["swim", "bike", "run"]);
const HARD = new Set(["tempo", "threshold", "intervals"]);
const PERCENT = 100;

/** The kind of day, checked in order: hard work, then a long session, then any endurance, then lifting. */
export function dayType(sessions: readonly SessionLike[]): DayType {
  const work = sessions.filter((s) => s.kind !== "rest");
  if (!work.length) return "rest";
  const endurance = work.filter((s) => ENDURANCE.has(s.kind));
  if (endurance.some((s) => HARD.has(s.intensity))) return "hard";
  if (endurance.some((s) => s.details.long === true)) return "long";
  if (endurance.length) return "easy";
  return "strength";
}

/** Linear-interpolated percentile of sorted values. */
function percentile(sorted: readonly number[], p: number): number {
  const at = (p / PERCENT) * (sorted.length - 1);
  const lo = Math.floor(at);
  const hi = Math.ceil(at);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo);
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function strainTarget(type: DayType, history: readonly { type: DayType; strain: number }[]): StrainTarget {
  const P = RULES["strain.dailyTarget"].params;
  const strains = history.filter((h) => h.type === type).map((h) => h.strain).sort((a, b) => a - b);
  if (strains.length < P.minDays) {
    const [low, high] = P.fallback[type];
    return { low, high, estimate: true, type, days: strains.length };
  }
  return {
    low: round1(percentile(strains, P.lowPercentile)),
    high: round1(percentile(strains, P.highPercentile)),
    estimate: false,
    type,
    days: strains.length,
  };
}
