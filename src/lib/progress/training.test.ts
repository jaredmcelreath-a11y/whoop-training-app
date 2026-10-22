import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { cardioEntries, exercises, plannedSessions, strengthSessions, strengthSets, weeklyMetrics } from "@/db/schema";
import { getTrainingProgress } from "./training";

// All values below are invented test data.
const TZ = "America/Chicago";
const NOW = new Date("2026-10-21T17:00:00Z");

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  for (const t of [strengthSets, strengthSessions, exercises, cardioEntries, weeklyMetrics, plannedSessions]) await db.delete(t);
});

const cardio = (kind: "run" | "bike" | "swim", localDate: string, durationS: number, extra: { distanceM?: number; avgWatts?: number } = {}) =>
  db.insert(cardioEntries).values({ kind, startedAt: new Date(`${localDate}T12:00:00Z`), localDate, durationS, ...extra });

describe("getTrainingProgress", () => {
  it("returns empty arrays without data", async () => {
    const p = await getTrainingProgress(db, NOW, TZ, "4w");
    expect(p).toEqual({ adherence: [], lifts: [], vo2max: [], whoopAge: [], swimPace: [], runPace: [], bikeWatts: [] });
  });

  it("keeps the weekly metric row for a partly shown first week", async () => {
    // 4w from 2026-10-21 starts 2026-09-24 (Thu); that week's Monday is 2026-09-21.
    await db.insert(weeklyMetrics).values({ weekStart: "2026-09-21", vo2max: 48, whoopAge: null });
    const p = await getTrainingProgress(db, NOW, TZ, "4w");
    expect(p.vo2max).toEqual([{ date: "2026-09-21", value: 48 }]);
  });

  it("computes swim pace in seconds per 100 yd and skips entries without distance", async () => {
    await cardio("swim", "2026-10-20", 600, { distanceM: 500 * 0.9144 });
    await cardio("swim", "2026-10-19", 900);
    const p = await getTrainingProgress(db, NOW, TZ, "4w");
    expect(p.swimPace).toHaveLength(1);
    expect(p.swimPace[0].date).toBe("2026-10-20");
    expect(p.swimPace[0].value).toBeCloseTo(120, 6);
  });

  it("computes run pace per mile and bike watts", async () => {
    await cardio("run", "2026-10-20", 1800, { distanceM: 1609.344 * 3 });
    await cardio("bike", "2026-10-20", 3600, { avgWatts: 180 });
    await cardio("bike", "2026-10-19", 3600);
    const p = await getTrainingProgress(db, NOW, TZ, "4w");
    expect(p.runPace[0].value).toBeCloseTo(600, 6);
    expect(p.bikeWatts).toEqual([{ date: "2026-10-20", value: 180 }]);
  });

  it("limits every series to the range and includes archived exercises", async () => {
    await cardio("bike", "2026-09-07", 3600, { avgWatts: 150 });
    await db.insert(weeklyMetrics).values([
      { weekStart: "2026-09-07", vo2max: 50, whoopAge: 30 },
      { weekStart: "2026-10-19", vo2max: 52, whoopAge: null },
    ]);
    const [ex] = await db.insert(exercises).values({ name: "Old Lift", category: "strength", archived: true }).returning();
    const [oldS] = await db.insert(strengthSessions).values({ startedAt: new Date("2026-09-07T12:00:00Z"), localDate: "2026-09-07" }).returning();
    const [newS] = await db.insert(strengthSessions).values({ startedAt: new Date("2026-10-20T12:00:00Z"), localDate: "2026-10-20" }).returning();
    await db.insert(strengthSets).values([
      { clientId: crypto.randomUUID(), sessionId: oldS.id, exerciseId: ex.id, setIndex: 0, reps: 5, weightLb: 90, completedAt: new Date("2026-09-07T12:05:00Z") },
      { clientId: crypto.randomUUID(), sessionId: newS.id, exerciseId: ex.id, setIndex: 0, reps: 5, weightLb: 100, completedAt: new Date("2026-10-20T12:05:00Z") },
    ]);
    const p = await getTrainingProgress(db, NOW, TZ, "4w");
    expect(p.bikeWatts).toEqual([]);
    expect(p.vo2max).toEqual([{ date: "2026-10-19", value: 52 }]);
    expect(p.whoopAge).toEqual([]);
    expect(p.lifts).toHaveLength(1);
    expect(p.lifts[0].name).toBe("Old Lift");
    expect(p.lifts[0].weekly).toEqual([{ weekStart: "2026-10-19", topWeightLb: 100, topReps: 5, sets: 1 }]);
    const wide = await getTrainingProgress(db, NOW, TZ, "2m");
    expect(wide.vo2max).toHaveLength(2);
    expect(wide.lifts[0].weekly).toHaveLength(2);
  });

  it("summarises adherence from past non-rest rows in range", async () => {
    const row = (localDate: string, slot: number, kind: "run" | "rest", status: "planned" | "done") => ({
      localDate, slot, kind, title: "t", durationMin: 30, intensity: "easy" as const, details: {}, ruleIds: [], weekStart: "2026-10-19", status,
    });
    await db.insert(plannedSessions).values([
      row("2026-10-19", 0, "run", "done"),
      row("2026-10-20", 0, "run", "planned"),
      row("2026-10-20", 1, "rest", "planned"),
      row("2026-10-21", 0, "run", "planned"),
    ]);
    const p = await getTrainingProgress(db, NOW, TZ, "4w");
    expect(p.adherence).toEqual([{ weekStart: "2026-10-19", planned: 2, done: 1, skipped: 0, missed: 1, pct: 50 }]);
  });
});
