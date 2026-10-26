/**
 * Nutrition service: wires the pure energy and hydration engines to the database.
 *
 * - ensureEnergyEstimate: one burn estimate per week (energy_estimates), computed once from
 *   completed days before the week and never rewritten. The first week uses initialTdee; later
 *   weeks calibrate the most recent earlier week's estimate (Ruling 3).
 * - getDayNutrition: a day's calorie, macro, micro and water targets, what has been eaten and
 *   drunk, and what setup is still missing. Missing data never throws: targets are null and
 *   `needs` says what to add.
 *
 * Exercise kcal feeds only dayTargets' floor and distribution, never a TDEE (Ruling 2).
 * Every write is a single idempotent statement (no transactions).
 */
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lt, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notDismissed } from "@/lib/log/dismissed";
import { bodyScans, cycles, energyEstimates, nutritionDays, plannedSessions, weightEntries, whoopRaw, workouts } from "@/db/schema";
import {
  calibrateTdee,
  dayTargets,
  initialTdee,
  microTargets,
  plannedExerciseKcal,
  weeklyCalorieTarget,
  weeklyGainPct,
  type DayTargetsResult,
  type ExerciseKind,
  type MicroTargets,
  type PlannedSessionLite,
  type Reason,
} from "@/lib/engine/energy";
import { dailyWaterTargetMl, duringSessionMl, type SweatKind } from "@/lib/engine/hydration";
import { KG_PER_LB } from "@/lib/engine/nutrients";
import { RULES } from "@/lib/engine/rules/catalog";
import { seasonCalendar, type SeasonWeek } from "@/lib/engine/season";
import { addDays, localDate, weekStart as weekStartOf } from "@/lib/log/dates";
import type { LinkKind } from "@/lib/log/link-whoop";
import { cycleDate, whoopKind, whoopSports } from "@/lib/plan/inputs";
import { getDayPlan } from "@/lib/plan/service";
import { getPlanSettings } from "@/lib/plan/settings";
import { NEED } from "./needs";
import { latestSweatRates, waterToday } from "./water";
import { getNutritionSettings, type NutritionSettings } from "./settings";

// Unit conversions and calendar facts, not tunable thresholds.
const DAYS_PER_WEEK = 7;
const CM_PER_M = 100;
const MS_PER_MIN = 60_000;
const MS_PER_DAY = 86_400_000;
/** Query margin around a local-date range, wider than any UTC offset. */
const MARGIN_MS = 2 * MS_PER_DAY;
const ENDURANCE: ReadonlySet<string> = new Set(["swim", "bike", "run"]);
const HISTORY_KINDS: LinkKind[] = ["swim", "bike", "run", "strength"];

export { NEED } from "./needs";

export type EnergyEstimate = typeof energyEstimates.$inferSelect & { inputs: Record<string, unknown> };

const isPos = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x > 0;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const dateRange = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};
const minDate = (a: string, b: string) => (a < b ? a : b);

// ---------------------------------------------------------------------------
// Readers
// ---------------------------------------------------------------------------

/** Positive daily weights (lb) for local dates [from, to]. */
async function weightsBetween(db: Db, from: string, to: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ d: weightEntries.localDate, lb: weightEntries.weightLb })
    .from(weightEntries)
    .where(and(gte(weightEntries.localDate, from), lte(weightEntries.localDate, to)));
  return new Map(rows.filter((r) => isPos(r.lb)).map((r) => [r.d, r.lb]));
}

/** 7-day trailing mean of the daily weights ending on each date; missing days skipped, null if none. */
function trailingMeans(weights: Map<string, number>, dates: string[]): (number | null)[] {
  return dates.map((d) => {
    const xs = dateRange(addDays(d, -(DAYS_PER_WEEK - 1)), d)
      .map((x) => weights.get(x))
      .filter(isPos);
    return xs.length ? mean(xs) : null;
  });
}

/** The 7-day trailing mean (lb) ending at the latest positive weigh-in on or before `asOf`. */
async function latestMeanLb(db: Db, asOf: string): Promise<number | null> {
  const [latest] = await db
    .select({ d: weightEntries.localDate })
    .from(weightEntries)
    .where(and(lte(weightEntries.localDate, asOf), gt(weightEntries.weightLb, 0)))
    .orderBy(desc(weightEntries.localDate))
    .limit(1);
  if (!latest) return null;
  const w = await weightsBetween(db, addDays(latest.d, -(DAYS_PER_WEEK - 1)), latest.d);
  return trailingMeans(w, [latest.d])[0];
}

