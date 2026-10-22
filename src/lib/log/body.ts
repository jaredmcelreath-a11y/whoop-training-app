import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { weeklyMetrics, weightEntries } from "@/db/schema";
import { localDate, weekStart } from "./dates";

export type WeightTrend = {
  latest: { date: string; lb: number; loggedAt: Date } | null;
  avg7: number | null;
  avg7Prev: number | null;
};

/** YYYY-MM-DD shifted by `days` calendar days. */
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const avg1 = (xs: number[]): number | null =>
  xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;

/** One weigh-in per local date; a later one that day replaces the earlier. */
export async function upsertWeight(db: Db, at: Date, tz: string, weightLb: number): Promise<void> {
  await db
    .insert(weightEntries)
    .values({ localDate: localDate(at, tz), weightLb, loggedAt: at })
    .onConflictDoUpdate({
      target: weightEntries.localDate,
      set: { weightLb, loggedAt: at },
    });
}

/**
 * Latest weigh-in overall, plus the mean of local dates [today-6, today] and
 * [today-13, today-7], each rounded to 0.1 lb.
 */
export async function getWeightTrend(db: Db, now: Date, tz: string): Promise<WeightTrend> {
  const today = localDate(now, tz);
  const [latest] = await db
    .select()
    .from(weightEntries)
    .where(lte(weightEntries.localDate, today))
    .orderBy(desc(weightEntries.localDate))
    .limit(1);
  const rows = await db
    .select()
    .from(weightEntries)
    .where(and(gte(weightEntries.localDate, addDays(today, -13)), lte(weightEntries.localDate, today)));
  const cut = addDays(today, -6);
  return {
    latest: latest ? { date: latest.localDate, lb: latest.weightLb, loggedAt: latest.loggedAt } : null,
    avg7: avg1(rows.filter((r) => r.localDate >= cut).map((r) => r.weightLb)),
    avg7Prev: avg1(rows.filter((r) => r.localDate < cut).map((r) => r.weightLb)),
  };
}

/** Upsert the week containing `localDateStr`; null fields keep their stored value. */
export async function upsertWeekly(
  db: Db,
  localDateStr: string,
  input: { vo2max: number | null; whoopAge: number | null },
): Promise<void> {
  await db
    .insert(weeklyMetrics)
    .values({ weekStart: weekStart(localDateStr), vo2max: input.vo2max, whoopAge: input.whoopAge })
    .onConflictDoUpdate({
      target: weeklyMetrics.weekStart,
      set: {
        vo2max: sql`coalesce(excluded.vo2max, ${weeklyMetrics.vo2max})`,
        whoopAge: sql`coalesce(excluded.whoop_age, ${weeklyMetrics.whoopAge})`,
        updatedAt: sql`now()`,
      },
    });
}

/** The stored metrics for the week containing `localDateStr`, if any. */
export async function getWeekly(
  db: Db,
  localDateStr: string,
): Promise<{ vo2max: number | null; whoopAge: number | null; updatedAt: Date } | null> {
  const [row] = await db
    .select({ vo2max: weeklyMetrics.vo2max, whoopAge: weeklyMetrics.whoopAge, updatedAt: weeklyMetrics.updatedAt })
    .from(weeklyMetrics)
    .where(eq(weeklyMetrics.weekStart, weekStart(localDateStr)));
  return row ?? null;
}
