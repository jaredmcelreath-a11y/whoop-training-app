import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cardioEntries, workouts } from "@/db/schema";
import { whoopSports } from "@/lib/plan/inputs";

/** WHOOP Age and VO2 max usually update on these days (0 = Sunday, 2 = Tuesday). */
const WEEKLY_ENTRY_DOWS = [0, 2];
/** How far back the Log hub looks for WHOOP workouts that still need details. */
const DETAILS_LOOKBACK_DAYS = 7;

const dowOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/**
 * Whether the weekly VO2 max / WHOOP Age box is open: always with nothing saved this week; on
 * Tuesday and Sunday until something is saved that day; otherwise collapsed with Re-enter.
 */
export function weeklyBoxOpen(row: { updatedLocalDate: string } | null, today: string): boolean {
  if (!row) return true;
  return WEEKLY_ENTRY_DOWS.includes(dowOf(today)) && row.updatedLocalDate !== today;
}

export type WhoopCardio = { id: string; kind: "swim" | "bike" | "run"; start: Date; durationMin: number };

const KIND_OF: [WhoopCardio["kind"], string[]][] = [
  ["swim", whoopSports("swim")],
  ["bike", whoopSports("bike")],
  ["run", whoopSports("run")],
];

/** The last week's WHOOP swims, rides and runs with no app cardio entry yet, newest first. */
export async function unlinkedWhoopCardio(db: Db, now: Date): Promise<WhoopCardio[]> {
  const sports = KIND_OF.flatMap(([, s]) => s);
  const rows = await db
    .select({ id: workouts.id, start: workouts.start, end: workouts.end, sport: workouts.sportName })
    .from(workouts)
    .where(
      and(
        inArray(workouts.sportName, sports),
        gte(workouts.start, new Date(now.getTime() - DETAILS_LOOKBACK_DAYS * 86_400_000)),
        lte(workouts.start, now),
        sql`not exists (select 1 from ${cardioEntries} where ${cardioEntries.whoopWorkoutId} = ${workouts.id})`,
      ),
    )
    .orderBy(desc(workouts.start));
  return rows.map((r) => ({
    id: r.id,
    kind: KIND_OF.find(([, s]) => s.includes(r.sport ?? ""))![0],
    start: r.start,
    durationMin: Math.round((r.end.getTime() - r.start.getTime()) / 60_000),
  }));
}

/** Start and length of a WHOOP workout, to pre-fill the cardio form; null when unknown. */
export async function whoopPrefill(db: Db, id: string | undefined): Promise<{ start: Date; durationMin: number } | null> {
  if (!id) return null;
  const [w] = await db.select({ start: workouts.start, end: workouts.end }).from(workouts).where(eq(workouts.id, id)).limit(1);
  return w ? { start: w.start, durationMin: Math.round((w.end.getTime() - w.start.getTime()) / 60_000) } : null;
}
