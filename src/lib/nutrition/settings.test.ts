import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db/client";
import { nutritionSettings } from "@/db/schema";
import { getNutritionSettings, updateNutritionSettings } from "./settings";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await db.delete(nutritionSettings);
});

describe("getNutritionSettings", () => {
  it("creates defaults once and is stable after", async () => {
    const a = await getNutritionSettings(db);
    expect(a).toEqual({
      refProfile: null,
      mealsPerDay: 4,
      waterSource: "app",
      supplements: [],
      gainGoalLb: 15,
      gainStartWeightLb: null,
    });
    await updateNutritionSettings(db, { mealsPerDay: 5 });
    const b = await getNutritionSettings(db);
    expect(b.mealsPerDay).toBe(5);
    const rows = await db.select().from(nutritionSettings);
    expect(rows).toHaveLength(1);
  });

  it("rejects a second row with id = 2", async () => {
    await getNutritionSettings(db);
    await expect(db.insert(nutritionSettings).values({ id: 2 })).rejects.toThrow();
    await expect(db.execute(sql`select 1`)).resolves.toBeDefined();
  });
});

describe("updateNutritionSettings", () => {
  it("changes only the patched field", async () => {
    const before = await getNutritionSettings(db);
    const after = await updateNutritionSettings(db, {
      refProfile: "female_31_50",
      supplements: [{ name: "Test supplement", timing: "morning" }],
    });
    expect(after).toEqual({
      ...before,
      refProfile: "female_31_50",
      supplements: [{ name: "Test supplement", timing: "morning" }],
    });
  });

  it("keeps an optional amount on a supplement, and old rows without one", async () => {
    await getNutritionSettings(db);
    const out = await updateNutritionSettings(db, {
      supplements: [
        { name: "Creatine", timing: "morning", amount: "10 g" },
        { name: "Omega-3", timing: "morning" },
      ],
    });
    expect(out.supplements[0].amount).toBe("10 g");
    expect(out.supplements[1].amount ?? null).toBeNull();
    await expect(
      updateNutritionSettings(db, { supplements: [{ name: "X", timing: "morning", amount: "x".repeat(41) }] }),
    ).rejects.toThrow();
  });

  it("rejects 21 supplements", async () => {
    await getNutritionSettings(db);
    const supplements = Array.from({ length: 21 }, (_, i) => ({
      name: `S${i}`,
      timing: "evening" as const,
    }));
    await expect(updateNutritionSettings(db, { supplements })).rejects.toThrow(/20/);
  });

  it("rejects a supplement name over 60 chars", async () => {
    await getNutritionSettings(db);
    await expect(
      updateNutritionSettings(db, {
        supplements: [{ name: "x".repeat(61), timing: "morning" }],
      }),
    ).rejects.toThrow(/60/);
  });

  it("throws a readable error when settings do not exist yet", async () => {
    await expect(updateNutritionSettings(db, { mealsPerDay: 3 })).rejects.toThrow(/not been created/);
  });
});
