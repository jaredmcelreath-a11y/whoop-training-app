/** Pure helpers for the Today fuel card. */
import { ML_PER_FL_OZ } from "@/lib/engine/nutrients";
import { NEED } from "./needs";

const PERCENT = 100;
const WATER_TAP_OZ = 16;
export const WATER_TAP_ML = WATER_TAP_OZ * ML_PER_FL_OZ;

/** Bar fill, 0..100: value over target; 0 when either is missing or not positive. */
export function barPercent(value: number | null, target: number | null): number {
  if (value === null || target === null) return 0;
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0 || value <= 0) return 0;
  return Math.min(PERCENT, Math.round((value / target) * PERCENT));
}

export const mlToOz = (ml: number): number => ml / ML_PER_FL_OZ;

/** "40 / 96 oz", or "40 oz" when there is no positive target. */
export function ozLabel(countedMl: number, targetMl: number): string {
  const counted = Math.round(mlToOz(countedMl));
  return targetMl > 0 ? `${counted} / ${Math.round(mlToOz(targetMl))} oz` : `${counted} oz`;
}

const CONFIDENCE_NOTE = {
  low: "Low confidence: targets are rough until more data comes in.",
  medium: "Medium confidence: targets are improving as data comes in.",
  high: "High confidence in today's targets.",
} as const;

/** The confidence line under the card; null when there are no targets to be confident about. */
export function confidenceNote(confidence: keyof typeof CONFIDENCE_NOTE, hasTargets: boolean): string | null {
  return hasTargets ? CONFIDENCE_NOTE[confidence] : null;
}

export function syncedLabel(at: Date | null, tz: string): string {
  if (!at) return "Not synced yet";
  const t = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  return `Last synced from Apple Health ${t}`;
}

/** Where to fix a missing-setup item: weight → /log, scan → scans, everything else → nutrition settings. */
const NEED_LINK: Record<string, string> = {
  [NEED.weight]: "/log",
  [NEED.gainWeight]: "/log",
  [NEED.scan]: "/log/scans",
  [NEED.burn]: "/log/scans",
  [NEED.gainStart]: "/settings/nutrition",
  [NEED.profile]: "/settings/nutrition",
};

export function needLink(need: string): string {
  const exact = NEED_LINK[need];
  if (exact) return exact;
  const n = need.toLowerCase();
  if (n.includes("weight")) return "/log";
  if (n.includes("body scan")) return "/log/scans";
  return "/settings/nutrition";
}

export function fuelNeeds(needs: string[]): { text: string; href: string }[] {
  return needs.map((text) => ({ text, href: needLink(text) }));
}

export type FuelRow = { label: string; value: number | null; target: number | null; unit: string };

/** Today's fuel card rows: water first, then calories, protein, carbs and fat. */
export function fuelRows(
  targets: { kcal: number; proteinG: number; carbsG: number; fatG: number } | null,
  eaten: { kcal: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null } | null,
  water: { countedMl: number; targetMl: number },
): FuelRow[] {
  return [
    { label: "Water", value: mlToOz(water.countedMl), target: water.targetMl > 0 ? mlToOz(water.targetMl) : null, unit: "oz" },
    { label: "Calories", value: eaten?.kcal ?? null, target: targets?.kcal ?? null, unit: "kcal" },
    { label: "Protein", value: eaten?.proteinG ?? null, target: targets?.proteinG ?? null, unit: "g" },
    { label: "Carbs", value: eaten?.carbsG ?? null, target: targets?.carbsG ?? null, unit: "g" },
    { label: "Fat", value: eaten?.fatG ?? null, target: targets?.fatG ?? null, unit: "g" },
  ];
}

/** Whether Today's session card shows sessions or a plain Rest Day. */
export function trainingCardView(sessions: readonly { kind: string }[]): { kind: "rest" | "sessions" } {
  return { kind: sessions.some((s) => s.kind !== "rest") ? "sessions" : "rest" };
}
