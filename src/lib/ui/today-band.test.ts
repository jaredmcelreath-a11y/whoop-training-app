import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { cycles, recoveries } from "@/db/schema";
import { getTodayBand } from "./today-band";

const NOW = new Date("2026-03-05T15:00:00Z");
let db: Db;
let nextId = 1;

beforeAll(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.delete(recoveries);
  await db.delete(cycles);
});

async function cycle(start: string, score: number | null, state = "SCORED") {
  const id = nextId++;
  await db.insert(cycles).values({ id, start: new Date(start), timezoneOffset: "-06:00", scoreState: "PENDING_SCORE" });
  await db.insert(recoveries).values({ cycleId: id, sleepId: `s${id}`, scoreState: state, recoveryScore: score });
}

describe("getTodayBand", () => {
  it("is null with no recovery data", async () => {
    expect(await getTodayBand(db, NOW)).toBeNull();
  });

  it("follows the latest cycle's scored recovery", async () => {
    await cycle("2026-03-04T04:00:00Z", 30);
    await cycle("2026-03-05T05:00:00Z", 70);
    expect(await getTodayBand(db, NOW)).toBe("good");
  });

  it("is caution for a mid score", async () => {
    await cycle("2026-03-05T05:00:00Z", 40);
    expect(await getTodayBand(db, NOW)).toBe("caution");
  });

  it("is null while the latest recovery is still pending", async () => {
    await cycle("2026-03-04T04:00:00Z", 80);
    await cycle("2026-03-05T05:00:00Z", null, "PENDING_SCORE");
    expect(await getTodayBand(db, NOW)).toBeNull();
  });

  it("ignores a recovery older than 36 h", async () => {
    await cycle("2026-03-02T05:00:00Z", 80);
    expect(await getTodayBand(db, NOW)).toBeNull();
  });
});