type Scan = typeof bodyScans.$inferSelect;
async function latestScan(db: Db, asOf: string): Promise<Scan | null> {
  const [s] = await db
    .select()
    .from(bodyScans)
    .where(lte(bodyScans.scannedOn, asOf))
    .orderBy(desc(bodyScans.scannedOn), desc(bodyScans.id))
    .limit(1);
  return s ?? null;
}

/** WHOOP body measurement: height (cm) and weight (kg) when present and positive. */
async function whoopBody(db: Db): Promise<{ heightCm: number | null; weightKg: number | null }> {
  const [row] = await db
    .select({ payload: whoopRaw.payload })
    .from(whoopRaw)
    .where(and(eq(whoopRaw.resource, "body"), eq(whoopRaw.id, "current")));
  const p = (row?.payload ?? {}) as { height_meter?: unknown; weight_kilogram?: unknown };
  return {
    heightCm: isPos(p.height_meter) ? p.height_meter * CM_PER_M : null,
    weightKg: isPos(p.weight_kilogram) ? p.weight_kilogram : null,
  };
}

/** Completed WHOOP cycle kcal per owner-local day in [from, to], oldest first (missing days omitted). */
async function whoopKcalDaily(db: Db, from: string, to: string, tz: string): Promise<number[]> {
  const rows = await db
    .select({ start: cycles.start, offset: cycles.timezoneOffset, kcal: cycles.kcal })
    .from(cycles)
    .where(
      and(
        isNotNull(cycles.end),
        gte(cycles.start, new Date(Date.parse(`${from}T00:00:00Z`) - MARGIN_MS)),
        lt(cycles.start, new Date(Date.parse(`${to}T00:00:00Z`) + MARGIN_MS)),
      ),
    )
    .orderBy(asc(cycles.start));
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const d = cycleDate(r.start, r.offset, tz);
    if (d >= from && d <= to && isPos(r.kcal)) byDay.set(d, r.kcal);
  }
  return [...byDay.keys()].sort().map((d) => byDay.get(d) as number);
}

function sexOf(profile: NutritionSettings["refProfile"]): "male" | "female" | null {
  if (!profile) return null;
  return profile.startsWith("male") ? "male" : "female";
}

// ---------------------------------------------------------------------------
// Weekly estimate
// ---------------------------------------------------------------------------

async function computeEstimate(
  db: Db,
  weekStart: string,
  today: string,
  tz: string,
  settings: NutritionSettings,
): Promise<Omit<EnergyEstimate, "updatedAt"> | null> {
  // Completed local days only: before the week, and never today (its posts are partial).
  const through = minDate(addDays(weekStart, -1), addDays(today, -1));
  const [prev] = await db
    .select()
    .from(energyEstimates)
    .where(lt(energyEstimates.weekStart, weekStart))
    .orderBy(desc(energyEstimates.weekStart))
    .limit(1);

  const initial = async () => {
    const ip = RULES["nutrition.initialTdee"].params;
    const scan = await latestScan(db, today);
    const body = await whoopBody(db);
    const meanLb = await latestMeanLb(db, today);
    const weightKg = meanLb !== null ? meanLb * KG_PER_LB : isPos(scan?.weightLb) ? scan.weightLb * KG_PER_LB : body.weightKg;
    return initialTdee({
      whoopKcalDaily: await whoopKcalDaily(db, addDays(through, -(ip.whoopWindowDays - 1)), through, tz),
      bmrKcal: isPos(scan?.bmrKcal) ? scan.bmrKcal : null,
      weightKg,
      heightCm: body.heightCm,
      ageYears: null, // No birth date is stored, so Mifflin-St Jeor cannot run.
      sex: sexOf(settings.refProfile),
    });
  };

  if (prev) {
    // An unusable stored burn (not a positive finite number) restarts from the initial estimate.
    const fallbackTdee = isPos(prev.tdeeKcal) ? null : (await initial()).tdee;
    if (!isPos(prev.tdeeKcal) && fallbackTdee === null) return null;
    const cp = RULES["nutrition.calibration"].params;
    const days = dateRange(addDays(through, -(Math.max(cp.windowDays, cp.highConfidenceDays) - 1)), through);
    const intakeRows = await db
      .select({ d: nutritionDays.localDate, kcal: nutritionDays.kcal })
      .from(nutritionDays)
      .where(and(gte(nutritionDays.localDate, days[0]), lte(nutritionDays.localDate, through)));
    const intake = new Map(intakeRows.map((r) => [r.d, r.kcal]));
    const intakeKcal = days.map((d) => {
      const k = intake.get(d);
      return isPos(k) ? k : null;
    });
    const weights = await weightsBetween(db, addDays(days[0], -(DAYS_PER_WEEK - 1)), through);
    const weightLbTrend = trailingMeans(weights, days);
    const c = calibrateTdee({ previousTdee: prev.tdeeKcal, fallbackTdee, intakeKcal, weightLbTrend, windowDays: cp.windowDays });
    return {
      weekStart,
      tdeeKcal: c.tdee,
      confidence: c.confidence,
      method: "calibrated",
      inputs: {
        previousWeekStart: prev.weekStart,
        previousTdee: prev.tdeeKcal,
        ...(fallbackTdee !== null ? { fallbackTdee } : {}),
        throughDate: through,
        days: days.length,
        changed: c.changed,
        ruleIds: c.ruleIds,
        reasons: c.reasons,
      },
    };
  }

  const i = await initial();
  if (i.tdee === null) return null;
  return {
    weekStart,
    tdeeKcal: i.tdee,
    confidence: "low",
    method: "initial",
    inputs: { initialMethod: i.method, throughDate: through, ruleIds: i.ruleIds, reasons: i.reasons },
  };
}

