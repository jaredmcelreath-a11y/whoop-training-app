import type { MicroTargets } from "@/lib/engine/energy";
import { MICRO_KEYS, NUTRIENTS, type NutrientKey } from "@/lib/engine/nutrients";
import { mlToOz } from "./fuel-view";

export type NutrientDay = {
  targets: { kcal: number; proteinG: number; carbsG: number; fatG: number } | null;
  micros: MicroTargets | null;
  water: { countedMl: number; targetMl: number };
  eaten: {
    kcal: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    fiberG: number | null;
    micros: Record<string, { value: number; unit: string }>;
  } | null;
};

export type NutrientRow = {
  group: "Macros" | "Vitamins" | "Minerals";
  key: string;
  label: string;
  eaten: number | null;
  target: number | null;
  unit: string;
  kind: "reach" | "limit";
};

const UNIT: Record<string, string> = { kcal: "kcal", g: "g", mg: "mg", ug: "µg", ml: "mL" };
const label = (key: NutrientKey) => NUTRIENTS.find((n) => n.key === key)!.label;

/** Every nutrient for the all-nutrients page: macros first, then vitamins and minerals. */
export function nutrientRows(n: NutrientDay): NutrientRow[] {
  const e = n.eaten;
  const t = n.targets;
  const macro = (key: NutrientKey, eaten: number | null, target: number | null, unit: string): NutrientRow => ({
    group: "Macros",
    key,
    label: label(key),
    eaten,
    target,
    unit,
    kind: "reach",
  });
  const rows: NutrientRow[] = [
    macro("water_ml", mlToOz(n.water.countedMl), n.water.targetMl > 0 ? mlToOz(n.water.targetMl) : null, "oz"),
    macro("energy_kcal", e?.kcal ?? null, t?.kcal ?? null, "kcal"),
    macro("protein_g", e?.proteinG ?? null, t?.proteinG ?? null, "g"),
    macro("carbs_g", e?.carbsG ?? null, t?.carbsG ?? null, "g"),
    macro("fat_g", e?.fatG ?? null, t?.fatG ?? null, "g"),
    macro("fiber_g", e?.fiberG ?? null, n.micros?.fiber_g.value ?? null, "g"),
  ];
  const micro = MICRO_KEYS.map((key): NutrientRow => {
    const target = n.micros?.[key] ?? null;
    const unit = NUTRIENTS.find((x) => x.key === key)!.unit;
    return {
      group: key.startsWith("vitamin") || key === "folate_ug" ? "Vitamins" : "Minerals",
      key,
      label: label(key),
      eaten: e?.micros[key]?.value ?? null,
      target: target?.value ?? null,
      unit: UNIT[unit] ?? unit,
      kind: target?.kind === "upper" || key === "sodium_mg" ? "limit" : "reach",
    };
  });
  return [...rows, ...micro.filter((r) => r.group === "Vitamins"), ...micro.filter((r) => r.group === "Minerals")];
}
