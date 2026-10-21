import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { cycles, recoveries, sleeps, syncState, weightEntries, whoopConnection } from "@/db/schema";
import { getTodaySummary, unscoredLabel } from "./today";

const TZ = "America/Chicago";
const DAY = 24 * 60 * 60_000;

let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.delete(recoveries);
  await db.delete(cycles);
  await db.delete(sleeps);
  await db.delete(syncState);
  await db.delete(whoopConnection);
  await db.delete(weightEntries);
});

// The connection row stores encrypted blobs; getTodaySummary only reads status.
const connect = (status: "connected" | "needs_reconnect" = "connected") =>
  db.insert(whoopConnection).values({
    id: 1,
    whoopUserId: 1,
    accessTokenEnc: "x",
    refreshTokenEnc: "x",
    expiresAt: new Date("2030-01-01T00:00:00Z"),
    scope: "offline",
    status,
  });

async function seedCycle(
  id: number,
  start: Date,
  rec: { state: string; score: number | null; hrv?: number | null; rhr?: number | null },
) {
  await db.insert(cycles).values({
    id,
    start,
    end: null,
    timezoneOffset: "-06:00",
    scoreState: rec.state,
    strain: rec.state === "SCORED" ? 10 + id : null,
  });
  await db.insert(recoveries).values({
    cycleId: id,
    sleepId: `s${id}`,
    scoreState: rec.state,
    recoveryScore: rec.score,
    hrvRmssdMs: rec.state === "SCORED" ? (rec.hrv ?? 50) : null,
    rhr: rec.state === "SCORED" ? (rec.rhr ?? 55) : null,
  });
}

async function seedSleep(id: string, end: Date, nap: boolean, asleepMin = 420) {
  await db.insert(sleeps).values({
    id,
    start: new Date(end.getTime() - 8 * 3_600_000),
    end,
    timezoneOffset: "-06:00",
    nap,
    scoreState: "SCORED",
    asleepMin,
    needBaselineMin: 450,
    needDebtMin: 20,
    needStrainMin: 10,
    needNapMin: -10,
  });
}

