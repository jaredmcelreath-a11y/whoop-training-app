import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import {
  bodyScans,
  cycles,
  energyEstimates,
  nutritionDays,
  nutritionSettings,
  plannedSessions,
  planSettings,
  recommendationLog,
  sweatTests,
  waterEntries,
  weightEntries,
  whoopRaw,
  workouts,
} from "@/db/schema";
import { dailyWaterTargetMl, duringSessionMl } from "@/lib/engine/hydration";
import { KG_PER_LB } from "@/lib/engine/nutrients";
import { RULES } from "@/lib/engine/rules/catalog";
import { addDays, zonedLocalToUtc } from "@/lib/log/dates";
import { getPlanSettings, updatePlanSettings } from "@/lib/plan/settings";
import { addWater } from "./water";
import { getNutritionSettings, updateNutritionSettings } from "./settings";
import { ensureEnergyEstimate, getDayNutrition, NEED } from "./service";

// All values below are invented test data.
const TZ = "America/Chicago";
// Wednesday 2026-10-21, noon in Chicago (CDT).
const NOW = new Date("2026-10-21T17:00:00Z");
const TODAY = "2026-10-21";
const TOMORROW = "2026-10-22";
const THIS_WEEK = "2026-10-19";
const LAST_WEEK = "2026-10-12";
const NEXT_WEEK = "2026-10-26";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  for (const t of [
    recommendationLog,
    plannedSessions,
    planSettings,
    nutritionSettings,
    energyEstimates,
    nutritionDays,
    waterEntries,
    sweatTests,
    weightEntries,
    bodyScans,
    cycles,
    workouts,
    whoopRaw,
  ]) {
    await db.delete(t);
  }
  await getPlanSettings(db, NOW, TZ);
  await updatePlanSettings(db, { seasonStart: "2026-10-12" });
  await getNutritionSettings(db);
});

/** A completed WHOOP cycle for owner-local `day` (starts 22:00 the evening before). */
async function seedCycle(id: number, day: string, kcal: number) {
  const start = new Date(zonedLocalToUtc(`${addDays(day, -1)}T22:00`, TZ));
  const end = new Date(start.getTime() + 24 * 3_600_000);
  await db.insert(cycles).values({ id, start, end, timezoneOffset: "-05:00", scoreState: "SCORED", kcal });
}

/** `n` completed cycles ending on `lastDay`. */
async function seedCycles(n: number, lastDay: string, kcal: number, idBase = 1000) {
  for (let i = 0; i < n; i++) await seedCycle(idBase + i, addDays(lastDay, -i), kcal);
}

async function seedDays(from: string, to: string, f: (d: string) => { kcal?: number; lb?: number }) {
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const v = f(d);
    if (v.kcal !== undefined) {
      await db.insert(nutritionDays).values({ localDate: d, sentAt: new Date(`${d}T23:00:00Z`), source: "apple_health", kcal: v.kcal });
    }
    if (v.lb !== undefined) await db.insert(weightEntries).values({ localDate: d, weightLb: v.lb });
  }
}

async function seedSession(date: string, slot: number, kind: "swim" | "bike" | "run" | "strength", durationMin: number, title = `${kind} ${durationMin}`) {
  await db.insert(plannedSessions).values({
    localDate: date,
    slot,
    kind,
    title,
    durationMin,
    intensity: kind === "strength" ? "strength" : "z2",
    details: {},
    ruleIds: [],
    weekStart: THIS_WEEK,
  });
}