/**
 * The week's burn estimate. An existing row is returned unchanged (past weeks are never
 * rewritten). A week before the current local week with no stored row returns null: it is never
 * backfilled with today's inputs. Otherwise it is computed from completed days before the week
 * (and before today), then inserted with on-conflict-do-nothing and re-selected. A future week
 * is computed the same way but not stored, so it is calibrated on its full previous week once
 * it starts; so is any week when `store` is false (a past day's read-only view). Null when there
 * is no previous estimate and initialTdee has nothing to work from.
 */
export async function ensureEnergyEstimate(
  db: Db,
  weekStart: string,
  now: Date,
  tz: string,
  { store = true }: { store?: boolean } = {},
): Promise<EnergyEstimate | null> {
  const select = async () => {
    const [row] = await db.select().from(energyEstimates).where(eq(energyEstimates.weekStart, weekStart));
    return (row as EnergyEstimate | undefined) ?? null;
  };
  const existing = await select();
  if (existing) return existing;

  const today = localDate(now, tz);
  if (weekStart < weekStartOf(today)) return null;
  const est = await computeEstimate(db, weekStart, today, tz, await getNutritionSettings(db));
  if (!est) return null;
  if (!store || weekStart > weekStartOf(today)) return { ...est, updatedAt: now };
  await db.insert(energyEstimates).values({ ...est, updatedAt: now }).onConflictDoNothing({ target: energyEstimates.weekStart });
  return select();
}

// ---------------------------------------------------------------------------
// Day nutrition
// ---------------------------------------------------------------------------

/** Median WHOOP kcal/min per kind over historyLookbackDays, for kinds with ≥ historyMinWorkouts workouts. */
async function exerciseHistory(db: Db, now: Date): Promise<Partial<Record<ExerciseKind, number>>> {
  const p = RULES["nutrition.exerciseKcal"].params;
  const sports = [...new Set(HISTORY_KINDS.flatMap(whoopSports))];
  const rows = await db
    .select({ sport: workouts.sportName, start: workouts.start, end: workouts.end, kcal: workouts.kcal })
    .from(workouts)
    .where(and(gte(workouts.start, new Date(now.getTime() - p.historyLookbackDays * MS_PER_DAY)), lte(workouts.start, now), inArray(workouts.sportName, sports), notDismissed));
  const rates = new Map<LinkKind, number[]>();
  for (const r of rows) {
    const kind = whoopKind(r.sport);
    const min = (r.end.getTime() - r.start.getTime()) / MS_PER_MIN;
    if (!kind || !isPos(r.kcal) || !(min > 0)) continue;
    rates.set(kind, [...(rates.get(kind) ?? []), r.kcal / min]);
  }
  const out: Partial<Record<ExerciseKind, number>> = {};
  for (const [kind, xs] of rates) if (xs.length >= p.historyMinWorkouts) out[kind] = median(xs);
  return out;
}

type DaySessionLite = {
  title: string;
  kind: PlannedSessionLite["kind"];
  durationMin: number;
  intensity: string;
  /** Training-window index from the planned session's details.window, when stored. */
  window?: number;
};

const windowOf = (details: unknown): number | undefined => {
  const w = (details as { window?: unknown } | null)?.window;
  return typeof w === "number" && Number.isInteger(w) && w >= 0 ? w : undefined;
};

