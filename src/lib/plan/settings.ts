import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { planSettings } from "@/db/schema";
import { addDays, localDate } from "@/lib/log/dates";
import { fromMeters } from "@/lib/log/units";

export type PlanSettings = {
  raceDate: string;
  seasonStart: string;
  windows: { start: string; end: string }[];
  longRideDow: number;
  longRunDow: number;
  restDow: number;
  /** A second weekly rest day, or null for one. */
  secondRestDow: number | null;
  jointStatus: "unrestricted" | "caution" | "restricted";
  poolLengthM: number;
  /** "HH:MM", or null to derive wake from the first training window. */
  wakeTime: string | null;
  /** The side pain is logged on; null asks each time. */
  painSide: "left" | "right" | "both" | null;
  /** Display unit for pool length. */
  poolUnit: "yd" | "m" | "ft";
  /** Starting paces for the race projection (null: use the first-timer default). */
  startSwimSecPer100Yd: number | null;
  startRunSecPerMi: number | null;
  startBikeMph: number | null;
  /** Race goal in seconds (null: the race.projection default). */
  goalSec: number | null;
  /** Off: logged pain starts no pain hold (pain.monitoring) and the after-run question is skipped. */
  painMonitoring: boolean;
};

export const DEFAULT_RACE_DATE = "2027-10-17";
export const DEFAULT_WINDOWS = [
  { start: "06:00", end: "09:00" },
  { start: "11:30", end: "13:30" },
];
const POOL_25_YD_M = 22.86;
const MIN_WEEKS_TO_RACE = 12;
const MAX_WEEKS_TO_RACE = 104;
const DAYS_PER_WEEK = 7;
const S_PER_H = 3600;
// Plausible bounds for the starting paces and goal (input checks, not training rules).
const SWIM_PACE_S = [40, 600] as const;
const RUN_PACE_S = [240, 1200] as const;
const BIKE_MPH = [5, 40] as const;
const GOAL_H = [3, 9] as const;

/** A real calendar date: the YYYY-MM-DD shape and a UTC round trip (no 2027-02-30). */
const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((s) => {
    const ms = Date.parse(`${s}T00:00:00Z`);
    return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === s;
  }, "Use a real date (YYYY-MM-DD)");
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM");
const dow = z.number().int().min(0).max(DAYS_PER_WEEK - 1);

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export const PlanSettingsInput = z
  .object({
    raceDate: dateStr,
    seasonStart: dateStr,
    windows: z
      .array(z.object({ start: hhmm, end: hhmm }))
      .min(1, "Add at least one training window"),
    longRideDow: dow,
    longRunDow: dow,
    restDow: dow,
    secondRestDow: dow.nullable().optional(),
    jointStatus: z.enum(["unrestricted", "caution", "restricted"]),
    poolLengthM: z.number().positive(),
    wakeTime: hhmm.nullable().optional(),
    painSide: z.enum(["left", "right", "both"]).nullable().optional(),
    poolUnit: z.enum(["yd", "m", "ft"]).optional(),
    startSwimSecPer100Yd: z.number().int().min(SWIM_PACE_S[0]).max(SWIM_PACE_S[1]).nullable().optional(),
    startRunSecPerMi: z.number().int().min(RUN_PACE_S[0]).max(RUN_PACE_S[1]).nullable().optional(),
    startBikeMph: z.number().min(BIKE_MPH[0]).max(BIKE_MPH[1]).nullable().optional(),
    goalSec: z
      .number()
      .int()
      .min(GOAL_H[0] * S_PER_H)
      .max(GOAL_H[1] * S_PER_H)
      .nullable()
      .optional(),
    painMonitoring: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    const weeks = daysBetween(v.seasonStart, v.raceDate) / DAYS_PER_WEEK;
    if (weeks < MIN_WEEKS_TO_RACE || weeks > MAX_WEEKS_TO_RACE) {
      ctx.addIssue({
        code: "custom",
        path: ["raceDate"],
        message: `Race date must be ${MIN_WEEKS_TO_RACE}-${MAX_WEEKS_TO_RACE} weeks after the season start`,
      });
    }
    if (new Set([v.longRideDow, v.longRunDow, v.restDow]).size !== 3) {
      ctx.addIssue({
        code: "custom",
        path: ["restDow"],
        message: "Long ride, long run and rest day must be three different days",
      });
    }
    const second = v.secondRestDow ?? null;
    if (second !== null && [v.longRideDow, v.longRunDow, v.restDow].includes(second)) {
      ctx.addIssue({
        code: "custom",
        path: ["secondRestDow"],
        message: "The second rest day must differ from the long ride, long run and rest day",
      });
    }
    v.windows.forEach((w, i) => {
      if (w.start >= w.end) {
        ctx.addIssue({
          code: "custom",
          path: ["windows", i],
          message: "Each training window must start before it ends",
        });
      }
    });
  });

