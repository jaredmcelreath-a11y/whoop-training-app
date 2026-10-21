import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { nutritionDays, sweatTests, waterEntries } from "@/db/schema";
import { addSweatTest, addWater, latestSweatRates, waterToday } from "./water";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await db.delete(waterEntries);
  await db.delete(sweatTests);
  await db.delete(nutritionDays);
});

const at = new Date("2026-03-02T15:00:00Z");
const id1 = "11111111-1111-4111-8111-111111111111";
const id2 = "22222222-2222-4222-8222-222222222222";

describe("addWater", () => {
  it("is idempotent on clientId", async () => {
    expect(await addWater(db, at, "UTC", 500, id1)).toBe("added");
    expect(await addWater(db, at, "UTC", 500, id1)).toBe("duplicate");
    expect(await db.select().from(waterEntries)).toHaveLength(1);
  });
  it("rejects non-positive and over-5000 amounts", async () => {
    await expect(addWater(db, at, "UTC", 0, id1)).rejects.toThrow(RangeError);
    await expect(addWater(db, at, "UTC", 5001, id1)).rejects.toThrow(RangeError);
    expect(await db.select().from(waterEntries)).toHaveLength(0);
  });
});

describe("waterToday", () => {
  beforeEach(async () => {
    await addWater(db, at, "UTC", 500, id1);
    await addWater(db, at, "UTC", 250, id2);
    await db.insert(nutritionDays).values({ localDate: "2026-03-02", sentAt: at, source: "apple_health", waterMl: 1000 });
  });
  it("app ignores Health water", async () => {
    expect(await waterToday(db, "2026-03-02", "app")).toEqual({ appMl: 750, healthMl: 1000, countedMl: 750 });
  });
  it("cronometer counts Health only", async () => {
    expect((await waterToday(db, "2026-03-02", "cronometer")).countedMl).toBe(1000);
  });
  it("both sums", async () => {
    expect((await waterToday(db, "2026-03-02", "both")).countedMl).toBe(1750);
  });
  it("empty day is zero", async () => {
    expect(await waterToday(db, "2026-03-03", "both")).toEqual({ appMl: 0, healthMl: 0, countedMl: 0 });
  });
});

describe("sweat tests", () => {
  const base = { preLb: 160, postLb: 158.5, fluidMl: 500, durationMin: 60 };
  it("stores the computed rate and returns the latest per kind", async () => {
    await addSweatTest(db, { ...base, kind: "run", testedOn: "2026-02-01" });
    await addSweatTest(db, { ...base, postLb: 159, kind: "run", testedOn: "2026-03-01" });
    await addSweatTest(db, { ...base, kind: "bike", testedOn: "2026-01-01" });
    const [old] = await db.select().from(sweatTests);
    expect(old.sweatRateLph).toBeCloseTo(1.18, 2);
    const r = await latestSweatRates(db);
    expect(r.run).toBeCloseTo(0.4536 + 0.5, 2);
    expect(r.bike).toBeCloseTo(1.18, 2);
    expect(r.swim).toBeUndefined();
  });
  it("same-date tests of one kind: the later insert wins", async () => {
    const row = { testedOn: "2026-03-01", preLb: 160, postLb: 159, fluidMl: 0, durationMin: 60, kind: "run" as const };
    await db.insert(sweatTests).values({ ...row, sweatRateLph: 0.7, createdAt: new Date("2026-03-01T10:00:00Z") });
    await db.insert(sweatTests).values({ ...row, sweatRateLph: 0.9, createdAt: new Date("2026-03-01T11:00:00Z") });
    expect((await latestSweatRates(db)).run).toBe(0.9);
  });
  it("rejects invalid input without writing", async () => {
    await expect(addSweatTest(db, { ...base, durationMin: 10, kind: "run", testedOn: "2026-02-01" })).rejects.toThrow(RangeError);
    expect(await db.select().from(sweatTests)).toHaveLength(0);
  });
});
