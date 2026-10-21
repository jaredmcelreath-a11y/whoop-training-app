import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./test-db";
import { webhookEvents, workouts } from "./schema";

describe("schema", () => {
  it("round-trips a workout row", async () => {
    const db = await createTestDb();
    const row = {
      id: "11111111-2222-3333-4444-555555555555",
      start: new Date("2026-10-19T12:00:00Z"),
      end: new Date("2026-10-19T13:00:00Z"),
      timezoneOffset: "-05:00",
      sportName: "running",
      sportId: 0,
      scoreState: "SCORED",
      strain: 12.5,
      avgHr: 140,
      maxHr: 170,
      kilojoule: 2000,
      kcal: 478,
      distanceM: 8000,
      altitudeGainM: 20,
      zoneMs: { z0: 1, z1: 2, z2: 3, z3: 4, z4: 5, z5: 6 },
    };
    await db.insert(workouts).values(row);
    const [got] = await db.select().from(workouts).where(eq(workouts.id, row.id));
    expect(got).toEqual(row);
  });

  it("dedupes webhook events by trace_id", async () => {
    const db = await createTestDb();
    const ev = {
      traceId: "t1",
      type: "recovery.updated",
      objectId: "abc",
      userId: 1,
      receivedAt: new Date(),
    };
    await db.insert(webhookEvents).values(ev).onConflictDoNothing();
    await db.insert(webhookEvents).values(ev).onConflictDoNothing();
    expect(await db.select().from(webhookEvents)).toHaveLength(1);
  });
});
