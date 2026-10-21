import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, and } from "drizzle-orm";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { cycles, recoveries, sleeps, syncState, whoopRaw, workouts } from "@/db/schema";
import cycleScored from "./fixtures/cycle-scored.json";
import cyclePending from "./fixtures/cycle-pending.json";
import recoveryScored from "./fixtures/recovery-scored.json";
import sleepScored from "./fixtures/sleep-scored.json";
import workoutScored from "./fixtures/workout-scored.json";
import body from "./fixtures/body.json";

vi.mock("./client", () => ({ whoopGet: vi.fn(), listAll: vi.fn() }));
import { listAll, whoopGet } from "./client";
import { deleteRecord, syncRange, syncRecent, upsertRecord } from "./sync";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  for (const t of [whoopRaw, cycles, recoveries, sleeps, workouts, syncState]) await db.delete(t);
  vi.mocked(listAll).mockReset();
  vi.mocked(whoopGet).mockReset();
});

const data: Record<string, unknown[]> = {
  "/cycle": [cycleScored],
  "/recovery": [recoveryScored],
  "/activity/sleep": [sleepScored],
  "/activity/workout": [workoutScored],
};
const mockLists = () =>
  vi.mocked(listAll).mockImplementation((async (_db: Db, path: string) => data[path] ?? []) as never);

describe("upsertRecord / deleteRecord", () => {
  it("upserting twice leaves one row with the new value", async () => {
    await upsertRecord(db, "cycle", cycleScored);
    await upsertRecord(db, "cycle", { ...cycleScored, score: { ...cycleScored.score, strain: 15.5 } });
    const rows = await db.select().from(cycles);
    expect(rows).toHaveLength(1);
    expect(rows[0].strain).toBe(15.5);
    const raw = await db.select().from(whoopRaw);
    expect(raw).toHaveLength(1);
    expect(raw[0]).toMatchObject({ resource: "cycle", id: "93845" });
  });

  it("stores PENDING_SCORE with null scores", async () => {
    await upsertRecord(db, "cycle", cyclePending);
    const [row] = await db.select().from(cycles);
    expect(row.scoreState).toBe("PENDING_SCORE");
    expect(row.strain).toBeNull();
  });

  it("delete of unknown id is a no-op; upsert after delete re-inserts", async () => {
    await expect(deleteRecord(db, "workout", "nope")).resolves.toBeUndefined();
    await expect(deleteRecord(db, "recovery", "nope")).resolves.toBeUndefined();
    await upsertRecord(db, "workout", workoutScored);
    await deleteRecord(db, "workout", workoutScored.id);
    expect(await db.select().from(workouts)).toHaveLength(0);
    expect(await db.select().from(whoopRaw)).toHaveLength(0);
    await upsertRecord(db, "workout", workoutScored);
    expect(await db.select().from(workouts)).toHaveLength(1);
  });

  it("deletes a recovery by sleep uuid, with its raw row", async () => {
    await upsertRecord(db, "recovery", recoveryScored);
    expect((await db.select().from(whoopRaw))[0].id).toBe("93845");
    await deleteRecord(db, "recovery", recoveryScored.sleep_id);
    expect(await db.select().from(recoveries)).toHaveLength(0);
    expect(await db.select().from(whoopRaw)).toHaveLength(0);
  });

  it("deletes a recovery by numeric cycle id", async () => {
    await upsertRecord(db, "recovery", recoveryScored);
    await deleteRecord(db, "recovery", "93845");
    expect(await db.select().from(recoveries)).toHaveLength(0);
    expect(await db.select().from(whoopRaw)).toHaveLength(0);
  });

  it("deletes sleep and its raw row", async () => {
    await upsertRecord(db, "sleep", sleepScored);
    await deleteRecord(db, "sleep", sleepScored.id);
    expect(await db.select().from(sleeps)).toHaveLength(0);
    expect(await db.select().from(whoopRaw)).toHaveLength(0);
  });
});

describe("syncRange", () => {
  it("fills tables and returns counts", async () => {
    mockLists();
    const start = new Date("2026-10-01T00:00:00Z");
    const end = new Date("2026-10-20T00:00:00Z");
    const res = await syncRange(db, start, end);
    expect(res).toEqual({ cycles: 1, recoveries: 1, sleeps: 1, workouts: 1 });
    expect(await db.select().from(cycles)).toHaveLength(1);
    expect(await db.select().from(recoveries)).toHaveLength(1);
    expect(await db.select().from(sleeps)).toHaveLength(1);
    expect(await db.select().from(workouts)).toHaveLength(1);
    expect(await db.select().from(whoopRaw)).toHaveLength(4);
    const paths = vi.mocked(listAll).mock.calls.map((c) => c[1]).sort();
    expect(paths).toEqual(["/activity/sleep", "/activity/workout", "/cycle", "/recovery"]);
    expect(vi.mocked(listAll).mock.calls[0][2]).toEqual({ start, end });
  });
});

describe("syncRecent", () => {
  it("syncs the window, stores body, sets sync_state", async () => {
    mockLists();
    vi.mocked(whoopGet).mockResolvedValue(body);
    const now = new Date("2026-10-20T12:00:00Z");
    await syncRecent(db, 7, () => now);
    const start = vi.mocked(listAll).mock.calls[0][2].start;
    expect(start).toEqual(new Date("2026-10-13T12:00:00Z"));
    expect(vi.mocked(whoopGet).mock.calls[0][1]).toBe("/user/measurement/body");
    const [raw] = await db.select().from(whoopRaw).where(and(eq(whoopRaw.resource, "body"), eq(whoopRaw.id, "current")));
    expect(raw.payload).toEqual(body);
    const [st] = await db.select().from(syncState).where(eq(syncState.key, "whoop"));
    expect(st.lastSyncedAt).toEqual(now);
  });
});
