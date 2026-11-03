/**
 * Swim sets (week.swimSets): what to do inside a planned swim. A warm-up, an optional technique
 * drill (easy swims), a main set of down-and-backs with short rests that fills the session, and
 * a cool-down. Reps grow on a fixed schedule; once one rep would fill the main set it becomes a
 * nonstop swim. Pure: every threshold is a rule param.
 */
import { RULES } from "@/lib/engine/rules/catalog";

// Unit constants, not tunable thresholds.
const M_PER_YD = 0.9144;
const PER_100 = 100;
const S_PER_MIN = 60;
const PERCENT = 100;
/** A down-and-back is two pool lengths. */
const LENGTHS_PER_DOWN_BACK = 2;
/** Shown distances round to this many yards or meters. */
const ROUND_TO = 5;

export type SwimDrill = { name: string; cue: string; min: number };
export type SwimRep = { downBacks: number; distance: number; unit: "yd" | "m"; restSeconds: number; repMin: number };
export type SwimSets = { warmUpMin: number; drill: SwimDrill | null; rep: SwimRep; mainMin: number; nonstop: boolean; coolDownMin: number };

export type SwimSetsInput = {
  durationMin: number;
  long: boolean;
  /** Season week index (0 = first week). */
  weekIndex: number;
  recovery: boolean;
  /** Which drill in the rotation (wraps). */
  drillIndex: number;
  poolLengthM: number;
  poolUnit: "yd" | "m" | "ft";
  /** Pace used to tell when one rep would fill the main set. */
  secPer100Yd: number;
};

/** Lays the parts out in `durationMin`; the drill goes first when the main set has no room. */
function layout(durationMin: number, drill: SwimDrill | null, rep: SwimRep): SwimSets | null {
  const P = RULES["week.swimSets"].params;
  const open = durationMin - P.warmUpMin - P.coolDownMin;
  if (open < P.minMainSetMin) return null;
  const keep = drill && open - drill.min >= P.minMainSetMin ? drill : null;
  const mainMin = open - (keep?.min ?? 0);
  return { warmUpMin: P.warmUpMin, drill: keep, rep, mainMin, nonstop: rep.repMin >= mainMin, coolDownMin: P.coolDownMin };
}

export function planSwimSets(input: SwimSetsInput): SwimSets | null {
  const P = RULES["week.swimSets"].params;
  // A recovery week holds the step of the week before it.
  const week = input.recovery ? Math.max(0, input.weekIndex - 1) : input.weekIndex;
  const step = Math.floor(week / P.everyWeeks);
  const repYd = (input.long ? P.longStartRepYd : P.easyStartRepYd) * (1 + P.repGrowthPct / PERCENT) ** step;
  const downBackM = input.poolLengthM * LENGTHS_PER_DOWN_BACK;
  const downBacks = Math.max(1, Math.round((repYd * M_PER_YD) / downBackM));
  const unit = input.poolUnit === "m" ? "m" : "yd";
  const repM = downBacks * downBackM;
  const distance = Math.round((unit === "m" ? repM : repM / M_PER_YD) / ROUND_TO) * ROUND_TO;
  const rep: SwimRep = {
    downBacks,
    distance,
    unit,
    restSeconds: Math.max(P.minRestSeconds, P.startRestSeconds - step * P.restStepSeconds),
    repMin: ((repM / M_PER_YD / PER_100) * input.secPer100Yd) / S_PER_MIN,
  };
  const d = P.drills[input.drillIndex % P.drills.length];
  const drill = input.long ? null : { name: d.name, cue: d.cue, min: P.drillMin };
  return layout(input.durationMin, drill, rep);
}

/** The same reps refit to a new (shorter) duration; null when no main set fits. */
export function fitSwimSets(sets: SwimSets, durationMin: number): SwimSets | null {
  return layout(durationMin, sets.drill, sets.rep);
}
