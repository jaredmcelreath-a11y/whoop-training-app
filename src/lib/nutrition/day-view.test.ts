import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { sleeps } from "@/db/schema";
import { latestSleepNeedMin, parseDateParam, sleepAnchorInputs, withDuringFluid } from "./day-view";

// All values below are invented test data.
const TZ = "America/Chicago";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await db.delete(sleeps);
});

async function seedSleep(
  id: string,
  endIso: string,
  need: { baseline: number | null; debt?: number | null; strain?: number | null; nap?: number | null },
  o: { nap?: boolean; scoreState?: string } = {},
) {
  const end = new Date(endIso);
  await db.insert(sleeps).values({
    id,
    start: new Date(end.getTime() - 8 * 3_600_000),
    end,
    timezoneOffset: "-05:00",
    nap: o.nap ?? false,
    scoreState: o.scoreState ?? "SCORED",
    needBaselineMin: need.baseline,
    needDebtMin: need.debt ?? null,
    needStrainMin: need.strain ?? null,
    needNapMin: need.nap ?? null,
  });
}

describe("latestSleepNeedMin", () => {
  it("is null with no sleeps", async () => {
    expect(await latestSleepNeedMin(db, "2026-10-21", TZ)).toBeNull();
  });

  it("uses the latest scored, non-nap sleep ending by the end of the date: baseline + debt + strain - nap", async () => {
    await seedSleep("a", "2026-10-20T12:00:00Z", { baseline: 400, debt: 10, strain: 5 });
    await seedSleep("b", "2026-10-21T12:00:00Z", { baseline: 450, debt: 20, strain: 15, nap: -30 });
    await seedSleep("nap", "2026-10-21T20:00:00Z", { baseline: 999 }, { nap: true });
    await seedSleep("unscored", "2026-10-21T22:00:00Z", { baseline: 999 }, { scoreState: "PENDING_SCORE" });
    await seedSleep("later", "2026-10-22T12:00:00Z", { baseline: 999 });
    // WHOOP reports the nap credit as a negative number: it always reduces the need.
    expect(await latestSleepNeedMin(db, "2026-10-21", TZ)).toBe(450 + 20 + 15 - 30);
    // A positive nap value is treated as the same reduction.
    await db.delete(sleeps);
    await seedSleep("c", "2026-10-21T12:00:00Z", { baseline: 450, nap: 30 });
    expect(await latestSleepNeedMin(db, "2026-10-21", TZ)).toBe(420);
  });

  it("is null when the latest sleep has no baseline need", async () => {
    await seedSleep("a", "2026-10-21T12:00:00Z", { baseline: null, debt: 10 });
    expect(await latestSleepNeedMin(db, "2026-10-21", TZ)).toBeNull();
  });
});

describe("parseDateParam", () => {
  it("accepts a real YYYY-MM-DD and falls back to today otherwise", () => {
    expect(parseDateParam("2026-10-25", "2026-10-21")).toBe("2026-10-25");
    expect(parseDateParam(["2026-10-25", "x"], "2026-10-21")).toBe("2026-10-25");
    expect(parseDateParam("2026-02-30", "2026-10-21")).toBe("2026-10-21");
    expect(parseDateParam("tomorrow", "2026-10-21")).toBe("2026-10-21");
    expect(parseDateParam(undefined, "2026-10-21")).toBe("2026-10-21");
  });
});

describe("withDuringFluid", () => {
  const s = (title: string) => ({ title, kind: "run", durationMin: 60, intensity: "z2" });
  it("adds each session's during-session fluid by title, in order", () => {
    const out = withDuringFluid([s("Easy run"), s("Lift"), s("Easy run")], [
      { title: "Easy run", ml: 500 },
      { title: "Easy run", ml: 300 },
    ]);
    expect(out.map((x) => x.duringMl)).toEqual([500, undefined, 300]);
  });
  it("leaves sessions alone when there is nothing to drink", () => {
    expect(withDuringFluid([s("Swim")], [])).toEqual([s("Swim")]);
  });
});

describe("sleepAnchorInputs", () => {
  const TZ2 = "America/Chicago";
  async function night(id: string, endUtc: string, baseline: number, awake: number, debt = 0, strain = 0, nap = 0) {
    const end = new Date(endUtc);
    await db.insert(sleeps).values({
      id,
      start: new Date(end.getTime() - 8 * 3600_000),
      end,
      timezoneOffset: "-06:00",
      nap: false,
      scoreState: "SCORED",
      awakeMin: awake,
      needBaselineMin: baseline,
      needDebtMin: debt,
      needStrainMin: strain,
      needNapMin: nap,
    });
  }

  it("is null with fewer than the minimum nights", async () => {
    await night("a", "2026-03-04T13:00:00Z", 480, 30);
    expect(await sleepAnchorInputs(db, "2026-03-05", TZ2)).toBeNull();
  });

  it("averages baseline need and time awake in bed over recent nights; extra need comes from last night", async () => {
    await night("a", "2026-03-02T13:00:00Z", 470, 20);
    await night("b", "2026-03-03T13:00:00Z", 480, 30);
    await night("c", "2026-03-05T13:00:00Z", 490, 40, 25, 10, -5);
    await night("old", "2026-02-01T13:00:00Z", 900, 300); // outside the window
    expect(await sleepAnchorInputs(db, "2026-03-05", TZ2)).toEqual({ baselineMin: 480, bufferMin: 30, extraMin: 30 });
  });
});
