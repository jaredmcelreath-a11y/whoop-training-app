import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { exercises, strengthSessions, strengthSets } from "@/db/schema";
import {
  addSet,
  createExercise,
  deleteExercise,
  deleteSession,
  ensureDefaultExercises,
  finishSession,
  getSession,
  lastTime,
  listExercises,
  recentSessions,
  removeSet,
  startSession,
  startOrResumeSession,
  archiveExercise,
  unarchiveExercise,
} from "./strength";
import { DEFAULT_EXERCISES } from "./exercise-catalog";

const TZ = "America/Chicago";
let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.delete(strengthSets);
  await db.delete(strengthSessions);
  await db.delete(exercises);
});

async function logSets(sessionId: string, exerciseId: string, at: Date, n: number, w: number) {
  for (let i = 0; i < n; i++) {
    await addSet(db, {
      clientId: crypto.randomUUID(),
      exerciseId,
      setIndex: i,
      reps: 8,
      weightLb: w,
      sessionId,
      at: new Date(at.getTime() + i * 1000),
    });
  }
}

describe("addSet", () => {
  it("is idempotent on clientId (double-tap)", async () => {
    const ex = await createExercise(db, "Squat", "strength");
    const s = await startSession(db, new Date("2026-10-20T10:00:00Z"), TZ);
    const input = {
      clientId: crypto.randomUUID(),
      exerciseId: ex.id,
      setIndex: 0,
      reps: 8,
      weightLb: 130,
      sessionId: s.id,
      at: new Date("2026-10-20T10:05:00Z"),
    };
    expect(await addSet(db, input)).toBe("added");
    expect(await addSet(db, input)).toBe("duplicate");
    expect(await db.select().from(strengthSets)).toHaveLength(1);
  });
});

describe("lastTime", () => {
  it("returns the most recent other session's sets", async () => {
    const ex = await createExercise(db, "Squat", "strength");
    const a = await startSession(db, new Date("2026-10-10T10:00:00Z"), TZ);
    await logSets(a.id, ex.id, new Date("2026-10-10T10:01:00Z"), 3, 130);
    const b = await startSession(db, new Date("2026-10-13T10:00:00Z"), TZ);
    await logSets(b.id, ex.id, new Date("2026-10-13T10:01:00Z"), 3, 135);
    const c = await startSession(db, new Date("2026-10-20T10:00:00Z"), TZ);
    const res = await lastTime(db, ex.id, c.id);
    expect(res?.date).toBe("2026-10-13");
    expect(res?.sets).toEqual([
      { reps: 8, weightLb: 135 },
      { reps: 8, weightLb: 135 },
      { reps: 8, weightLb: 135 },
    ]);
  });

  it("returns null with no history, and ignores the current session", async () => {
    const ex = await createExercise(db, "Squat", "strength");
    const a = await startSession(db, new Date("2026-10-10T10:00:00Z"), TZ);
    await logSets(a.id, ex.id, new Date("2026-10-10T10:01:00Z"), 1, 130);
    expect(await lastTime(db, ex.id, a.id)).toBeNull();
  });
});

describe("deleteExercise", () => {
  it("refuses when sets exist, deletes when unused", async () => {
    const used = await createExercise(db, "Squat", "strength");
    const unused = await createExercise(db, "Plank", "core");
    const s = await startSession(db, new Date("2026-10-20T10:00:00Z"), TZ);
    await logSets(s.id, used.id, new Date("2026-10-20T10:01:00Z"), 1, 100);
    expect(await deleteExercise(db, used.id)).toBe("has_history");
    expect((await db.select().from(exercises)).map((e) => e.id)).toContain(used.id);
    expect(await deleteExercise(db, unused.id)).toBe("deleted");
    expect((await db.select().from(exercises)).map((e) => e.id)).not.toContain(unused.id);
  });
});

