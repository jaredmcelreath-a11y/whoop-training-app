import type { PlanSettings } from "@/lib/plan/settings";
import { RULES } from "@/lib/engine/rules/catalog";

export type Phase = "base" | "build" | "peak" | "taper" | "race";

export type SeasonWeek = {
  weekStart: string;
  index: number;
  phase: Phase;
  recovery: boolean;
  gainPhase: boolean;
};

export type SeasonCalendar = { weeks: SeasonWeek[] };

/** Past weeks, oldest first, ending with the week before the target week. */
export type WeekHistory = {
  actualEnduranceMin: number[];
  actualRunMin: number[];
  strainRatio: (number | null)[];
};

export type WeeklyTargets = { enduranceMin: number; runMin: number; swimMin: number; bikeMin: number };

// Unit conversions, not tunable thresholds.
const MS_PER_DAY = 86_400_000;
const DAYS_PER_WEEK = 7;
const MIN_PER_HOUR = 60;
const PERCENT = 100;
const MONDAY = 1;
const RACE_WEEKS = 1;

function parseDate(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) throw new RangeError(`not a YYYY-MM-DD date: ${s}`);
  const [y, mo, d] = m.slice(1).map(Number);
  const ms = Date.UTC(y, mo - 1, d);
  if (new Date(ms).toISOString().slice(0, 10) !== s) throw new RangeError(`invalid date: ${s}`);
  return ms;
}

const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Monday on or before the given UTC-midnight instant. */
function mondayOnOrBefore(ms: number): number {
  const sinceMonday = (new Date(ms).getUTCDay() - MONDAY + DAYS_PER_WEEK) % DAYS_PER_WEEK;
  return ms - sinceMonday * MS_PER_DAY;
}

/**
 * Lay out the season week by week. Phases count backward from the race week (the Monday on or
 * before race day): race, taper, peak, build, then base. A short season shrinks base, then
 * build; taper and peak are never shortened.
 */
export function seasonCalendar(s: Pick<PlanSettings, "seasonStart" | "raceDate">): SeasonCalendar {
  const { taperWeeks, peakWeeks, buildWeeks } = RULES["season.phases"].params;
  const { every } = RULES["season.recoveryWeek"].params;
  const { maxWeeks } = RULES["season.gainPhase"].params;

  const start = parseDate(s.seasonStart);
  if (new Date(start).getUTCDay() !== MONDAY) throw new RangeError(`seasonStart must be a Monday: ${s.seasonStart}`);
  const raceWeek = mondayOnOrBefore(parseDate(s.raceDate));

  const total = Math.round((raceWeek - start) / (DAYS_PER_WEEK * MS_PER_DAY)) + RACE_WEEKS;
  const minWeeks = RACE_WEEKS + taperWeeks + peakWeeks;
  if (total < minWeeks) {
    throw new RangeError(
      `season too short: ${s.seasonStart} to ${s.raceDate} gives ${Math.max(total, 0)} weeks, need at least ${minWeeks} weeks`,
    );
  }

  const build = Math.min(buildWeeks, total - minWeeks);
  const raceIdx = total - RACE_WEEKS;
  const taperStart = raceIdx - taperWeeks;
  const peakStart = taperStart - peakWeeks;
  const buildStart = peakStart - build;
  const gainEnd = Math.min(maxWeeks, buildStart);

  const weeks: SeasonWeek[] = [];
  for (let i = 0; i < total; i++) {
    const phase: Phase =
      i >= raceIdx ? "race" : i >= taperStart ? "taper" : i >= peakStart ? "peak" : i >= buildStart ? "build" : "base";
    const recovery = (phase === "base" || phase === "build") && i % every === every - 1;
    weeks.push({
      weekStart: fmt(start + i * DAYS_PER_WEEK * MS_PER_DAY),
      index: i,
      phase,
      recovery,
      gainPhase: i < gainEnd,
    });
  }
  return { weeks };
}

/**
 * Planned endurance minutes before any cap: linear from startHours (week 0) to peakHours at
 * the first peak week, held through peak; taper and race weeks get the taper factor.
 */
export function rampEnduranceMin(cal: SeasonCalendar, weekIndex: number): number {
  const { startHours, peakHours } = RULES["volume.endurance"].params;
  const { taperVolumeFactor } = RULES["season.phases"].params;
  const week = weekAt(cal, weekIndex);
  const startMin = startHours * MIN_PER_HOUR;
  const peakMin = peakHours * MIN_PER_HOUR;
  if (week.phase === "taper" || week.phase === "race") return peakMin * taperVolumeFactor;
  const firstPeak = cal.weeks.findIndex((w) => w.phase === "peak");
  if (weekIndex >= firstPeak) return peakMin;
  return startMin + ((peakMin - startMin) * weekIndex) / firstPeak;
}

/**
 * How far through build a week is, for growing the long ride and long run: 0 in base, rising
 * each build week to 1 by the last build week, 1 in peak, and 0 in taper and race weeks.
 */
export function buildProgress(cal: SeasonCalendar, weekIndex: number): number {
  const week = weekAt(cal, weekIndex);
  if (week.phase === "peak") return 1;
  if (week.phase !== "build") return 0;
  const start = cal.weeks.findIndex((w) => w.phase === "build");
  const peak = cal.weeks.findIndex((w) => w.phase === "peak");
  return (weekIndex - start + 1) / (peak - start);
}

