import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { cardioEntries, strengthSessions, workouts } from "@/db/schema";
import { actualWorkouts } from "./day-view";

const TZ = "America/Chicago";
const DATE = "2026-03-05"; // CST, UTC-6
let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.delete(cardioEntries);
  await db.delete(strengthSessions);
  await db.delete(workouts);
});

function whoop(id: string, sport: string, startUtc: string, min: number) {
  const start = new Date(startUtc);
  return db.insert(workouts).values({
    id,
    start,
    end: new Date(start.getTime() + min * 60_000),
    timezoneOffset: "-06:00",
    sportName: sport,
    scoreState: "SCORED",
  });
}

describe("actualWorkouts", () => {
  it("lists app entries and unlinked WHOOP workouts at their local start, once each", async () => {
    await whoop("w-run", "running", "2026-03-05T23:40:00Z", 35); // 17:40 local, linked below
    await whoop("w-lift", "weightlifting", "2026-03-06T00:30:00Z", 50); // 18:30 local
    await whoop("w-walk", "activity", "2026-03-05T15:00:00Z", 20); // generic: ignored
    await whoop("w-other-day", "cycling", "2026-03-04T15:00:00Z", 60);
    await db.insert(cardioEntries).values({
      kind: "run",
      startedAt: new Date("2026-03-05T23:40:00Z"),
      localDate: DATE,
      durationS: 35 * 60,
      whoopWorkoutId: "w-run",
    });
    await db.insert(strengthSessions).values({
      startedAt: new Date("2026-03-05T13:00:00Z"),
      endedAt: new Date("2026-03-05T13:50:00Z"),
      localDate: DATE,
    });
    await db.insert(strengthSessions).values({ startedAt: new Date("2026-03-05T20:00:00Z"), localDate: DATE }); // unfinished

    const got = await actualWorkouts(db, DATE, TZ);
    expect(got).toEqual([
      { startHHMM: "07:00", sport: "strength", title: "Strength", durationMin: 50, source: "app" },
      { startHHMM: "17:40", sport: "run", title: "Run", durationMin: 35, source: "app" },
      { startHHMM: "18:30", sport: "strength", title: "weightlifting", durationMin: 50, source: "whoop" },
    ]);
  });

  it("drops a WHOOP workout that overlaps an unlinked app entry of the same kind", async () => {
    await db.insert(strengthSessions).values({
      startedAt: new Date("2026-03-05T23:00:00Z"),
      endedAt: new Date("2026-03-05T23:50:00Z"),
      localDate: DATE,
    });
    await whoop("w-lift-dup", "weightlifting", "2026-03-05T23:05:00Z", 40); // same lift, not linked
    const got = await actualWorkouts(db, DATE, TZ);
    expect(got.map((w) => w.source)).toEqual(["app"]);
  });

  it("is empty with nothing recorded", async () => {
    expect(await actualWorkouts(db, DATE, TZ)).toEqual([]);
  });
});
