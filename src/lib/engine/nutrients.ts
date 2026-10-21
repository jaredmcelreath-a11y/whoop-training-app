/**
 * Nutrient keys and their canonical units. Pure: no DB, no clock.
 * Each key ends with its canonical unit (Apple Health reports micros in mg or µg).
 *
 * `healthKitName` is the type name shown in the Shortcuts "Find Health Samples"
 * picker (the Health app's display name). These are best-known names: Apple does
 * not publish a list, so check them against the picker when building the Shortcut.
 */

export type NutrientUnit = "kcal" | "g" | "mg" | "ug" | "ml";

export type Nutrient = {
  readonly key: string;
  readonly unit: NutrientUnit;
  readonly label: string;
  readonly healthKitName: string;
};

const LIST = [
  { key: "energy_kcal", unit: "kcal", label: "Calories", healthKitName: "Dietary Energy" },
  { key: "protein_g", unit: "g", label: "Protein", healthKitName: "Protein" },
  { key: "carbs_g", unit: "g", label: "Carbohydrates", healthKitName: "Carbohydrates" },
  { key: "fat_g", unit: "g", label: "Fat", healthKitName: "Total Fat" },
  { key: "fiber_g", unit: "g", label: "Fiber", healthKitName: "Fiber" },
  { key: "water_ml", unit: "ml", label: "Water", healthKitName: "Water" },
  { key: "calcium_mg", unit: "mg", label: "Calcium", healthKitName: "Calcium" },
  { key: "iron_mg", unit: "mg", label: "Iron", healthKitName: "Iron" },
  { key: "magnesium_mg", unit: "mg", label: "Magnesium", healthKitName: "Magnesium" },
  { key: "potassium_mg", unit: "mg", label: "Potassium", healthKitName: "Potassium" },
  { key: "sodium_mg", unit: "mg", label: "Sodium", healthKitName: "Sodium" },
  { key: "zinc_mg", unit: "mg", label: "Zinc", healthKitName: "Zinc" },
  { key: "vitamin_a_ug", unit: "ug", label: "Vitamin A", healthKitName: "Vitamin A" },
  { key: "vitamin_c_mg", unit: "mg", label: "Vitamin C", healthKitName: "Vitamin C" },
  { key: "vitamin_d_ug", unit: "ug", label: "Vitamin D", healthKitName: "Vitamin D" },
  { key: "vitamin_e_mg", unit: "mg", label: "Vitamin E", healthKitName: "Vitamin E" },
  { key: "vitamin_k_ug", unit: "ug", label: "Vitamin K", healthKitName: "Vitamin K" },
  { key: "vitamin_b12_ug", unit: "ug", label: "Vitamin B12", healthKitName: "Vitamin B12" },
  { key: "folate_ug", unit: "ug", label: "Folate", healthKitName: "Folate" },
] as const satisfies readonly Nutrient[];

export type NutrientKey = (typeof LIST)[number]["key"];

export const NUTRIENTS: readonly (Nutrient & { readonly key: NutrientKey })[] = Object.freeze(
  LIST.map((n) => Object.freeze({ ...n })),
);

export const MICRO_KEYS = Object.freeze([
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
] as const satisfies readonly NutrientKey[]);

export type MicroKey = (typeof MICRO_KEYS)[number];

const KEYS: ReadonlySet<string> = new Set(NUTRIENTS.map((n) => n.key));

export function isNutrientKey(k: string): k is NutrientKey {
  return KEYS.has(k);
}

export function nutrientUnit(k: NutrientKey): NutrientUnit {
  return NUTRIENTS.find((n) => n.key === k)!.unit;
}

/** Millilitres in one US fluid ounce. */
export const ML_PER_FL_OZ = 29.5735;

/** Kilograms in one pound. */
export const KG_PER_LB = 0.45359237;
