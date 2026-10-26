import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { cardioEntries, dismissedWorkouts, planSettings, raceProjections, weeklyMetrics, workouts } from "@/db/schema";
import { addDays } from "@/lib/log/dates";
import { getPlanSettings, updatePlanSettings } from "./settings";
import {
  ensureWeekProjection,
  liveWeekProjection,
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
  for (const t of [raceProjections, dismissedWorkouts, cardioEntries, workouts, weeklyMetrics, planSettings]) await db.delete(t);
  await getPlanSettings(db, NOW, TZ);
});

const log = (kind: "run" | "bike" | "swim", localDate: string, distanceM: number, durationS: number, extra: { indoor?: boolean; inclinePct?: number } = {}) =>
  db.insert(cardioEntries).values({ kind, startedAt: new Date(`${localDate}T12:00:00Z`), localDate, durationS, distanceM, ...extra });

describe("projectionInputs", () => {
  it("uses only training through the previous Sunday", async () => {
    await log("run", addDays(WEEK, -2), 5 * MI, 3000);
    await log("run", addDays(WEEK, 4), 5 * MI, 2400); // this Friday: waits for next week
    expect((await projectionInputs(db, WEEK, TZ)).runs).toHaveLength(1);
  });

  it("drops steep treadmill runs, short swims and short rides", async () => {
    await log("run", addDays(WEEK, -3), 4 * MI, 2600, { indoor: true, inclinePct: 3 });
    await log("run", addDays(WEEK, -4), 4 * MI, 2600, { indoor: true, inclinePct: 1 });
    await log("swim", addDays(WEEK, -3), 300 * YD, 400);
    await log("bike", addDays(WEEK, -3), 8 * MI, 30 * 60);
    const i = await projectionInputs(db, WEEK, TZ);
    expect([i.runs.length, i.swims.length, i.rides.length]).toEqual([1, 0, 0]);
  });

  it("ignores training and VO2 max older than the look-back window", async () => {
    await log("swim", addDays(WEEK, -50), 1000 * YD, 1200);
    await db.insert(weeklyMetrics).values({ weekStart: addDays(WEEK, -49), vo2max: 40, whoopAge: null });
    const old = await projectionInputs(db, WEEK, TZ);
    expect([old.swims.length, old.vo2max]).toEqual([0, null]);
    await db.insert(weeklyMetrics).values({ weekStart: addDays(WEEK, -7), vo2max: 44, whoopAge: null });
    expect((await projectionInputs(db, WEEK, TZ)).vo2max).toBe(44);
  });

  it("passes the starting paces through", async () => {
    await updatePlanSettings(db, { startSwimSecPer100Yd: 125, startRunSecPerMi: 660, startBikeMph: null });
    expect((await projectionInputs(db, WEEK, TZ)).start).toEqual({ swimSecPer100Yd: 125, runSecPerMi: 660, bikeMph: null });
  });
});

describe("weekly snapshots", () => {
  it("saves a week once, even if settings change later", async () => {
    const first = await ensureWeekProjection(db, WEEK, TZ);
    await updatePlanSettings(db, { startBikeMph: 20 });
    const again = await ensureWeekProjection(db, WEEK, TZ);
    expect(again.totalS).toBe(first.totalS);
    expect(await db.select().from(raceProjections)).toHaveLength(1);
  });

  it("two qualifying swims make the swim come from training", async () => {
    await log("swim", addDays(WEEK, -3), 1000 * YD, 1250);
    await log("swim", addDays(WEEK, -5), 1000 * YD, 1300);
    expect((await ensureWeekProjection(db, WEEK, TZ)).estimates.swim).toBe(false);
  });

  it("recomputes only the current week", async () => {
    const last = await ensureWeekProjection(db, addDays(WEEK, -7), TZ);
    const before = await ensureWeekProjection(db, WEEK, TZ);
    await updatePlanSettings(db, { startBikeMph: 20 });
    const after = await recomputeWeekProjection(db, WEEK, TZ);
    expect(after.bikeS).toBeLessThan(before.bikeS);
    expect((await savedWeekProjection(db, addDays(WEEK, -7)))?.totalS).toBe(last.totalS);
  });

  it("keeps the first value of a week when it's recomputed", async () => {
    const first = await ensureWeekProjection(db, WEEK, TZ);
    expect(first.initialTotalS).toBe(first.totalS);
    await updatePlanSettings(db, { startBikeMph: 20 });
    const after = await recomputeWeekProjection(db, WEEK, TZ);
    expect(after.totalS).toBeLessThan(first.totalS);
    expect(after.initialTotalS).toBe(first.totalS);
  });

  it("reads a week without ever writing one", async () => {
    expect(await savedWeekProjection(db, WEEK)).toBeNull();
    expect(await db.select().from(raceProjections)).toHaveLength(0);
  });

  it("lists history oldest first, capped", async () => {
    for (const w of [-21, -14, -7, 0]) await ensureWeekProjection(db, addDays(WEEK, w), TZ);
    const h = await projectionHistory(db, WEEK, 3);
    expect(h.map((p) => p.weekStart)).toEqual([addDays(WEEK, -14), addDays(WEEK, -7), WEEK]);
  });
});

