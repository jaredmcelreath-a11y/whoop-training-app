/**
 * Projected half Ironman finish (rule race.projection): each leg from the owner's recent logged
 * training, turned into race pace with the rule's factors; a leg with too few sessions uses the
 * starting pace or a first-timer default and is an estimate. Pure: every number is a rule param,
 * except the published Daniels-Gilbert equations below.
 */
import { RULES } from "@/lib/engine/rules/catalog";

export type Session = { distanceM: number; durationS: number };
export type ProjectionInputs = {
  swims: Session[];
  rides: Session[];
  runs: Session[];
  vo2max: number | null;
  start: { swimSecPer100Yd: number | null; runSecPerMi: number | null; bikeMph: number | null };
};
export type LegResult = { seconds: number; estimate: boolean };
export type Projection = { swim: LegResult; bike: LegResult; run: LegResult; transitionS: number; totalS: number; estimate: boolean };

const M_PER_YD = 0.9144;
const M_PER_MI = 1609.344;
const S_PER_MIN = 60;
const S_PER_H = 3600;
const PER_100 = 100;

/** Median of the faster half (lowest values) of a list, so one slow drill session doesn't drag it down. */
function fasterHalfMedian(values: readonly number[]): number {
  const half = [...values].sort((a, b) => a - b).slice(0, Math.ceil(values.length / 2));
  const mid = Math.floor(half.length / 2);
  return half.length % 2 ? half[mid] : (half[mid - 1] + half[mid]) / 2;
}

// Daniels & Gilbert (1979), as published in Daniels' Running Formula: the oxygen cost of running
// at v m/min, and the fraction of VO2 max sustainable for t minutes. A fixed model, not tunables.
const HALF_MARATHON_M = 21097.5;
const vo2Cost = (v: number) => -4.6 + 0.182258 * v + 0.000104 * v * v;
const sustainable = (t: number) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
const SEARCH_MIN = 60;
const SEARCH_MAX = 300;
const TOLERANCE_MIN = 0.1 / S_PER_MIN;

/** The half-marathon time (seconds) the Daniels-Gilbert equations give for this VO2 max. */
export function vdotHalfMarathonS(vo2max: number): number {
  // VDOT(t) falls as t grows; find the time whose VDOT equals vo2max.
  const vdotAt = (t: number) => vo2Cost(HALF_MARATHON_M / t) / sustainable(t);
  let lo = SEARCH_MIN;
  let hi = SEARCH_MAX;
  while (hi - lo > TOLERANCE_MIN) {
    const mid = (lo + hi) / 2;
    if (vdotAt(mid) > vo2max) lo = mid;
    else hi = mid;
  }
  return ((lo + hi) / 2) * S_PER_MIN;
}

const within = (x: number, [lo, hi]: readonly [number, number]) => x >= lo && x <= hi;

export function project(raw: ProjectionInputs): Projection {
  const P = RULES["race.projection"].params;
  const enough = (n: number) => n >= P.minSessions;
  // A mistyped session (5 min for 50, 400 km in an hour) is left out rather than trusted.
  const inputs: ProjectionInputs = {
    ...raw,
    swims: raw.swims.filter((s) => within(s.durationS / (s.distanceM / M_PER_YD / PER_100), P.plausibleSwimSecPer100Yd)),
    runs: raw.runs.filter((r) => within(r.durationS / (r.distanceM / M_PER_MI), P.plausibleRunSecPerMi)),
    rides: raw.rides.filter((r) => within(r.distanceM / M_PER_MI / (r.durationS / S_PER_H), P.plausibleBikeMph)),
  };

  // Swim: seconds per 100 yd, then the race distance in open water.
  const swimFromTraining = enough(inputs.swims.length);
  const swimPace = swimFromTraining
    ? fasterHalfMedian(inputs.swims.map((s) => s.durationS / (s.distanceM / M_PER_YD / PER_100)))
    : (inputs.start.swimSecPer100Yd ?? P.defaultSwimSecPer100Yd);
  const swim = { seconds: Math.round(swimPace * (P.swimYd / PER_100) * P.openWaterFactor), estimate: !swimFromTraining };

  // Bike: training speed lifted to race effort; a fallback speed is already a race speed.
  const bikeFromTraining = enough(inputs.rides.length);
  const mph = bikeFromTraining
    ? -fasterHalfMedian(inputs.rides.map((r) => -(r.distanceM / M_PER_MI) / (r.durationS / S_PER_H))) * P.bikeRaceFactor
    : (inputs.start.bikeMph ?? P.defaultBikeMph);
  const bike = { seconds: Math.round((P.bikeMi / mph) * S_PER_H), estimate: !bikeFromTraining };

  // Run: easy training scaled to the half marathon, blended with VO2 max, then off the bike.
  const runFromTraining = enough(inputs.runs.length);
  const base = runFromTraining
    ? fasterHalfMedian(inputs.runs.map((r) => r.durationS * (P.runMi / (r.distanceM / M_PER_MI)) ** P.riegelExponent)) *
      P.easyToRaceFactor
    : (inputs.start.runSecPerMi ?? P.defaultRunSecPerMi) * P.runMi * P.easyToRaceFactor;
  const blended = inputs.vo2max === null ? base : (1 - P.vo2Weight) * base + P.vo2Weight * vdotHalfMarathonS(inputs.vo2max);
  const run = { seconds: Math.round(blended * P.offBikeFactor), estimate: !runFromTraining };

  const transitionS = P.transitionMin * S_PER_MIN;
  return {
    swim,
    bike,
    run,
    transitionS,
    totalS: swim.seconds + bike.seconds + run.seconds + transitionS,
    estimate: swim.estimate || bike.estimate || run.estimate,
  };
}
