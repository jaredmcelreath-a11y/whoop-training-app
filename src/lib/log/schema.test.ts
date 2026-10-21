import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db/client";
import { exercises, strengthSessions, strengthSets } from "@/db/schema";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

async function seed() {
  const [ex] = await db
    .insert(exercises)
    .values({ name: `Squat ${crypto.randomUUID()}`, category: "strength" })
    .returning();
  const [s] = await db
    .insert(strengthSessions)
    .values({ startedAt: new Date(), localDate: "2026-10-20" })
    .returning();
  await db.insert(strengthSets).values([0, 1].map((i) => ({
    clientId: crypto.randomUUID(),
    sessionId: s.id,
    exerciseId: ex.id,
    setIndex: i,
    reps: 5,
    weightLb: 135,
    completedAt: new Date(),
  })));
  return { ex, s };
}

describe("log schema", () => {
  it("cascades set deletion with the session", async () => {
    const { s } = await seed();
    await db.delete(strengthSessions).where(eq(strengthSessions.id, s.id));
    const left = await db.select().from(strengthSets).where(eq(strengthSets.sessionId, s.id));
    expect(left).toHaveLength(0);
  });

  it("refuses to delete an exercise that has sets", async () => {
    const { ex } = await seed();
    await expect(db.delete(exercises).where(eq(exercises.id, ex.id))).rejects.toThrow();
  });
});
