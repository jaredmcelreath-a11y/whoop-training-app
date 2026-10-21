import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { bodyScans, exercises, labPanels, labResults, weeklyMetrics } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import { BaselineFile, baselineError, seedBaseline } from "./baseline";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.delete(labPanels);
  await db.delete(bodyScans);
  await db.delete(weeklyMetrics);
  await db.delete(exercises);
});

const fixture = {
  bodyScans: [{ scannedOn: "2025-01-15", weightLb: 150.5, bodyFatPct: 20, source: "test-scanner" }],
  labPanels: [
    {
      drawnOn: "2025-02-01",
      source: "test-lab",
      results: [
        { marker: "Alpha", value: 1.5, unit: "mg/dL" },
        { marker: "Beta", value: 40, unit: "U/L", flag: "H" },
      ],
    },
  ],
  weekly: [{ date: "2025-02-05", vo2max: 40, whoopAge: 30 }],
  exercises: [
    { name: "Test Lift A", category: "strength" },
    { name: "Test Lift B", category: "core" },
  ],
};

describe("seedBaseline", () => {
  it("inserts everything, then a re-run inserts 0 scans/panels/exercises and re-upserts weekly", async () => {
    const data = BaselineFile.parse(fixture);
    expect(await seedBaseline(db, data)).toEqual({ scans: 1, panels: 1, weekly: 1, exercises: 2 });
    expect(await seedBaseline(db, data)).toEqual({ scans: 0, panels: 0, weekly: 1, exercises: 0 });
    expect(await db.select().from(bodyScans)).toHaveLength(1);
    expect(await db.select().from(labPanels)).toHaveLength(1);
    expect(await db.select().from(labResults)).toHaveLength(2);
    expect(await db.select().from(weeklyMetrics)).toHaveLength(1);
    expect(await db.select().from(exercises)).toHaveLength(2);
  });

  it("treats a missing panel source as the default source when deduping", async () => {
    const data = BaselineFile.parse({
      ...fixture,
      labPanels: [{ ...fixture.labPanels[0], source: undefined }],
    });
    expect((await seedBaseline(db, data)).panels).toBe(1);
    expect((await seedBaseline(db, data)).panels).toBe(0);
  });
});

describe("BaselineFile validation", () => {
  it("rejects a lab result missing unit, naming the path but not the value", () => {
    const bad = {
      ...fixture,
      labPanels: [{ drawnOn: "2025-02-01", results: [{ marker: "Alpha", value: 987.65 }] }],
    };
    const r = BaselineFile.safeParse(bad);
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = baselineError(r.error);
      expect(msg).toContain("labPanels.0.results.0.unit");
      expect(msg).not.toContain("987.65");
    }
  });

  it("rejects an unknown exercise category", () => {
    const r = BaselineFile.safeParse({
      ...fixture,
      exercises: [{ name: "X", category: "cardio" }],
    });
    expect(r.success).toBe(false);
  });
});
