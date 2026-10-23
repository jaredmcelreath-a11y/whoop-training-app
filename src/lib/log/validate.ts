import { z } from "zod";
import { KG_PER_LB, ML_PER_FL_OZ } from "@/lib/engine/nutrients";
import { RULES } from "@/lib/engine/rules/catalog";
import { toMeters } from "./units";

export const PAIN_AREAS = ["knee", "ankle", "shin"] as const;

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date like 2026-01-31")
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }, "must be a real date");

const num = (min: number, max: number) => z.number().min(min).max(max);
const optNum = (min: number, max: number) => num(min, max).nullable();

export const WeightInput = z.object({ weightLb: num(60, 400) });
export type WeightInput = z.infer<typeof WeightInput>;

export const SetInput = z.object({
  clientId: z.uuid(),
  exerciseId: z.uuid(),
  setIndex: z.number().int().min(0).max(50),
  reps: z.number().int().min(1).max(100),
  weightLb: optNum(0, 1500),
});
export type SetInput = z.infer<typeof SetInput>;

const MAX_METERS = { swim: 10_000, run: 100_000, bike: 400_000 } as const;
const KIND_UNITS = {
  swim: ["yd", "m"],
  run: ["mi", "km"],
  bike: ["mi", "km"],
} as const;

export const CardioInput = z
  .object({
    kind: z.enum(["swim", "run", "bike"]),
    startedAt: z.iso.datetime({ offset: true }),
    durationMin: num(1, 600),
    distance: z.number().positive().nullable(),
    unit: z.enum(["yd", "m", "mi", "km"]),
    avgWatts: optNum(0, 2000),
    inclinePct: optNum(-10, 40),
    poolLength: z.number().positive().nullable(),
    /** The pool length's own unit; when absent it is the distance unit. */
    poolUnit: z.enum(["yd", "m", "ft"]).optional(),
    indoor: z.boolean(),
    notes: z.string().max(500),
  })
  .superRefine((v, ctx) => {
    if (!(KIND_UNITS[v.kind] as readonly string[]).includes(v.unit)) {
      ctx.addIssue({
        code: "custom",
        path: ["unit"],
        message: `unit ${v.unit} does not fit a ${v.kind}`,
      });
      return;
    }
    if (v.distance !== null && toMeters(v.distance, v.unit) > MAX_METERS[v.kind]) {
      ctx.addIssue({
        code: "custom",
        path: ["distance"],
        message: `distance is too large for a ${v.kind}`,
      });
    }
    if (v.poolLength !== null) {
      const m = toMeters(v.poolLength, v.poolUnit ?? v.unit);
      if (m < 10 || m > 100) {
        ctx.addIssue({
          code: "custom",
          path: ["poolLength"],
          message: "poolLength must be between 10 and 100 m",
        });
      }
    }
  });
export type CardioInput = z.infer<typeof CardioInput>;

export const PainInput = z.object({
  area: z.enum(PAIN_AREAS),
  side: z.enum(["left", "right", "both"]),
  score: z.number().int().min(0).max(10),
  context: z.enum(["before_run", "after_run", "daily"]),
});
export type PainInput = z.infer<typeof PainInput>;

export const WeeklyInput = z
  .object({ vo2max: optNum(20, 90), whoopAge: optNum(10, 100) })
  .refine((v) => v.vo2max !== null || v.whoopAge !== null, {
    message: "enter vo2max or whoopAge",
    path: ["vo2max"],
  });
export type WeeklyInput = z.infer<typeof WeeklyInput>;

const optional = (min: number, max: number) => num(min, max).nullish();

export const ScanInput = z
  .object({
    scannedOn: isoDate,
    weightLb: optional(60, 400),
    leanMassLb: optional(30, 400),
    skeletalMuscleLb: optional(20, 250),
    fatMassLb: optional(0, 300),
    bodyFatPct: optional(2, 70),
    bmrKcal: optional(800, 4000),
    teeKcal: optional(1000, 8000),
    visceralFatLevel: z.number().int().min(1).max(30).nullish(),
    extras: z.record(z.string(), z.unknown()).optional(),
    source: z.string().max(100).optional(),
  })
  .refine((v) => v.weightLb != null || v.leanMassLb != null || v.fatMassLb != null, {
    message: "enter a weight or a mass value",
    path: ["weightLb"],
  });
export type ScanInput = z.infer<typeof ScanInput>;

export const LabInput = z.object({
  drawnOn: isoDate,
  source: z.string().max(100).optional(),
  results: z
    .array(
      z.object({
        marker: z.string().trim().min(1).max(100),
        value: z.number().min(-1e9).max(1e9),
        // Ratios and indices have no unit.
        unit: z.string().trim().max(30),
        flag: z.string().trim().max(30).optional(),
        refRange: z.string().trim().max(40).optional(),
      }),
    )
    .min(1),
});
export type LabInput = z.infer<typeof LabInput>;

export const SweatInput = z
  .object({
    testedOn: isoDate,
    kind: z.enum(["run", "bike", "swim"]),
    preLb: num(60, 400),
    postLb: num(60, 400),
    fluidOz: num(0, 200),
    durationMin: num(RULES["hydration.sweatTest"].params.minDurationMin, 600),
    notes: z.string().max(500).optional(),
  })
  .refine(
    (v) => (v.preLb - v.postLb) * KG_PER_LB + (v.fluidOz * ML_PER_FL_OZ) / 1000 > 0,
    { message: "Check the weights: this shows no sweat loss." },
  );
export type SweatInput = z.infer<typeof SweatInput>;

export function formError(e: z.ZodError): string {
  const issue = e.issues[0];
  if (!issue) return "Invalid input.";
  const field = issue.path.map(String).join(".");
  return field ? `Check ${field}: ${issue.message}.` : `${issue.message}.`;
}