describe("getTodaySummary", () => {
  it("uses the latest cycle's recovery and averages the last 7 scored values", async () => {
    await connect();
    const now = new Date("2026-10-20T13:00:00Z");
    // 8 scored days plus one pending day, oldest first. The pending one is skipped,
    // so avg7 covers the newest 7 scored values and leaves out the oldest (10).
    const scores = [10, 20, 30, null, 50, 60, 70, 80, 90];
    for (let i = 0; i < scores.length; i++) {
      const start = new Date(now.getTime() - (scores.length - i) * DAY);
      const s = scores[i];
      await seedCycle(100 + i, start, s === null ? { state: "PENDING_SCORE", score: null } : { state: "SCORED", score: s });
    }
    const t = await getTodaySummary(db, now, TZ);
    expect(t.connection).toBe("connected");
    expect(t.recovery?.score).toBe(90);
    expect(t.recovery?.state).toBe("SCORED");
    // last 7 scored: 90, 80, 70, 60, 50, 30, 20 (pending skipped, 10 is 8th)
    expect(t.recovery?.avg7).toBeCloseTo((90 + 80 + 70 + 60 + 50 + 30 + 20) / 7);
    expect(t.dayStrain).toBe(118);
  });

  it("shows a pending latest recovery as null with its state", async () => {
    await connect();
    const now = new Date("2026-10-20T13:00:00Z");
    await seedCycle(1, new Date(now.getTime() - 2 * DAY), { state: "SCORED", score: 60 });
    await seedCycle(2, new Date(now.getTime() - 6 * 3_600_000), { state: "PENDING_SCORE", score: null });
    const t = await getTodaySummary(db, now, TZ);
    expect(t.recovery).toEqual({ score: null, state: "PENDING_SCORE", avg7: 60 });
    expect(t.hrv?.ms).toBeNull();
    expect(t.rhr).toBeNull();
    expect(t.dayStrain).toBeNull();
  });

  it("picks the most recent main sleep in Chicago time, excluding naps", async () => {
    await connect();
    // US DST ended 2026-11-01, so these are CST (UTC-6).
    const now = new Date("2026-11-03T07:00:00-06:00");
    await seedSleep("main-1102", new Date("2026-11-02T06:10:00-06:00"), false, 400);
    await seedSleep("main-1103", new Date("2026-11-03T05:50:00-06:00"), false, 430);
    await seedSleep("nap-1102", new Date("2026-11-02T13:00:00-06:00"), true, 30);
    // The cycle that started the evening before counts as today.
    await seedCycle(7, new Date("2026-11-02T22:30:00-06:00"), { state: "SCORED", score: 77 });
    const t = await getTodaySummary(db, now, TZ);
    expect(t.sleep?.endedAt.toISOString()).toBe(new Date("2026-11-03T05:50:00-06:00").toISOString());
    expect(t.sleep?.asleepMin).toBe(430);
    expect(t.sleep?.needMin).toBe(470);
    expect(t.recovery?.score).toBe(77);
  });

  it("still excludes a nap that ends after the main sleep", async () => {
    await connect();
    const now = new Date("2026-11-03T07:00:00-06:00");
    await seedSleep("main-1103", new Date("2026-11-03T05:50:00-06:00"), false, 430);
    await seedSleep("nap-1103", new Date("2026-11-03T06:30:00-06:00"), true, 30);
    const t = await getTodaySummary(db, now, TZ);
    expect(t.sleep?.endedAt.toISOString()).toBe(new Date("2026-11-03T05:50:00-06:00").toISOString());
    expect(t.sleep?.asleepMin).toBe(430);
  });

  it("shows the latest cycle as pending when it has no recovery row yet", async () => {
    await connect();
    const now = new Date("2026-10-20T13:00:00Z");
    await seedCycle(1, new Date(now.getTime() - 1 * DAY), { state: "SCORED", score: 64, hrv: 70, rhr: 50 });
    // The newest cycle started at sleep onset; its recovery hasn't arrived.
    await db.insert(cycles).values({
      id: 2,
      start: new Date(now.getTime() - 8 * 3_600_000),
      end: null,
      timezoneOffset: "-05:00",
      scoreState: "SCORED",
      strain: 4.2,
    });
    const t = await getTodaySummary(db, now, TZ);
    expect(t.recovery).toEqual({ score: null, state: "PENDING_SCORE", avg7: 64 });
    expect(t.rhr).toBeNull();
    expect(t.hrv).toEqual({ ms: null, avg30: 70 });
    expect(t.dayStrain).toBe(4.2);
  });

  it("averages HRV over scored recoveries from the last 30 days", async () => {
    await connect();
    const now = new Date("2026-10-20T13:00:00Z");
    await seedCycle(1, new Date(now.getTime() - 40 * DAY), { state: "SCORED", score: 50, hrv: 1000 });
    await seedCycle(2, new Date(now.getTime() - 10 * DAY), { state: "SCORED", score: 50, hrv: 40 });
    await seedCycle(3, new Date(now.getTime() - 1 * DAY), { state: "SCORED", score: 50, hrv: 60, rhr: 48 });
    const t = await getTodaySummary(db, now, TZ);
    expect(t.hrv).toEqual({ ms: 60, avg30: 50 });
    expect(t.rhr).toBe(48);
  });

  it("gives connection 'none' with no connection row", async () => {
    const t = await getTodaySummary(db, new Date("2026-10-20T13:00:00Z"), TZ);
    expect(t).toEqual({
      connection: "none",
      recovery: null,
      hrv: null,
      rhr: null,
      sleep: null,
      dayStrain: null,
      lastSyncedAt: null,
      weight: { latest: null, avg7: null, avg7Prev: null },
    });
  });

  it("includes the weight trend", async () => {
    await db.insert(weightEntries).values([
      { localDate: "2026-10-20", weightLb: 165.2 },
      { localDate: "2026-10-12", weightLb: 164.8 },
    ]);
    const t = await getTodaySummary(db, new Date("2026-10-20T13:00:00Z"), TZ);
    expect(t.weight).toEqual({ latest: { date: "2026-10-20", lb: 165.2 }, avg7: 165.2, avg7Prev: 164.8 });
  });

  it("reports needs_reconnect and the last sync time", async () => {
    await connect("needs_reconnect");
    const at = new Date("2026-10-20T12:30:00Z");
    await db.insert(syncState).values({ key: "whoop", lastSyncedAt: at });
    const t = await getTodaySummary(db, new Date("2026-10-20T13:00:00Z"), TZ);
    expect(t.connection).toBe("needs_reconnect");
    expect(t.lastSyncedAt?.toISOString()).toBe(at.toISOString());
  });

  it("gives needMin null when any need field is null", async () => {
    await connect();
    await db.insert(sleeps).values({
      id: "x",
      start: new Date("2026-10-19T22:00:00-05:00"),
      end: new Date("2026-10-20T06:00:00-05:00"),
      timezoneOffset: "-05:00",
      nap: false,
      scoreState: "PENDING_SCORE",
    });
    const t = await getTodaySummary(db, new Date("2026-10-20T13:00:00Z"), TZ);
    expect(t.sleep).toEqual({ asleepMin: null, needMin: null, endedAt: new Date("2026-10-20T06:00:00-05:00") });
  });
});

describe("startOfLocalDay", () => {
  it("returns local midnight, including on the DST change day", async () => {
    const { startOfLocalDay } = await import("./today");
    expect(startOfLocalDay(new Date("2026-11-03T07:00:00-06:00"), TZ).toISOString()).toBe("2026-11-03T06:00:00.000Z");
    // 2026-11-01 starts in CDT (UTC-5) and ends in CST.
    expect(startOfLocalDay(new Date("2026-11-01T20:00:00-06:00"), TZ).toISOString()).toBe("2026-11-01T05:00:00.000Z");
  });
});

describe("unscoredLabel", () => {
  it("says Not scored for UNSCORABLE and Pending otherwise", () => {
    expect(unscoredLabel("UNSCORABLE")).toBe("Not scored");
    expect(unscoredLabel("PENDING_SCORE")).toBe("Pending");
    expect(unscoredLabel(undefined)).toBe("Pending");
  });
});