describe("liveWeekProjection", () => {
  it("adds this week's workouts so far, without changing the saved week", async () => {
    await log("run", addDays(WEEK, -3), 5 * MI, 2400);
    const saved = await ensureWeekProjection(db, WEEK, TZ);
    expect(saved.estimates.run).toBe(true); // one run is not enough
    expect(await liveWeekProjection(db, WEEK, "2026-10-21", TZ)).toBe(saved.totalS);
    await log("run", addDays(WEEK, 1), 5 * MI, 2400); // Tuesday this week, 8:00 /mi
    const live = await liveWeekProjection(db, WEEK, "2026-10-21", TZ);
    expect(live).toBeLessThan(saved.totalS);
    expect((await savedWeekProjection(db, WEEK))?.totalS).toBe(saved.totalS);
  });

  it("never counts days after today", async () => {
    await log("run", addDays(WEEK, -3), 5 * MI, 2400);
    await log("run", addDays(WEEK, 4), 5 * MI, 2400); // Friday, after "today"
    const saved = await ensureWeekProjection(db, WEEK, TZ);
    expect(await liveWeekProjection(db, WEEK, "2026-10-21", TZ)).toBe(saved.totalS);
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

describe("WHOOP workouts with GPS distance", () => {
  const whoop = (id: string, sport: string, localDate: string, distanceM: number | null, min = 50) =>
    db.insert(workouts).values({
      id,
      start: new Date(`${localDate}T13:00:00Z`),
      end: new Date(new Date(`${localDate}T13:00:00Z`).getTime() + min * 60_000),
      timezoneOffset: "-05:00",
      sportName: sport,
      scoreState: "SCORED",
      distanceM,
    });

  it("count automatically when they have a distance", async () => {
    await whoop("r1", "running", addDays(WEEK, -2), 5 * MI);
    await whoop("c1", "cycling", addDays(WEEK, -3), 15 * MI, 60);
    await whoop("s1", "swimming", addDays(WEEK, -4), 1200 * YD, 30);
    const i = await projectionInputs(db, WEEK, TZ);
    expect([i.runs.length, i.rides.length, i.swims.length]).toEqual([1, 1, 1]);
    expect(i.runs[0]).toEqual({ distanceM: 5 * MI, durationS: 50 * 60 });
  });

  it("leave out workouts with no distance, spin, generic activity, dismissed ones and this week's", async () => {
    await whoop("nodist", "running", addDays(WEEK, -2), null);
    await whoop("spin", "spin", addDays(WEEK, -2), 15 * MI, 60);
    await whoop("act", "activity", addDays(WEEK, -2), 5 * MI);
    await whoop("fake", "running", addDays(WEEK, -3), 5 * MI);
    await db.insert(dismissedWorkouts).values({ workoutId: "fake" });
    await whoop("later", "running", addDays(WEEK, 2), 5 * MI);
    const i = await projectionInputs(db, WEEK, TZ);
    expect([i.runs.length, i.rides.length]).toEqual([0, 0]);
  });

  it("never count a workout twice when it was also logged", async () => {
    const day = addDays(WEEK, -2);
    await whoop("linked", "running", day, 5 * MI);
    await db.insert(cardioEntries).values({ kind: "run", startedAt: new Date(`${day}T13:00:00Z`), localDate: day, durationS: 3000, distanceM: 5 * MI, whoopWorkoutId: "linked" });
    const day2 = addDays(WEEK, -3);
    await whoop("overlap", "running", day2, 5 * MI);
    await db.insert(cardioEntries).values({ kind: "run", startedAt: new Date(`${day2}T13:05:00Z`), localDate: day2, durationS: 2900, distanceM: 5 * MI });
    expect((await projectionInputs(db, WEEK, TZ)).runs).toHaveLength(2);
  });
});