describe("sessions", () => {
  it("deleteSession removes its sets", async () => {
    const ex = await createExercise(db, "Squat", "strength");
    const s = await startSession(db, new Date("2026-10-20T10:00:00Z"), TZ);
    await logSets(s.id, ex.id, new Date("2026-10-20T10:01:00Z"), 3, 100);
    await deleteSession(db, s.id);
    expect(await db.select().from(strengthSets)).toHaveLength(0);
    expect(await getSession(db, s.id)).toBeNull();
  });

  it("files an 11:30 pm Chicago session under the Chicago date", async () => {
    const s = await startSession(db, new Date("2026-10-20T23:30:00-05:00"), TZ);
    const got = await getSession(db, s.id);
    expect(got?.session.localDate).toBe("2026-10-20");
  });

  it("getSession joins exercise names in first-appearance order; removeSet works", async () => {
    const sq = await createExercise(db, "Squat", "strength");
    const pl = await createExercise(db, "Plank", "core");
    const s = await startSession(db, new Date("2026-10-20T10:00:00Z"), TZ);
    await logSets(s.id, pl.id, new Date("2026-10-20T10:01:00Z"), 2, 0);
    await logSets(s.id, sq.id, new Date("2026-10-20T10:10:00Z"), 2, 100);
    const got = await getSession(db, s.id);
    expect(got?.sets.map((x) => `${x.exerciseName}${x.setIndex}`)).toEqual([
      "Plank0",
      "Plank1",
      "Squat0",
      "Squat1",
    ]);
    await removeSet(db, got!.sets[0].id);
    expect((await getSession(db, s.id))?.sets).toHaveLength(3);
  });

  it("recentSessions counts exercises and sets, newest first, with finished state", async () => {
    const sq = await createExercise(db, "Squat", "strength");
    const pl = await createExercise(db, "Plank", "core");
    const a = await startSession(db, new Date("2026-10-10T10:00:00Z"), TZ);
    await logSets(a.id, sq.id, new Date("2026-10-10T10:01:00Z"), 3, 100);
    await finishSession(db, a.id, new Date("2026-10-10T11:00:00Z"));
    const b = await startSession(db, new Date("2026-10-13T10:00:00Z"), TZ);
    await logSets(b.id, sq.id, new Date("2026-10-13T10:01:00Z"), 2, 100);
    await logSets(b.id, pl.id, new Date("2026-10-13T10:10:00Z"), 1, 0);
    const rows = await recentSessions(db, 10);
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
    expect(rows[0]).toMatchObject({ exerciseCount: 2, setCount: 3, finished: false });
    expect(rows[1]).toMatchObject({ exerciseCount: 1, setCount: 3, finished: true, localDate: "2026-10-10" });
  });
});

describe("exercises", () => {
  it("createExercise returns the existing row case-insensitively after trimming", async () => {
    const a = await createExercise(db, "Leg Press", "strength");
    const b = await createExercise(db, "  leg press ", "strength");
    expect(b.id).toBe(a.id);
    expect(await db.select().from(exercises)).toHaveLength(1);
  });

  it("ensureDefaultExercises is idempotent", async () => {
    await ensureDefaultExercises(db);
    const n = (await db.select().from(exercises)).length;
    expect(n).toBe(DEFAULT_EXERCISES.length);
    await ensureDefaultExercises(db);
    expect(await db.select().from(exercises)).toHaveLength(n);
  });

  it("listExercises orders by recent use then name, and hides archived", async () => {
    const a = await createExercise(db, "Alpha", "strength");
    const b = await createExercise(db, "Bravo", "strength");
    await createExercise(db, "Charlie", "strength");
    const z = await createExercise(db, "Zulu", "strength");
    const s = await startSession(db, new Date("2026-10-20T10:00:00Z"), TZ);
    await logSets(s.id, b.id, new Date("2026-10-20T10:01:00Z"), 1, 1);
    await logSets(s.id, a.id, new Date("2026-10-20T10:20:00Z"), 1, 1);
    await archiveExercise(db, z.id);
    expect((await listExercises(db, {})).map((e) => e.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect((await listExercises(db, { includeArchived: true })).map((e) => e.name)).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
      "Zulu",
    ]);
  });
});

describe("unarchiveExercise", () => {
  it("brings an archived exercise back into the list", async () => {
    const ex = await createExercise(db, "Hack Squat", "strength");
    await archiveExercise(db, ex.id);
    expect((await listExercises(db)).map((e) => e.id)).not.toContain(ex.id);
    const again = await createExercise(db, "hack squat", "strength");
    expect(again.id).toBe(ex.id);
    expect(again.archived).toBe(true);
    await unarchiveExercise(db, ex.id);
    const listed = await listExercises(db);
    expect(listed.find((e) => e.id === ex.id)?.archived).toBe(false);
  });
});

describe("startOrResumeSession", () => {
  const at = new Date("2026-10-20T15:00:00Z"); // 10:00 in Chicago

  it("reuses today's unfinished session", async () => {
    const s = await startSession(db, new Date("2026-10-20T14:00:00Z"), TZ);
    expect((await startOrResumeSession(db, at, TZ)).id).toBe(s.id);
    expect(await db.select().from(strengthSessions)).toHaveLength(1);
  });

  it("opens a new session when today's is finished or the open one is from another day", async () => {
    const done = await startSession(db, new Date("2026-10-20T13:00:00Z"), TZ);
    await finishSession(db, done.id, new Date("2026-10-20T14:00:00Z"));
    const yesterday = await startSession(db, new Date("2026-10-19T15:00:00Z"), TZ);
    const s = await startOrResumeSession(db, at, TZ);
    expect([done.id, yesterday.id]).not.toContain(s.id);
    expect(await db.select().from(strengthSessions)).toHaveLength(3);
  });

  it("two overlapping starts converge on one session", async () => {
    const [a, b] = await Promise.all([
      startOrResumeSession(db, at, TZ),
      startOrResumeSession(db, at, TZ),
    ]);
    expect(a.id).toBe(b.id);
    expect(await db.select().from(strengthSessions)).toHaveLength(1);
  });
});
