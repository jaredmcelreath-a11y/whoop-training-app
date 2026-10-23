import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { cardioEntries, workouts } from "@/db/schema";
import { dismissWorkout, unlinkedWhoopCardio, weeklyBoxOpen, whoopPrefill } from "./log-boxes";

describe("weeklyBoxOpen", () => {
  // 2026-03-02 is a Monday; 03-03 Tuesday; 03-04 Wednesday; 03-08 Sunday.
  it("is open when nothing is saved this week", () => {
    expect(weeklyBoxOpen(null, "2026-03-04")).toBe(true);
  });
  it("reopens on Tuesday and Sunday until a value is saved that day", () => {
    expect(weeklyBoxOpen({ updatedLocalDate: "2026-03-02" }, "2026-03-03")).toBe(true);
    expect(weeklyBoxOpen({ updatedLocalDate: "2026-03-03" }, "2026-03-03")).toBe(false);
    expect(weeklyBoxOpen({ updatedLocalDate: "2026-03-03" }, "2026-03-08")).toBe(true);
  });
  it("stays collapsed on other days once saved", () => {
    expect(weeklyBoxOpen({ updatedLocalDate: "2026-03-03" }, "2026-03-04")).toBe(false);
  });
});

describe("unlinkedWhoopCardio", () => {
  const NOW = new Date("2026-03-08T18:00:00Z");
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
  });
  afterEach(async () => {
    await db.delete(cardioEntries);
    await db.delete(workouts);
  });
  const w = (id: string, sport: string, start: string, min = 30) =>
    db.insert(workouts).values({
      id,
      start: new Date(start),
      end: new Date(new Date(start).getTime() + min * 60_000),
      timezoneOffset: "-06:00",
      sportName: sport,
      scoreState: "SCORED",
    });

  it("lists recent swim, bike and run workouts that have no app entry, newest first", async () => {
    await w("swim", "swimming", "2026-03-08T13:00:00Z", 40);
    await w("run-linked", "running", "2026-03-07T13:00:00Z");
    await w("walk", "walking", "2026-03-07T15:00:00Z");
    await w("old", "cycling", "2026-02-20T13:00:00Z");
    await db.insert(cardioEntries).values({
      kind: "run",
      startedAt: new Date("2026-03-07T13:00:00Z"),
      localDate: "2026-03-07",
      durationS: 1800,
      whoopWorkoutId: "run-linked",
    });
    const got = await unlinkedWhoopCardio(db, NOW);
    expect(got.map((x) => [x.id, x.kind, x.durationMin])).toEqual([["swim", "swim", 40]]);
  });

  it("leaves out a workout marked as not a real one, and dismissing twice is fine", async () => {
    await w("fake-run", "running", "2026-03-07T15:00:00Z");
    await w("real-swim", "swimming", "2026-03-07T12:00:00Z");
    await dismissWorkout(db, "fake-run");
    await dismissWorkout(db, "fake-run");
    expect((await unlinkedWhoopCardio(db, NOW)).map((x) => x.id)).toEqual(["real-swim"]);
  });
});

describe("whoopPrefill", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
  });
  it("gives the start and minutes of a WHOOP workout, and null for an unknown id", async () => {
    await db.insert(workouts).values({
      id: "w1",
      start: new Date("2026-03-08T13:00:00Z"),
      end: new Date("2026-03-08T13:40:00Z"),
      timezoneOffset: "-06:00",
      sportName: "swimming",
      scoreState: "SCORED",
    });
    expect(await whoopPrefill(db, "w1")).toEqual({ start: new Date("2026-03-08T13:00:00Z"), durationMin: 40 });
    expect(await whoopPrefill(db, "nope")).toBeNull();
    expect(await whoopPrefill(db, undefined)).toBeNull();
  });
});
