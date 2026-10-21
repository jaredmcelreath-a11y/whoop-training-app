import { describe, it, expect } from "vitest";
import { MICRO_KEYS, NUTRIENTS, isNutrientKey } from "@/lib/engine/nutrients";

describe("nutrients", () => {
  it("lists the macro keys and every micro key once, each with a unit, label and Health name", () => {
    const keys = NUTRIENTS.map((n) => n.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of ["energy_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "water_ml"]) expect(keys).toContain(k);
    for (const k of MICRO_KEYS) expect(keys).toContain(k);
    for (const n of NUTRIENTS) {
      expect(n.unit.length, n.key).toBeGreaterThan(0);
      expect(n.label.length, n.key).toBeGreaterThan(0);
      expect(n.healthKitName.length, n.key).toBeGreaterThan(0);
      // The key's suffix is its canonical unit.
      expect(n.key.endsWith(`_${n.unit}`), n.key).toBe(true);
    }
  });

  it("has exactly the 13 micronutrients", () => {
    expect([...MICRO_KEYS].sort()).toEqual(
      [
        "calcium_mg",
        "iron_mg",
        "magnesium_mg",
        "potassium_mg",
        "sodium_mg",
        "zinc_mg",
        "vitamin_a_ug",
        "vitamin_c_mg",
        "vitamin_d_ug",
        "vitamin_e_mg",
        "vitamin_k_ug",
        "vitamin_b12_ug",
        "folate_ug",
      ].sort(),
    );
  });

  it("isNutrientKey accepts known keys and rejects others", () => {
    expect(isNutrientKey("protein_g")).toBe(true);
    expect(isNutrientKey("caffeine_mg")).toBe(false);
    expect(isNutrientKey("__proto__")).toBe(false);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(NUTRIENTS)).toBe(true);
    expect(Object.isFrozen(NUTRIENTS[0])).toBe(true);
    expect(Object.isFrozen(MICRO_KEYS)).toBe(true);
  });
});
