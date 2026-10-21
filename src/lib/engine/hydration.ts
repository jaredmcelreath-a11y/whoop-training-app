/**
 * Hydration targets and sweat rate. Pure: every input is a parameter and every threshold is a
 * rule param. No DB, no clock.
 *
 * Ruling: `maxLph` caps only the during-session drinking target. The daily target adds the
 * measured sweat loss uncapped (floored at `minLph`), times `replacePctOfLoss` / 100.
 */
import { KG_PER_LB } from "@/lib/engine/nutrients";
import { RULES } from "@/lib/engine/rules/catalog";

export type SweatKind = "run" | "bike" | "swim";
export type SweatRates = Partial<Record<SweatKind, number>>;


export function sweatRate(t: { preLb: number; postLb: number; fluidMl: number; durationMin: number }): number {
  const p = RULES["hydration.sweatTest"].params;
  const { preLb, postLb, fluidMl, durationMin } = t;
  if (![preLb, postLb, fluidMl, durationMin].every(Number.isFinite)) {
    throw new RangeError("Sweat test values must be numbers.");
  }
  if (preLb <= 0 || postLb <= 0) throw new RangeError("Weights must be above zero.");
  if (fluidMl < 0) throw new RangeError("Fluid drunk cannot be negative.");
  if (durationMin < p.minDurationMin) {
    throw new RangeError(`A sweat test must last at least ${p.minDurationMin} minutes.`);
  }
  if (postLb > preLb + p.maxGainLb) {
    throw new RangeError(`Weight after is more than ${p.maxGainLb} lb above weight before; check the numbers.`);
  }
  const lossKg = (preLb - postLb) * KG_PER_LB;
  return (lossKg * p.litersPerKgLost + fluidMl / 1000) / (durationMin / 60);
}

/** Measured rate for the kind, else the default; floored at minLph. Not capped. */
function usedRate(kind: SweatKind, rates: SweatRates): number {
  const p = RULES["hydration.exercise"].params;
  return Math.max(rates[kind] ?? p.defaultLph, p.minLph);
}

/** Fluid to drink during a session: the rate, capped at maxLph, times hours. 0 under the minimum length. */
export function duringSessionMl(kind: SweatKind, durationMin: number, rates: SweatRates): number {
  const p = RULES["hydration.exercise"].params;
  if (durationMin < p.minSessionMin) return 0;
  return Math.min(usedRate(kind, rates), p.maxLph) * (durationMin / 60) * 1000;
}

export function dailyWaterTargetMl(i: {
  profileSex: "male" | "female" | null;
  sessions: { kind: SweatKind; durationMin: number }[];
  sweatRates: SweatRates;
}): { totalMl: number; baselineMl: number; trainingMl: number; reasons: string[] } {
  const d = RULES["hydration.daily"].params;
  const ex = RULES["hydration.exercise"].params;
  const replace = RULES["hydration.rehydrate"].params.replacePctOfLoss / 100;
  const reasons: string[] = [];

  const totalL = i.profileSex ? d.totalWaterL[i.profileSex] : Math.min(d.totalWaterL.male, d.totalWaterL.female);
  if (!i.profileSex) reasons.push("Set your reference-intake profile for a personal target");
  const baselineMl = totalL * d.beverageShare * 1000;

  let trainingMl = 0;
  for (const s of i.sessions) {
    if (s.durationMin < ex.minSessionMin) continue;
    const lossMl = usedRate(s.kind, i.sweatRates) * (s.durationMin / 60) * 1000;
    trainingMl += lossMl * replace;
    const measured = i.sweatRates[s.kind];
    const src =
      measured === undefined
        ? "default rate"
        : measured < ex.minLph
          ? "measured sweat rate (raised to the minimum)"
          : "measured sweat rate";
    reasons.push(`${s.kind} ${s.durationMin} min: ${Math.round(lossMl * replace)} mL extra (${src})`);
  }
  return { totalMl: baselineMl + trainingMl, baselineMl, trainingMl, reasons };
}
