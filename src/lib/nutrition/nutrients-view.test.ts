import { describe, expect, it } from "vitest";
import { MICRO_KEYS } from "@/lib/engine/nutrients";
import { ML_PER_FL_OZ } from "@/lib/engine/nutrients";
import { nutrientRows, type NutrientDay } from "./nutrients-view";

// Invented values only.
const micros = Object.fromEntries(
  [...MICRO_KEYS, "fiber_g"].map((k) => [k, { value: 100, unit: "mg", kind: k === "sodium_mg" ? "upper" : "rda" }]),
) as NutrientDay["micros"];

const full: NutrientDay = {
  targets: { kcal: 2800, proteinG: 150, carbsG: 350, fatG: 80 },
  micros,
  water: { countedMl: 1500, targetMl: 3000 },
  eaten: { kcal: 1000, proteinG: 60, carbsG: 120, fatG: 30, fiberG: 12, micros: { iron_mg: { value: 6, unit: "mg" } } },
};

describe("nutrientRows", () => {
  it("lists the macros first, in order", () => {
    expect(nutrientRows(full).slice(0, 6).map((r) => r.label)).toEqual(["Water", "Calories", "Protein", "Carbohydrates", "Fat", "Fiber"]);
  });

  it("has every micronutrient exactly once, grouped", () => {
    const rows = nutrientRows(full);
    for (const k of MICRO_KEYS) expect(rows.filter((r) => r.key === k), k).toHaveLength(1);
    expect(rows.find((r) => r.key === "iron_mg")?.group).toBe("Minerals");
    expect(rows.find((r) => r.key === "vitamin_c_mg")?.group).toBe("Vitamins");
    expect(rows.find((r) => r.key === "folate_ug")?.group).toBe("Vitamins");
  });

  it("treats sodium as a stay-under limit", () => {
    expect(nutrientRows(full).find((r) => r.key === "sodium_mg")?.kind).toBe("limit");
    expect(nutrientRows(full).find((r) => r.key === "iron_mg")?.kind).toBe("reach");
  });

  it("carries eaten amounts, with water in oz and unknowns as null", () => {
    const rows = nutrientRows(full);
    expect(rows.find((r) => r.key === "iron_mg")?.eaten).toBe(6);
    expect(rows.find((r) => r.key === "zinc_mg")?.eaten).toBeNull();
    expect(rows[0].eaten).toBeCloseTo(1500 / ML_PER_FL_OZ, 5);
  });

  it("has no micro targets without a profile, and no eaten values without food data", () => {
    const rows = nutrientRows({ ...full, micros: null, eaten: null, targets: null });
    expect(rows.filter((r) => MICRO_KEYS.includes(r.key as never)).every((r) => r.target === null)).toBe(true);
    expect(rows.slice(1).every((r) => r.eaten === null)).toBe(true);
  });
});
