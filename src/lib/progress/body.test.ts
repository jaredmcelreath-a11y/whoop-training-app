import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { bodyScans, nutritionSettings, planSettings, weightEntries } from "@/db/schema";
import { addDays } from "@/lib/log/dates";
import { getNutritionSettings, updateNutritionSettings } from "@/lib/nutrition/settings";
import { getPlanSettings, updatePlanSettings } from "@/lib/plan/settings";
import { getBodyProgress } from "./body";

// All values below are invented test data.
const TZ = "America/Chicago";
const NOW = new Date("2026-10-21T17:00:00Z");
const TODAY = "2026-10-21";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  for (const t of [bodyScans, weightEntries, nutritionSettings, planSettings]) await db.delete(t);
  await getPlanSettings(db, NOW, TZ);
  await updatePlanSettings(db, { seasonStart: "2026-10-12" });
  await getNutritionSettings(db);
});

describe("getBodyProgress", () => {
  it("returns empty series and nulls without weights", async () => {
    const p = await getBodyProgress(db, NOW, TZ, "12w");
    expect(p.weights).toEqual([]);
    expect(p.avg7).toEqual([]);
    expect(p.rateLbPerWeek).toBeNull();
    expect(p.targetRateLbPerWeek).toBeNull();
    expect(p.gain.startLb).toBeNull();
    expect(p.gain.currentLb).toBeNull();
    expect(p.gain.gainedLb).toBeNull();
    expect(p.scans).toEqual([]);
    expect(p.scanDelta).toBeNull();
  });

  it("prefers the set gain start weight over the first weigh-in", async () => {
    await db.insert(weightEntries).values([
      { localDate: "2026-10-16", weightLb: 160 },
      { localDate: TODAY, weightLb: 162 },
    ]);
    await updateNutritionSettings(db, { gainStartWeightLb: 155 });
    const p = await getBodyProgress(db, NOW, TZ, "12w");
    expect(p.gain.startLb).toBe(155);
    expect(p.gain.currentLb).toBe(161);
    expect(p.gain.gainedLb).toBe(6);
  });

  it("falls back to the first weigh-in on or after the season start", async () => {
    await db.insert(weightEntries).values([
      { localDate: "2026-10-01", weightLb: 150 },
      { localDate: "2026-10-14", weightLb: 160 },
    ]);
    const p = await getBodyProgress(db, NOW, TZ, "12w");
    expect(p.gain.startLb).toBe(160);
  });

  it("excludes weigh-ins older than 84 days in the 12w range", async () => {
    await db.insert(weightEntries).values([
      { localDate: addDays(TODAY, -84), weightLb: 150 },
      { localDate: addDays(TODAY, -83), weightLb: 151 },
      { localDate: TODAY, weightLb: 152 },
    ]);
    const p = await getBodyProgress(db, NOW, TZ, "12w");
    expect(p.weights.map((w) => w.date)).toEqual([addDays(TODAY, -83), TODAY]);
    const long = await getBodyProgress(db, NOW, TZ, "6m");
    expect(long.weights).toHaveLength(3);
  });

  it("gives a target rate from the phase percentage and the latest average", async () => {
    await db.insert(weightEntries).values({ localDate: TODAY, weightLb: 200 });
    const p = await getBodyProgress(db, NOW, TZ, "12w");
    // Season starts 2026-10-12, so this is the gain phase: 0.5% of 200 lb.
    expect(p.targetRateLbPerWeek).toBeCloseTo(1, 6);
  });

  it("lists scans oldest first with a delta", async () => {
    await db.insert(bodyScans).values([
      { scannedOn: "2026-09-01", weightLb: 150, leanMassLb: 120, fatMassLb: 30, source: "test" },
      { scannedOn: "2026-10-15", weightLb: 154, leanMassLb: 123, fatMassLb: 31, source: "test" },
    ]);
    const p = await getBodyProgress(db, NOW, TZ, "12w");
    expect(p.scans.map((s) => s.scannedOn)).toEqual(["2026-09-01", "2026-10-15"]);
    expect(p.scanDelta?.leanSharePct).toBe(75);
  });

  it("keeps gain numbers and the scan split independent of the chart range", async () => {
    await db.insert(weightEntries).values([
      { localDate: "2026-06-01", weightLb: 150 },
      { localDate: "2026-06-02", weightLb: 152 },
    ]);
    await db.insert(bodyScans).values([
      { scannedOn: "2026-05-01", weightLb: 150, leanMassLb: 120, fatMassLb: 30, source: "test" },
      { scannedOn: "2026-06-01", weightLb: 154, leanMassLb: 123, fatMassLb: 31, source: "test" },
    ]);
    await updatePlanSettings(db, { seasonStart: "2026-04-01" });
    const p = await getBodyProgress(db, NOW, TZ, "12w");
    expect(p.weights).toEqual([]);
    expect(p.avg7).toEqual([]);
    expect(p.gain.currentLb).toBe(151);
    expect(p.gain.startLb).toBe(150);
    expect(p.gain.gainedLb).toBe(1);
    expect(p.targetRateLbPerWeek).not.toBeNull();
    expect(p.scanDelta?.leanSharePct).toBe(75);
  });
});