function firstMondayOnOrAfter(d: string): string {
  const dowIdx = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % DAYS_PER_WEEK;
  return dowIdx === 0 ? d : addDays(d, DAYS_PER_WEEK - dowIdx);
}

function toSettings(r: typeof planSettings.$inferSelect): PlanSettings {
  return {
    raceDate: r.raceDate,
    seasonStart: r.seasonStart,
    windows: r.windows,
    longRideDow: r.longRideDow,
    longRunDow: r.longRunDow,
    restDow: r.restDow,
    secondRestDow: r.secondRestDow ?? null,
    jointStatus: r.jointStatus,
    poolLengthM: r.poolLengthM,
    wakeTime: r.wakeTime ?? null,
    painSide: (r.painSide as PlanSettings["painSide"]) ?? null,
    poolUnit: (r.poolUnit as PlanSettings["poolUnit"]) ?? legacyPoolUnit(r.poolLengthM),
    startSwimSecPer100Yd: r.startSwimSecPer100Yd ?? null,
    startRunSecPerMi: r.startRunSecPerMi ?? null,
    startBikeMph: r.startBikeMph ?? null,
    goalSec: r.goalSec ?? null,
    painMonitoring: r.painMonitoring,
  };
}

/** A stored length within this many yards of a whole number counts as a yard pool. */
const WHOLE_YD_TOLERANCE = 0.01;

/** Rows saved before pool_unit existed: the old form's rule (whole yards in yd, else m). */
function legacyPoolUnit(m: number): "yd" | "m" {
  const yd = fromMeters(m, "yd");
  return Math.abs(yd - Math.round(yd)) < WHOLE_YD_TOLERANCE ? "yd" : "m";
}

export async function getPlanSettings(db: Db, now: Date, tz: string): Promise<PlanSettings> {
  await db
    .insert(planSettings)
    .values({
      id: 1,
      raceDate: DEFAULT_RACE_DATE,
      seasonStart: firstMondayOnOrAfter(localDate(now, tz)),
      windows: DEFAULT_WINDOWS,
      longRideDow: 5,
      longRunDow: 6,
      restDow: 0,
      jointStatus: "caution",
      poolLengthM: POOL_25_YD_M,
    })
    .onConflictDoNothing({ target: planSettings.id });
  const [row] = await db.select().from(planSettings).where(eq(planSettings.id, 1));
  return toSettings(row);
}

export async function updatePlanSettings(
  db: Db,
  patch: Partial<PlanSettings>,
): Promise<PlanSettings> {
  const [row] = await db.select().from(planSettings).where(eq(planSettings.id, 1));
  if (!row) throw new Error("Plan settings have not been created yet");
  const merged = { ...toSettings(row), ...patch };
  const parsed = PlanSettingsInput.safeParse(merged);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const [updated] = await db
    .update(planSettings)
    .set({
      ...parsed.data,
      secondRestDow: parsed.data.secondRestDow ?? null,
      wakeTime: parsed.data.wakeTime ?? null,
      painSide: parsed.data.painSide ?? null,
      poolUnit: parsed.data.poolUnit ?? "yd",
      startSwimSecPer100Yd: parsed.data.startSwimSecPer100Yd ?? null,
      startRunSecPerMi: parsed.data.startRunSecPerMi ?? null,
      startBikeMph: parsed.data.startBikeMph ?? null,
      goalSec: parsed.data.goalSec ?? null,
      painMonitoring: parsed.data.painMonitoring ?? true,
      updatedAt: new Date(),
    })
    .where(eq(planSettings.id, 1))
    .returning();
  return toSettings(updated);
}