function weekAt(cal: SeasonCalendar, weekIndex: number): SeasonWeek {
  const week = cal.weeks[weekIndex];
  if (!Number.isInteger(weekIndex) || !week) throw new RangeError(`week index out of range: ${weekIndex}`);
  return week;
}

/**
 * The actual from the most recent non-recovery week, so a deliberately light week is never the
 * base for the next ramp. Falls back to the last actual if every listed week was a recovery week.
 */
function rampReference(cal: SeasonCalendar, weekIndex: number, actuals: number[]): number | undefined {
  for (let k = actuals.length - 1; k >= 0; k--) {
    const idx = weekIndex - (actuals.length - k);
    if (!cal.weeks[idx]?.recovery) return actuals[k];
  }
  return actuals.at(-1);
}

/**
 * Endurance, run, swim and bike minute targets for one week, under the safety caps:
 * - endurance <= reference actual x (1 + maxWeeklyIncreasePct) and <= peakHours;
 * - run <= reference actual x (1 + the lower of maxWeeklyIncreasePct and
 *   absoluteCapWeeklyIncreasePct), and <= the run share of endurance;
 * - after a missed week (reference < reentryBelowFraction x start) a target restarts at
 *   min(its ramp target, the start value); otherwise there is no floor;
 * - a load-check hold keeps both at last week's actual;
 * - recovery weeks scale the result by volumeFactor;
 * - joint status "caution" scales the run increase caps by caution.runIncreaseFactor, and
 *   "restricted" drops the run minutes: swim and bike stay as unrestricted, and endurance
 *   becomes their sum.
 * With no history the caps are the season's start values. Outputs are floored to whole minutes
 * so rounding never breaks a cap.
 */
export type WeeklyTargetOptions = { jointStatus?: PlanSettings["jointStatus"] };

export function weeklyTargets(
  cal: SeasonCalendar,
  weekIndex: number,
  history: WeekHistory,
  opts: WeeklyTargetOptions = {},
): WeeklyTargets {
  const joint = RULES["pain.jointStatus"].params;
  const jointStatus = opts.jointStatus ?? "unrestricted";
  // Caution scales the run increase caps; endurance totals are unchanged (Ruling 10).
  const runIncreaseScale = jointStatus === "caution" ? joint.caution.runIncreaseFactor : 1;
  const runAllowed = jointStatus !== "restricted" || joint.restricted.run;
  const end = RULES["volume.endurance"].params;
  const run = RULES["volume.run"].params;
  const split = RULES["volume.split"].params;
  const lc = RULES["volume.loadCheck"].params;
  const { volumeFactor } = RULES["season.recoveryWeek"].params;
  const week = weekAt(cal, weekIndex);

  const startMin = end.startHours * MIN_PER_HOUR;
  const peakMin = end.peakHours * MIN_PER_HOUR;

  // Endurance.
  const endRef = rampReference(cal, weekIndex, history.actualEnduranceMin);
  const endCap = endRef === undefined ? startMin : endRef * (1 + end.maxWeeklyIncreasePct / PERCENT);
  const ramp = rampEnduranceMin(cal, weekIndex);
  // Re-entry (Rulings 4-5): only after a missed week (reference under reentryBelowFraction x
  // start) does the target restart at min(ramp, start). Otherwise the caps apply strictly.
  const endReentry = endRef !== undefined && endRef < end.reentryBelowFraction * startMin;
  const capped = Math.min(ramp, endCap, peakMin);
  let endurance = endReentry ? Math.max(capped, Math.min(ramp, startMin)) : capped;

  // Run.
  const runRef = rampReference(cal, weekIndex, history.actualRunMin);
  const runLast = history.actualRunMin.at(-1);
  const runCap =
    runRef === undefined
      ? run.startMinPerWeek
      : runRef *
        (1 +
          (Math.min(run.maxWeeklyIncreasePct, run.absoluteCapWeeklyIncreasePct) * runIncreaseScale) / PERCENT);
  const runReentry = runRef !== undefined && runRef < run.reentryBelowFraction * run.startMinPerWeek;
  const share = weekIndex < split.earlyWeeks ? split.earlyRunShare : split.run;

  // Load check: hold at last week's actual. Applied after the floor, so the hold always wins.
  const recent = history.strainRatio.slice(-lc.weeks);
  const overloaded =
    recent.length === lc.weeks && recent.every((r) => r !== null && r > 1 + lc.overPct / PERCENT);
  const endLast = history.actualEnduranceMin.at(-1);
  if (overloaded && endLast !== undefined) endurance = Math.min(endurance, endLast);

  const runRamp = endurance * share;
  const runCapped = Math.min(runCap, runRamp);
  let runMin = runReentry ? Math.max(runCapped, Math.min(runRamp, run.startMinPerWeek)) : runCapped;
  if (overloaded && runLast !== undefined) runMin = Math.min(runMin, runLast);

  if (week.recovery) {
    endurance *= volumeFactor;
    runMin *= volumeFactor;
  }

  const enduranceMin = Math.floor(endurance);
  const runOut = Math.min(Math.floor(runMin), enduranceMin);
  const rest = enduranceMin - runOut;
  const swimMin = Math.round((rest * split.swim) / (split.swim + split.bike));
  const bikeMin = rest - swimMin;
  // Restricted: run minutes are dropped, not shifted onto swim/bike (Ruling 10, matching 7b).
  if (!runAllowed) return { enduranceMin: swimMin + bikeMin, runMin: 0, swimMin, bikeMin };
  return { enduranceMin, runMin: runOut, swimMin, bikeMin };
}
