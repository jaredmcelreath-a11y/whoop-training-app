/**
 * The detail a body composition scan prints beyond its headline values: lean and fat per body
 * segment, body water, protein, minerals and the fat breakdown. Stored in body_scans.extras under
 * these keys (the shape the first imported scan used).
 */
import { z } from "zod";

export const SEGMENTS = [
  { key: "torso", label: "Torso" },
  { key: "leftArm", label: "Left arm" },
  { key: "rightArm", label: "Right arm" },
  { key: "leftLeg", label: "Left leg" },
  { key: "rightLeg", label: "Right leg" },
] as const;
export type Segment = (typeof SEGMENTS)[number]["key"];

/** Form input names for a segment value: `segmentalLeanLb.torso`. */
export const SEGMENT_GROUPS = [
  { key: "segmentalLeanLb", label: "Lean mass by segment (lb)", max: 150 },
  { key: "segmentalFatLb", label: "Fat mass by segment (lb)", max: 100 },
] as const;

export const DETAIL_FIELDS = [
  { key: "totalBodyWaterLb", label: "Total body water (lb)", min: 20, max: 300 },
  { key: "icfLb", label: "Intracellular water (lb)", min: 10, max: 200 },
  { key: "ecfLb", label: "Extracellular water (lb)", min: 5, max: 150 },
  { key: "proteinLb", label: "Protein (lb)", min: 5, max: 80 },
  { key: "mineralLb", label: "Minerals (lb)", min: 1, max: 30 },
  { key: "subcutaneousFatLb", label: "Subcutaneous fat (lb)", min: 0, max: 300 },
  { key: "visceralFatMassLb", label: "Visceral fat mass (lb)", min: 0, max: 50 },
  { key: "visceralFatAreaCm2", label: "Visceral fat area (cm²)", min: 0, max: 500 },
  { key: "waistHipRatio", label: "Waist-to-hip ratio", min: 0.5, max: 1.5 },
  { key: "bioAge", label: "Body age", min: 10, max: 100 },
] as const;

const num = (min: number, max: number) => z.number().min(min).max(max);
const segments = (max: number) => z.object(Object.fromEntries(SEGMENTS.map((s) => [s.key, num(0, max).optional()]))).strict();

export const ScanExtras = z
  .object({
    ...Object.fromEntries(SEGMENT_GROUPS.map((g) => [g.key, segments(g.max).optional()])),
    ...Object.fromEntries(DETAIL_FIELDS.map((f) => [f.key, num(f.min, f.max).optional()])),
  })
  .strict();
export type ScanExtras = Record<string, number | Partial<Record<Segment, number>>>;

/**
 * The extras entered in a form, read with `get(name)` (null for a blank field, NaN for a bad
 * one). Blank fields are left out; null when nothing was entered.
 */
export function readScanExtras(get: (name: string) => number | null): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const g of SEGMENT_GROUPS) {
    const seg: Record<string, number> = {};
    for (const s of SEGMENTS) {
      const v = get(`${g.key}.${s.key}`);
      if (v !== null) seg[s.key] = v;
    }
    if (Object.keys(seg).length) out[g.key] = seg;
  }
  for (const f of DETAIL_FIELDS) {
    const v = get(f.key);
    if (v !== null) out[f.key] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** `next` laid over `prev`: entered values replace, segment groups merge per segment. */
export function mergeScanExtras(prev: unknown, next: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  const base = prev && typeof prev === "object" ? { ...(prev as Record<string, unknown>) } : {};
  for (const [k, v] of Object.entries(next ?? {})) {
    const old = base[k];
    base[k] = v && typeof v === "object" && old && typeof old === "object" ? { ...old, ...v } : v;
  }
  return Object.keys(base).length ? base : null;
}

/** The form label for an extras path (`["segmentalFatLb", "leftLeg"]` → "Left leg fat"). */
export function scanExtrasLabel(path: readonly PropertyKey[]): string {
  const [group, seg] = path.map(String);
  const segment = SEGMENTS.find((s) => s.key === seg);
  if (segment) return `${segment.label} ${group === "segmentalFatLb" ? "fat" : "lean"}`;
  return DETAIL_FIELDS.find((f) => f.key === group)?.label ?? group;
}
