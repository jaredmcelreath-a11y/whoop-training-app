import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { exercises, strengthSessions, strengthSets } from "@/db/schema";
import { getLogHub, pickTodayLift } from "./hub";
import { addSet, createExercise, finishSession, startSession } from "./strength";

const TZ = "America/Chicago";
const NOW = new Date("2026-03-05T15:00:00Z"); // 09:00 local
let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.delete(strengthSets);
  await db.delete(strengthSessions);
  await db.delete(exercises);
});

describe("getLogHub", () => {
  it("is empty with nothing logged or planned", async () => {
    expect(await getLogHub(db, NOW, TZ)).toEqual({ active: null });
  });

  it("reports today's unfinished strength session and its set count", async () => {
    const ex = await createExercise(db, "Invented Press", "strength");
    const s = await startSession(db, new Date("2026-03-05T14:30:00Z"), TZ);
    await addSet(db, { clientId: crypto.randomUUID(), exerciseId: ex.id, setIndex: 0, reps: 10, weightLb: 50, sessionId: s.id, at: NOW });
    const hub = await getLogHub(db, NOW, TZ);
    expect(hub.active).toEqual({ id: s.id, startedAt: new Date("2026-03-05T14:30:00Z"), setCount: 1, lastExercise: "Invented Press" });
  });

  it("ignores finished sessions and sessions from other days", async () => {
    const done = await startSession(db, new Date("2026-03-05T13:00:00Z"), TZ);
    await finishSession(db, done.id, new Date("2026-03-05T14:00:00Z"));
    await startSession(db, new Date("2026-03-04T15:00:00Z"), TZ);
    expect((await getLogHub(db, NOW, TZ)).active).toBeNull();
  });

  it("names the exercise of the latest set in an open session", async () => {
    const ex = await createExercise(db, "Invented Row", "strength");
    const s = await startSession(db, new Date("2026-03-05T14:30:00Z"), TZ);
    await addSet(db, { clientId: crypto.randomUUID(), exerciseId: ex.id, setIndex: 0, reps: 8, weightLb: 40, sessionId: s.id, at: NOW });
    expect((await getLogHub(db, NOW, TZ)).active?.lastExercise).toBe("Invented Row");
  });
});

describe("pickTodayLift (from today's adapted sessions)", () => {
  const s = (kind: string, title: string, status: "planned" | "done" | "skipped" = "planned") => ({ kind, title, durationMin: 45, status });

  it("is the first strength session still to do", () => {
    expect(pickTodayLift([s("run", "Easy run"), s("strength", "Upper A"), s("core", "Core")])).toEqual({ title: "Upper A", durationMin: 45 });
  });

  it("skips lifts already done or skipped", () => {
    expect(pickTodayLift([s("strength", "Upper A", "done"), s("core", "Core", "skipped")])).toBeNull();
  });

  it("is null when the day was adapted away from lifting", () => {
    expect(pickTodayLift([s("bike", "Easy spin"), s("rest", "Rest")])).toBeNull();
  });
});
