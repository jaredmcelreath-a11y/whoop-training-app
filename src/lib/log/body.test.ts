import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { weeklyMetrics, weightEntries } from "@/db/schema";
import { getWeekly, getWeightTrend, upsertWeekly, upsertWeight } from "./body";

const TZ = "America/Chicago";
const DAY = 24 * 60 * 60_000;

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.delete(weightEntries);
  await db.delete(weeklyMetrics);
});

describe("upsertWeight", () => {
  it("keeps one row per Chicago day, holding the latest weigh-in", async () => {
    await upsertWeight(db, new Date("2026-10-20T08:00:00-05:00"), TZ, 166.4);
    await upsertWeight(db, new Date("2026-10-20T21:00:00-05:00"), TZ, 165.2);
    const rows = await db.select().from(weightEntries);
    expect(rows).toHaveLength(1);
    expect(rows[0].localDate).toBe("2026-10-20");
    expect(rows[0].weightLb).toBe(165.2);
  });

  it("files an 11:30 pm Chicago entry under that Chicago date, not the next UTC day", async () => {
    await upsertWeight(db, new Date("2026-10-20T23:30:00-05:00"), TZ, 165);
    const rows = await db.select().from(weightEntries);
    expect(rows.map((r) => r.localDate)).toEqual(["2026-10-20"]);
  });
});

describe("getWeightTrend", () => {
  it("averages the last 7 local days and the 7 days before that", async () => {
    const now = new Date("2026-10-20T12:00:00-05:00");
    // Day -k weighs 160 + k, for k = 0..9.
    for (let k = 0; k <= 9; k++) {
      await upsertWeight(db, new Date(now.getTime() - k * DAY), TZ, 160 + k);
    }
    const t = await getWeightTrend(db, now, TZ);
    expect(t.latest).toEqual({ date: "2026-10-20", lb: 160 });
    expect(t.avg7).toBe(163); // 160..166
    expect(t.avg7Prev).toBe(168); // 167..169
  });

  it("rounds averages to one decimal and reports an old latest entry", async () => {
    const now = new Date("2026-10-20T12:00:00-05:00");
    await upsertWeight(db, new Date(now.getTime() - 20 * DAY), TZ, 170);
    let t = await getWeightTrend(db, now, TZ);
    expect(t).toEqual({ latest: { date: "2026-09-30", lb: 170 }, avg7: null, avg7Prev: null });

    await upsertWeight(db, new Date(now.getTime() - 1 * DAY), TZ, 165);
    await upsertWeight(db, new Date(now.getTime() - 2 * DAY), TZ, 165.1);
    await upsertWeight(db, new Date(now.getTime() - 3 * DAY), TZ, 165.1);
    t = await getWeightTrend(db, now, TZ);
    expect(t.avg7).toBe(165.1); // 165.0667
  });

  it("returns nulls with no entries", async () => {
    const t = await getWeightTrend(db, new Date("2026-10-20T12:00:00-05:00"), TZ);
    expect(t).toEqual({ latest: null, avg7: null, avg7Prev: null });
  });
});

describe("upsertWeekly", () => {
  it("merges vo2max and whoopAge entered separately in the same week", async () => {
    await upsertWeekly(db, "2026-10-20", { vo2max: 48.5, whoopAge: null });
    await upsertWeekly(db, "2026-10-22", { vo2max: null, whoopAge: 31.2 });
    const rows = await db.select().from(weeklyMetrics);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ weekStart: "2026-10-19", vo2max: 48.5, whoopAge: 31.2 });
    expect(await getWeekly(db, "2026-10-25")).toEqual({ vo2max: 48.5, whoopAge: 31.2 });
    expect(await getWeekly(db, "2026-10-26")).toBeNull();
  });
});
