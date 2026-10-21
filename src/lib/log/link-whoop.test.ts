import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { cardioEntries, strengthSessions, workouts } from "@/db/schema";
import { addCardio, recentCardio } from "./cardio";
import { findWhoopMatch, formatWhoop, relinkRecent } from "./link-whoop";
import { CardioInput } from "./validate";
import { finishSession, getSession, startSession } from "./strength";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.delete(cardioEntries);
  await db.delete(strengthSessions);
  await db.delete(workouts);
});

const at = (hhmm: string) => new Date(`2026-10-20T${hhmm}:00Z`);

async function workout(id: string, sport: string, s: string, e: string, extra = {}) {
  await db.insert(workouts).values({
    id,
    start: at(s),
    end: at(e),
    timezoneOffset: "-05:00",
    scoreState: "SCORED",
    sportName: sport,
    ...extra,
  });
}

describe("findWhoopMatch", () => {
  it("links a swim to a swimming workout around it", async () => {
    await workout("w1", "swimming", "06:58", "07:35");
    expect(await findWhoopMatch(db, "swim", at("07:00"), at("07:32"))).toBe("w1");
  });

  it("ignores other sports and workouts hours away", async () => {
    await workout("b", "basketball", "06:58", "07:35");
    await workout("late", "swimming", "10:00", "10:40");
    expect(await findWhoopMatch(db, "swim", at("07:00"), at("07:32"))).toBeNull();
  });

  it("accepts a generic activity", async () => {
    await workout("a", "activity", "07:00", "07:30");
    expect(await findWhoopMatch(db, "run", at("07:00"), at("07:30"))).toBe("a");
  });

  it("picks the greater overlap", async () => {
    await workout("small", "swimming", "07:25", "07:50");
    await workout("big", "swimming", "06:58", "07:20");
    expect(await findWhoopMatch(db, "swim", at("07:00"), at("07:32"))).toBe("big");
  });

  it("with zero overlap inside the window picks the nearest start", async () => {
    await workout("far", "running", "07:40", "07:48");
    await workout("near", "running", "07:25", "07:35");
    expect(await findWhoopMatch(db, "run", at("07:00"), at("07:20"))).toBe("near");
  });

  it("does not reuse a workout linked to another entry", async () => {
    await workout("w1", "swimming", "06:58", "07:35");
    await db.insert(cardioEntries).values({
      kind: "swim",
      startedAt: at("07:00"),
      localDate: "2026-10-20",
      durationS: 1920,
      indoor: true,
      whoopWorkoutId: "w1",
    });
    expect(await findWhoopMatch(db, "swim", at("07:00"), at("07:32"))).toBeNull();
  });
});

describe("relinkRecent", () => {
  it("links an entry created before its workout synced, and reports 1", async () => {
    const { id } = await addCardio(
      db,
      CardioInput.parse({
        kind: "swim",
        startedAt: "2026-10-20T07:00:00Z",
        durationMin: 32,
        distance: 1500,
        unit: "yd",
        avgWatts: null,
        inclinePct: null,
        poolLength: null,
        indoor: true,
        notes: "",
      }),
      "America/Chicago",
    );
    const [before] = await db.select().from(cardioEntries).where(eq(cardioEntries.id, id));
    expect(before.whoopWorkoutId).toBeNull();
    await workout("w1", "swimming", "06:58", "07:35", { strain: 9.44, avgHr: 142 });
    expect(await relinkRecent(db, at("00:00"))).toBe(1);
    expect(await relinkRecent(db, at("00:00"))).toBe(0);
    const [row] = await recentCardio(db, 5);
    expect(row.whoopWorkoutId).toBe("w1");
    expect(row.whoop && formatWhoop(row.whoop)).toBe("WHOOP: strain 9.4 · avg HR 142 · 37 min");
  });

  it("links finished strength sessions only, and finishSession links directly", async () => {
    await workout("w1", "weightlifting", "17:00", "17:50");
    const { id } = await startSession(db, at("17:02"), "America/Chicago");
    expect(await relinkRecent(db, at("00:00"))).toBe(0);
    await finishSession(db, id, at("17:48"));
    expect((await getSession(db, id))?.whoop).toMatchObject({ start: at("17:00") });
  });
});