describe("getDayNutrition with no data (Review Focus 2)", () => {
  it("returns null targets and lists what is missing, without throwing", async () => {
    const n = await getDayNutrition(db, TODAY, NOW, TZ);
    expect(n.targets).toBeNull();
    expect(n.micros).toBeNull();
    expect(n.eaten).toBeNull();
    expect(n.lastSyncedAt).toBeNull();
    expect(n.confidence).toBe("low");
    expect(n.needs).toEqual(
      expect.arrayContaining(["Log a weight", "Add a body scan for lean mass", "Set your reference-intake profile"]),
    );
    expect(n.needs.some((x) => /burn/i.test(x))).toBe(true);
    // Water still has a target (the lower no-profile baseline) and a counted total.
    expect(n.water.targetMl).toBeGreaterThan(0);
    expect(n.water.countedMl).toBe(0);
    expect(await db.select().from(energyEstimates)).toHaveLength(0);
  });
});

describe("ensureEnergyEstimate", () => {
  it("WHOOP data only: initial estimate from WHOOP, confidence low", async () => {
    await seedCycles(14, addDays(THIS_WEEK, -1), 2600);
    const e = await ensureEnergyEstimate(db, THIS_WEEK, NOW, TZ);
    expect(e).not.toBeNull();
    expect(e!.method).toBe("initial");
    expect(e!.inputs.initialMethod).toBe("whoop");
    expect(e!.tdeeKcal).toBe(2600);
    expect(e!.confidence).toBe("low");
    const n = await getDayNutrition(db, TODAY, NOW, TZ);
    expect(n.confidence).toBe("low");
    expect(n.needs.some((x) => /burn/i.test(x))).toBe(false);
  });

  it("second week with 14 days of intake and weights: calibrated, step ≤ 150", async () => {
    await db.insert(energyEstimates).values({ weekStart: LAST_WEEK, tdeeKcal: 2600, confidence: "low", method: "initial" });
    await seedDays(addDays(THIS_WEEK, -14), addDays(THIS_WEEK, -1), () => ({ kcal: 3200, lb: 170 }));
    const e = await ensureEnergyEstimate(db, THIS_WEEK, NOW, TZ);
    expect(e!.method).toBe("calibrated");
    expect(Math.abs(e!.tdeeKcal - 2600)).toBeLessThanOrEqual(RULES["nutrition.calibration"].params.maxWeeklyStepKcal);
    expect(e!.tdeeKcal).toBe(2750);
    expect(e!.confidence).toBe("medium");
    expect(e!.inputs.previousWeekStart).toBe(LAST_WEEK);
  });

  it("never rewrites an existing week, and is idempotent", async () => {
    await db.insert(energyEstimates).values({ weekStart: LAST_WEEK, tdeeKcal: 2400, confidence: "low", method: "initial" });
    await db.insert(energyEstimates).values({ weekStart: THIS_WEEK, tdeeKcal: 2500, confidence: "low", method: "initial" });
    const [before] = await db.select().from(energyEstimates).where(eq(energyEstimates.weekStart, THIS_WEEK));
    await seedCycles(14, addDays(THIS_WEEK, -1), 3100);
    await seedDays(addDays(THIS_WEEK, -21), addDays(THIS_WEEK, -1), () => ({ kcal: 3500, lb: 170 }));
    const a = await ensureEnergyEstimate(db, THIS_WEEK, NOW, TZ);
    const b = await ensureEnergyEstimate(db, LAST_WEEK, NOW, TZ);
    expect(a!.tdeeKcal).toBe(2500);
    expect(b!.tdeeKcal).toBe(2400);
    const [after] = await db.select().from(energyEstimates).where(eq(energyEstimates.weekStart, THIS_WEEK));
    expect(after).toEqual(before);
    expect(await db.select().from(energyEstimates)).toHaveLength(2);
  });

  it("inserts a missing week once; a second call returns the same row", async () => {
    await seedCycles(14, addDays(THIS_WEEK, -1), 2600);
    const a = await ensureEnergyEstimate(db, THIS_WEEK, NOW, TZ);
    await seedCycles(14, addDays(THIS_WEEK, -15), 9999, 2000);
    const b = await ensureEnergyEstimate(db, THIS_WEEK, NOW, TZ);
    expect(b).toEqual(a);
    expect(await db.select().from(energyEstimates)).toHaveLength(1);
  });

  it("excludes today's partial intake from calibration", async () => {
    await db.insert(energyEstimates).values({ weekStart: THIS_WEEK, tdeeKcal: 2700, confidence: "low", method: "initial" });
    await seedDays(addDays(TODAY, -14), addDays(TODAY, -1), () => ({ kcal: 2800, lb: 170 }));
    await seedDays(TODAY, TODAY, () => ({ kcal: 500, lb: 170 }));
    // Next week is in the future, so its provisional estimate runs on completed days through yesterday.
    const e = await ensureEnergyEstimate(db, NEXT_WEEK, NOW, TZ);
    expect(e!.method).toBe("calibrated");
    expect(e!.tdeeKcal).toBe(2800);
    expect(e!.inputs.throughDate).toBe(addDays(TODAY, -1));
    // A future week is not persisted, so it is computed again from the full week later.
    expect(await db.select().from(energyEstimates).where(eq(energyEstimates.weekStart, NEXT_WEEK))).toHaveLength(0);
  });
});

