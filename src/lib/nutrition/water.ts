import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { nutritionDays, sweatTests, waterEntries } from "@/db/schema";
import { localDate } from "@/lib/log/dates";
import { sweatRate, type SweatKind, type SweatRates } from "@/lib/engine/hydration";
import type { NutritionSettings } from "./settings";

const MAX_WATER_ML = 5000;

/** Idempotent on clientId: a repeated tap returns "duplicate" and writes nothing. */
export async function addWater(
  db: Db,
  at: Date,
  tz: string,
  ml: number,
  clientId: string,
): Promise<"added" | "duplicate"> {
  if (!Number.isFinite(ml) || ml <= 0 || ml > MAX_WATER_ML) {
    throw new RangeError(`Water must be between 1 and ${MAX_WATER_ML} mL.`);
  }
  const rows = await db
    .insert(waterEntries)
    .values({ clientId, loggedAt: at, localDate: localDate(at, tz), ml })
    .onConflictDoNothing({ target: waterEntries.clientId })
    .returning({ id: waterEntries.id });
  return rows.length ? "added" : "duplicate";
}

export async function waterToday(
  db: Db,
  date: string,
  setting: NutritionSettings["waterSource"],
): Promise<{ appMl: number; healthMl: number; countedMl: number }> {
  const [app] = await db
    .select({ total: sql<number>`coalesce(sum(${waterEntries.ml}), 0)::float8` })
    .from(waterEntries)
    .where(eq(waterEntries.localDate, date));
  const [health] = await db
    .select({ ml: nutritionDays.waterMl })
    .from(nutritionDays)
    .where(eq(nutritionDays.localDate, date));
  const appMl = Number(app?.total ?? 0);
  const healthMl = health?.ml ?? 0;
  const countedMl = setting === "app" ? appMl : setting === "cronometer" ? healthMl : appMl + healthMl;
  return { appMl, healthMl, countedMl };
}

export type SweatTestInput = {
  testedOn: string;
  preLb: number;
  postLb: number;
  fluidMl: number;
  durationMin: number;
  kind: SweatKind;
  notes?: string | null;
};

/** Computes and stores the sweat rate. Throws RangeError on invalid input, writing nothing. */
export async function addSweatTest(db: Db, input: SweatTestInput): Promise<number> {
  const sweatRateLph = sweatRate(input);
  await db.insert(sweatTests).values({ ...input, notes: input.notes ?? null, sweatRateLph });
  return sweatRateLph;
}

/** Most recent test per kind (by test date, then creation time). */
export async function latestSweatRates(db: Db): Promise<SweatRates> {
  const rows = await db
    .select({ kind: sweatTests.kind, rate: sweatTests.sweatRateLph })
    .from(sweatTests)
    .orderBy(desc(sweatTests.testedOn), desc(sweatTests.createdAt));
  const out: SweatRates = {};
  for (const r of rows) if (out[r.kind] === undefined) out[r.kind] = r.rate;
  return out;
}
