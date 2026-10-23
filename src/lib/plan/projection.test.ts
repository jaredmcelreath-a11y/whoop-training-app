import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { cardioEntries, planSettings, raceProjections, weeklyMetrics } from "@/db/schema";
import { addDays } from "@/lib/log/dates";
import { getPlanSettings, updatePlanSettings } from "./settings";
import {
  ensureWeekProjection,
  projectionHistory,
  projectionInputs,
  recomputeWeekProjection,
  savedWeekProjection,
  startPacesChanged,
} from "./projection";

// All workouts are invented.
const TZ = "America/Chicago";
const NOW = new Date("2026-10-21T17:00:00Z");
const WEEK = "2026-10-19"; // Monday
const MI = 1609.344;
const YD = 0.9144;

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  for (const t of [raceProjections, cardioEntries, weeklyMetrics, planSettings]) await db.delete(t);
  await getPlanSettings(db, NOW, TZ);
});

const log = (kind: "run" | "bike" | "swim", localDate: string, distanceM: number, durationS: number, extra: { indoor?: boolean; inclinePct?: number } = {}) =>
  db.insert(cardioEntries).values({ kind, startedAt: new Date(`${localDate}T12:00:00Z`), localDate, durationS, distanceM, ...extra });

describe("projectionInputs", () => {
  it("uses only training through the previous Sunday", async () => {
    await log("run", addDays(WEEK, -2), 5 * MI, 3000);
    await log("run", addDays(WEEK, 4), 5 * MI, 2400); // this Friday: waits for next week
    expect((await projectionInputs(db, WEEK)).runs).toHaveLength(1);
  });

  it("drops steep treadmill runs, short swims and short rides", async () => {
    await log("run", addDays(WEEK, -3), 4 * MI, 2600, { indoor: true, inclinePct: 3 });
    await log("run", addDays(WEEK, -4), 4 * MI, 2600, { indoor: true, inclinePct: 1 });
    await log("swim", addDays(WEEK, -3), 300 * YD, 400);
    await log("bike", addDays(WEEK, -3), 8 * MI, 30 * 60);
    const i = await projectionInputs(db, WEEK);
    expect([i.runs.length, i.swims.length, i.rides.length]).toEqual([1, 0, 0]);
  });

  it("ignores training and VO2 max older than the look-back window", async () => {
    await log("swim", addDays(WEEK, -50), 1000 * YD, 1200);
    await db.insert(weeklyMetrics).values({ weekStart: addDays(WEEK, -49), vo2max: 40, whoopAge: null });
    const old = await projectionInputs(db, WEEK);
    expect([old.swims.length, old.vo2max]).toEqual([0, null]);
    await db.insert(weeklyMetrics).values({ weekStart: addDays(WEEK, -7), vo2max: 44, whoopAge: null });
    expect((await projectionInputs(db, WEEK)).vo2max).toBe(44);
  });

  it("passes the starting paces through", async () => {
    await updatePlanSettings(db, { startSwimSecPer100Yd: 125, startRunSecPerMi: 660, startBikeMph: null });
    expect((await projectionInputs(db, WEEK)).start).toEqual({ swimSecPer100Yd: 125, runSecPerMi: 660, bikeMph: null });
  });
});

describe("weekly snapshots", () => {
  it("saves a week once, even if settings change later", async () => {
    const first = await ensureWeekProjection(db, WEEK);
    await updatePlanSettings(db, { startBikeMph: 20 });
    const again = await ensureWeekProjection(db, WEEK);
    expect(again.totalS).toBe(first.totalS);
    expect(await db.select().from(raceProjections)).toHaveLength(1);
  });

  it("two qualifying swims make the swim come from training", async () => {
    await log("swim", addDays(WEEK, -3), 1000 * YD, 1250);
    await log("swim", addDays(WEEK, -5), 1000 * YD, 1300);
    expect((await ensureWeekProjection(db, WEEK)).estimates.swim).toBe(false);
  });

  it("recomputes only the current week", async () => {
    const last = await ensureWeekProjection(db, addDays(WEEK, -7));
    const before = await ensureWeekProjection(db, WEEK);
    await updatePlanSettings(db, { startBikeMph: 20 });
    const after = await recomputeWeekProjection(db, WEEK);
    expect(after.bikeS).toBeLessThan(before.bikeS);
    expect((await savedWeekProjection(db, addDays(WEEK, -7)))?.totalS).toBe(last.totalS);
  });

  it("reads a week without ever writing one", async () => {
    expect(await savedWeekProjection(db, WEEK)).toBeNull();
    expect(await db.select().from(raceProjections)).toHaveLength(0);
  });

  it("lists history oldest first, capped", async () => {
    for (const w of [-21, -14, -7, 0]) await ensureWeekProjection(db, addDays(WEEK, w));
    const h = await projectionHistory(db, WEEK, 3);
    expect(h.map((p) => p.weekStart)).toEqual([addDays(WEEK, -14), addDays(WEEK, -7), WEEK]);
  });
});

describe("startPacesChanged", () => {
  const a = { startSwimSecPer100Yd: 125, startRunSecPerMi: 660, startBikeMph: null, goalSec: null };
  it("is true only when a starting pace changed (not the goal)", () => {
    expect(startPacesChanged(a, { ...a })).toBe(false);
    expect(startPacesChanged(a, { ...a, goalSec: 20700 })).toBe(false);
    expect(startPacesChanged(a, { ...a, startBikeMph: 17 })).toBe(true);
    expect(startPacesChanged(a, { ...a, startSwimSecPer100Yd: null })).toBe(true);
  });
});