describe("getDayNutrition", () => {
  it("weight unknown: null targets without throwing, water still returned", async () => {
    await seedCycles(14, addDays(THIS_WEEK, -1), 2600);
    await updateNutritionSettings(db, { refProfile: "male_19_30" });
    const n = await getDayNutrition(db, TODAY, NOW, TZ);
    expect(n.targets).toBeNull();
    expect(n.needs).toContain("Log a weight");
    expect(n.micros).not.toBeNull();
    expect(n.water.targetMl).toBeGreaterThan(0);
  });

  it("floor: a 3-hour planned day is at or above the energy-availability floor", async () => {
    await seedCycles(14, addDays(THIS_WEEK, -1), 1800);
    await seedDays(addDays(TODAY, -6), TODAY, () => ({ lb: 170 }));
    await db.insert(bodyScans).values({ scannedOn: "2026-10-01", leanMassLb: 140, weightLb: 170, source: "test" });
    // Three bike rides at 10 kcal/min, and a generic "activity" that must be ignored.
    for (let i = 0; i < 3; i++) {
      const start = new Date(`2026-10-${10 + i}T12:00:00Z`);
      await db.insert(workouts).values({ id: `w${i}`, start, end: new Date(start.getTime() + 60 * 60_000), timezoneOffset: "-05:00", sportName: "cycling", scoreState: "SCORED", kcal: 600 });
    }
    const start = new Date("2026-10-14T12:00:00Z");
    await db.insert(workouts).values({ id: "wa", start, end: new Date(start.getTime() + 10 * 60_000), timezoneOffset: "-05:00", sportName: "activity", scoreState: "SCORED", kcal: 900 });
    await seedSession(TOMORROW, 0, "bike", 180, "Long ride");

    const n = await getDayNutrition(db, TOMORROW, NOW, TZ);
    expect(n.targets).not.toBeNull();
    expect(n.energy!.exerciseKcal).toBeCloseTo(1800, 6);
    const floor = RULES["nutrition.energyAvailability"].params.floorKcalPerKgFfm * 140 * KG_PER_LB + 1800;
    expect(n.targets!.kcal).toBeGreaterThanOrEqual(floor);
    expect(n.targets!.floorApplied).toBe(true);
    expect(n.needs).not.toContain("Add a body scan for lean mass");
    expect(n.water.duringSessions).toEqual([{ title: "Long ride", ml: duringSessionMl("bike", 180, {}) }]);
  });

  it("water follows the water_source setting", async () => {
    await seedSession(TOMORROW, 0, "run", 60, "Easy run");
    const at = new Date(zonedLocalToUtc(`${TOMORROW}T09:00`, TZ));
    await addWater(db, at, TZ, 500, "11111111-1111-4111-8111-111111111111");
    await db.insert(nutritionDays).values({ localDate: TOMORROW, sentAt: at, source: "apple_health", waterMl: 1200, kcal: 900, proteinG: 60 });

    const counted = async (s: "app" | "cronometer" | "both") => {
      await updateNutritionSettings(db, { waterSource: s, refProfile: "female_31_50" });
      return (await getDayNutrition(db, TOMORROW, NOW, TZ)).water.countedMl;
    };
    expect(await counted("app")).toBe(500);
    expect(await counted("cronometer")).toBe(1200);
    expect(await counted("both")).toBe(1700);

    const n = await getDayNutrition(db, TOMORROW, NOW, TZ);
    expect(n.water.targetMl).toBe(
      dailyWaterTargetMl({ profileSex: "female", sessions: [{ kind: "run", durationMin: 60 }], sweatRates: {} }).totalMl,
    );
    expect(n.eaten).toMatchObject({ kcal: 900, proteinG: 60, carbsG: null, fatG: null });
    expect(n.lastSyncedAt).toEqual(at);
  });

  it("asks for a weight to track the gain goal when no start weight is known", async () => {
    await seedCycles(14, addDays(THIS_WEEK, -1), 2600);
    await db.insert(bodyScans).values({ scannedOn: "2026-10-01", leanMassLb: 140, weightLb: 170, source: "test" });
    const n = await getDayNutrition(db, TOMORROW, NOW, TZ);
    expect(n.targets).not.toBeNull();
    expect(n.needs).toContain("Log your weight to track the gain goal");
  });

  it("asks for a gain start weight when weights exist but none since the season start", async () => {
    await seedCycles(14, addDays(THIS_WEEK, -1), 2600);
    await seedDays("2026-10-05", "2026-10-08", () => ({ lb: 160 }));
    const n = await getDayNutrition(db, TOMORROW, NOW, TZ);
    expect(n.needs).toContain(NEED.gainStart);
    expect(n.needs).not.toContain(NEED.gainWeight);
  });

  it("lists during-session fluid for long endurance sessions", async () => {
    await seedSession(TOMORROW, 0, "run", 60, "Easy run");
    const n = await getDayNutrition(db, TOMORROW, NOW, TZ);
    expect(n.water.duringSessions).toEqual([{ title: "Easy run", ml: duringSessionMl("run", 60, {}) }]);
  });

  it("carries each session's training-window index from details.window (absent when not stored)", async () => {
    await seedSession(TOMORROW, 0, "run", 60, "Easy run");
    await db.insert(plannedSessions).values({
      localDate: TOMORROW,
      slot: 1,
      kind: "swim",
      title: "Swim",
      durationMin: 45,
      intensity: "z2",
      details: { window: 1 },
      ruleIds: [],
      weekStart: THIS_WEEK,
    });
    const n = await getDayNutrition(db, TOMORROW, NOW, TZ);
    expect(n.sessions.map((s) => [s.title, s.window])).toEqual([
      ["Easy run", undefined],
      ["Swim", 1],
    ]);
  });
});