export type DayNutrition = {
  targets: DayTargetsResult | null;
  micros: MicroTargets | null;
  water: { targetMl: number; countedMl: number; duringSessions: { title: string; ml: number }[] };
  eaten: {
    kcal: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    fiberG: number | null;
    micros: Record<string, { value: number; unit: string }>;
  } | null;
  lastSyncedAt: Date | null;
  confidence: "low" | "medium" | "high";
  needs: string[];
  /** The burn estimate and weekly target behind the day's kcal; null without an estimate. */
  energy: {
    tdeeKcal: number;
    method: "initial" | "calibrated";
    weeklyAvgKcal: number;
    surplusKcal: number;
    exerciseKcal: number;
    reasons: Reason[];
  } | null;
  /** The weight used for targets (kg), and where it came from. */
  weight: { kg: number; source: "log" | "scan" | "whoop" } | null;
  /** The day's sessions used for exercise kcal and water (adapted for today, stored otherwise). */
  sessions: DaySessionLite[];
};

/**
 * Everything the app shows about a day's food and water. For today, sessions come from
 * getDayPlan (adapted; it logs today's fired rules); for other dates, stored planned_sessions
 * are read directly so nothing is written. The week's endurance minutes always come from
 * stored sessions. Never throws for missing data.
 */
export async function getDayNutrition(db: Db, date: string, now: Date, tz: string): Promise<DayNutrition> {
  const today = localDate(now, tz);
  const ws = weekStartOf(date);
  const asOf = minDate(date, today);
  const needs: string[] = [];
  const need = (s: string) => {
    if (!needs.includes(s)) needs.push(s);
  };

  const ns = await getNutritionSettings(db);
  const ps = await getPlanSettings(db, now, tz);
  let seasonWeek: SeasonWeek | null = null;
  try {
    seasonWeek = seasonCalendar(ps).weeks.find((w) => w.weekStart === ws) ?? null;
  } catch {
    seasonWeek = null;
  }

  // Sessions.
  const stored = await db
    .select()
    .from(plannedSessions)
    .where(and(gte(plannedSessions.localDate, ws), lte(plannedSessions.localDate, addDays(ws, DAYS_PER_WEEK - 1))))
    .orderBy(asc(plannedSessions.localDate), asc(plannedSessions.slot));
  const daySource =
    date === today ? (await getDayPlan(db, date, now, tz)).sessions : stored.filter((r) => r.localDate === date);
  const sessions: DaySessionLite[] = daySource
    .filter((s) => s.status !== "skipped" && s.kind !== "rest")
    .map((s) => {
      const window = windowOf(s.details);
      return { title: s.title, kind: s.kind, durationMin: s.durationMin, intensity: s.intensity, ...(window !== undefined ? { window } : {}) };
    });
  // Re-read stored rows when getDayPlan may just have generated the week.
  const weekRows =
    date === today
      ? await db
          .select()
          .from(plannedSessions)
          .where(and(gte(plannedSessions.localDate, ws), lte(plannedSessions.localDate, addDays(ws, DAYS_PER_WEEK - 1))))
      : stored;
  const enduranceMin = (d: string) =>
    weekRows.filter((r) => r.localDate === d && ENDURANCE.has(r.kind) && r.status !== "skipped").reduce((a, r) => a + r.durationMin, 0);
  const weekEnduranceMin = dateRange(ws, addDays(ws, DAYS_PER_WEEK - 1)).map(enduranceMin);
  // The kcal swing counts lifting too (nutrition.dayDistribution); carbs stay on endurance.
  const loadMin = (d: string) =>
    enduranceMin(d) + weekRows.filter((r) => r.localDate === d && r.kind === "strength" && r.status !== "skipped").reduce((a, r) => a + r.durationMin, 0);
  const weekLoadMin = dateRange(ws, addDays(ws, DAYS_PER_WEEK - 1)).map(loadMin);

  // Body inputs.
  const meanLb = await latestMeanLb(db, asOf);
  const scan = await latestScan(db, asOf);
  const body = await whoopBody(db);
  const weight: DayNutrition["weight"] =
    meanLb !== null
      ? { kg: meanLb * KG_PER_LB, source: "log" }
      : isPos(scan?.weightLb)
        ? { kg: scan.weightLb * KG_PER_LB, source: "scan" }
        : body.weightKg !== null
          ? { kg: body.weightKg, source: "whoop" }
          : null;
  if (!weight) need(NEED.weight);
  const ffmKg = isPos(scan?.leanMassLb) ? scan.leanMassLb * KG_PER_LB : null;
  if (ffmKg === null) need(NEED.scan);

  // Gain goal. Its needs only matter in a week that can have a surplus (gain phase, or a base or
  // build week while the goal remains).
  const surplusWeek = seasonWeek !== null && weeklyGainPct({ ...seasonWeek, remainingGoalLb: ns.gainGoalLb }) > 0;
  let startLb = ns.gainStartWeightLb;
  if (!isPos(startLb)) {
    const [first] = await db
      .select({ lb: weightEntries.weightLb })
      .from(weightEntries)
      .where(and(gte(weightEntries.localDate, ps.seasonStart), lte(weightEntries.localDate, asOf), gt(weightEntries.weightLb, 0)))
      .orderBy(asc(weightEntries.localDate))
      .limit(1);
    startLb = first?.lb ?? null;
  }
  let remainingGoalLb = ns.gainGoalLb;
  if (isPos(startLb) && meanLb !== null) remainingGoalLb = ns.gainGoalLb - (meanLb - startLb);
  // Logged weights but none since season_start: logging more won't help, a start weight will.
  else if (surplusWeek && meanLb !== null) need(NEED.gainStart);
  else if (surplusWeek && weight) need(NEED.gainWeight);

  // Energy. A past week keeps whatever estimate it had; syncing now cannot give it one.
  // A past day is read only: its week's estimate is computed if missing, never stored.
  const estimate = await ensureEnergyEstimate(db, ws, now, tz, { store: date >= today });
  const usable = estimate !== null && isPos(estimate.tdeeKcal);
  if (!usable && ws >= weekStartOf(today)) need(NEED.burn);

  let targets: DayTargetsResult | null = null;
  let energy: DayNutrition["energy"] = null;
  if (estimate && usable && weight) {
    const weekly = seasonWeek
      ? weeklyCalorieTarget({
          tdee: estimate.tdeeKcal,
          weightLb: weight.kg / KG_PER_LB,
          gainPhase: seasonWeek.gainPhase,
          phase: seasonWeek.phase,
          remainingGoalLb,
        })
      : {
          kcal: estimate.tdeeKcal,
          surplusKcal: 0,
          ruleIds: ["nutrition.gainRate" as const],
          reasons: [{ ruleId: "nutrition.gainRate" as const, text: "Outside the season calendar: no surplus, target is the burn estimate." }],
        };
    const ex = plannedExerciseKcal(sessions, weight.kg, await exerciseHistory(db, now));
    targets = dayTargets({
      weeklyAvgKcal: weekly.kcal,
      dayEnduranceMin: enduranceMin(date),
      weekEnduranceMin,
      weightKg: weight.kg,
      ffmKg,
      dayExerciseKcal: ex.kcal,
      dayLoadMin: loadMin(date),
      weekLoadMin,
    });
    const estReasons = Array.isArray(estimate.inputs.reasons) ? (estimate.inputs.reasons as Reason[]) : [];
    energy = {
      tdeeKcal: estimate.tdeeKcal,
      method: estimate.method,
      weeklyAvgKcal: weekly.kcal,
      surplusKcal: weekly.surplusKcal,
      exerciseKcal: ex.kcal,
      reasons: [...estReasons, ...weekly.reasons, ...ex.reasons],
    };
  }

  const micro = microTargets(ns.refProfile);
  if (!micro.targets) need(NEED.profile);

  // Water.
  const rates = await latestSweatRates(db);
  const sweatSessions = sessions
    .filter((s): s is DaySessionLite & { kind: SweatKind } => ENDURANCE.has(s.kind))
    .map((s) => ({ ...s, kind: s.kind as SweatKind }));
  const waterTarget = dailyWaterTargetMl({
    profileSex: sexOf(ns.refProfile),
    sessions: sweatSessions.map((s) => ({ kind: s.kind, durationMin: s.durationMin })),
    sweatRates: rates,
  });
  const counted = await waterToday(db, date, ns.waterSource);
  const duringSessions = sweatSessions
    .map((s) => ({ title: s.title, ml: duringSessionMl(s.kind, s.durationMin, rates) }))
    .filter((s) => s.ml > 0);

  // Eaten.
  const [day] = await db.select().from(nutritionDays).where(eq(nutritionDays.localDate, date));

  return {
    targets,
    micros: micro.targets,
    water: { targetMl: waterTarget.totalMl, countedMl: counted.countedMl, duringSessions },
    eaten: day
      ? { kcal: day.kcal, proteinG: day.proteinG, carbsG: day.carbsG, fatG: day.fatG, fiberG: day.fiberG, micros: day.micros }
      : null,
    lastSyncedAt: day?.sentAt ?? null,
    confidence: estimate && estimate.method !== "initial" ? estimate.confidence : "low",
    needs,
    energy,
    weight,
    sessions,
  };
}