describe("hardening (Plan 5 Task 7)", () => {
  it("never persists a week before the current week: no stored row → null", async () => {
    await seedCycles(14, addDays(LAST_WEEK, -1), 2600);
    expect(await ensureEnergyEstimate(db, LAST_WEEK, NOW, TZ)).toBeNull();
    expect(await db.select().from(energyEstimates)).toHaveLength(0);
  });

  it("a past week with a stored row still returns it", async () => {
    await db.insert(energyEstimates).values({ weekStart: LAST_WEEK, tdeeKcal: 2450, confidence: "low", method: "initial" });
    expect((await ensureEnergyEstimate(db, LAST_WEEK, NOW, TZ))!.tdeeKcal).toBe(2450);
  });

  it("a past day without a stored estimate renders null targets, writes nothing and does not ask to sync WHOOP", async () => {
    await seedCycles(14, addDays(LAST_WEEK, -1), 2600);
    await db.insert(bodyScans).values({ scannedOn: "2026-10-01", leanMassLb: 140, weightLb: 170, source: "test" });
    const n = await getDayNutrition(db, addDays(LAST_WEEK, 2), NOW, TZ);
    expect(n.targets).toBeNull();
    expect(n.energy).toBeNull();
    expect(n.needs).not.toContain(NEED.burn);
    expect(await db.select().from(energyEstimates)).toHaveLength(0);
  });

  it("bounds the season start weight by the day's asOf date", async () => {
    // A pre-season weight gives the trend; the only in-season weight is after the viewed day.
    await seedDays("2026-10-08", "2026-10-08", () => ({ lb: 160 }));
    await seedDays(TODAY, TODAY, () => ({ lb: 165 }));
    const n = await getDayNutrition(db, "2026-10-13", NOW, TZ);
    expect(n.needs).toContain(NEED.gainStart);
  });

  it("lists a gain-goal need only in a gain or surplus week (not in a taper week)", async () => {
    await updatePlanSettings(db, { seasonStart: "2026-04-06", raceDate: addDays(THIS_WEEK, 7 * RULES["season.phases"].params.taperWeeks) });
    await seedCycles(14, addDays(THIS_WEEK, -1), 2600);
    await db.insert(bodyScans).values({ scannedOn: "2026-10-01", leanMassLb: 140, weightLb: 170, source: "test" });
    const n = await getDayNutrition(db, TOMORROW, NOW, TZ);
    expect(n.targets).not.toBeNull();
    expect(n.energy!.surplusKcal).toBe(0);
    expect(n.needs).not.toContain(NEED.gainWeight);
    expect(n.needs).not.toContain(NEED.gainStart);
  });

  it("lists no gain-goal need outside the season calendar", async () => {
    await seedDays("2026-10-01", "2026-10-01", () => ({ lb: 160 }));
    const n = await getDayNutrition(db, "2026-10-05", NOW, TZ);
    expect(n.needs).not.toContain(NEED.gainStart);
    expect(n.needs).not.toContain(NEED.gainWeight);
  });

  it("excludes an open (unfinished) WHOOP cycle from the initial estimate", async () => {
    await seedCycles(13, addDays(THIS_WEEK, -2), 2600);
    const start = new Date(zonedLocalToUtc(`${addDays(THIS_WEEK, -2)}T22:00`, TZ));
    await db.insert(cycles).values({ id: 9000, start, end: null, timezoneOffset: "-05:00", scoreState: "PENDING_SCORE", kcal: 9000 });
    const e = await ensureEnergyEstimate(db, THIS_WEEK, NOW, TZ);
    expect(e!.inputs.initialMethod).toBe("whoop");
    expect(e!.tdeeKcal).toBe(2600);
  });

  it("a stored estimate with an unusable burn gives null targets instead of throwing", async () => {
    await db.insert(energyEstimates).values({ weekStart: THIS_WEEK, tdeeKcal: Number.NaN, confidence: "low", method: "initial" });
    await db.insert(bodyScans).values({ scannedOn: "2026-10-01", leanMassLb: 140, weightLb: 170, source: "test" });
    const n = await getDayNutrition(db, TOMORROW, NOW, TZ);
    expect(n.targets).toBeNull();
    expect(n.needs).toContain(NEED.burn);
  });

  it("calibrates from the initial estimate when the previous week's burn is unusable", async () => {
    await db.insert(energyEstimates).values({ weekStart: LAST_WEEK, tdeeKcal: Number.NaN, confidence: "low", method: "initial" });
    await seedCycles(14, addDays(THIS_WEEK, -1), 2600);
    const e = await ensureEnergyEstimate(db, THIS_WEEK, NOW, TZ);
    expect(e!.method).toBe("calibrated");
    expect(e!.tdeeKcal).toBe(2600);
    expect(e!.inputs.fallbackTdee).toBe(2600);
  });
});
