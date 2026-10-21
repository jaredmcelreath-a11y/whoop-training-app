import { and, eq, gt, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cardioEntries, strengthSessions, workouts } from "@/db/schema";

export type LinkKind = "run" | "bike" | "swim" | "strength";

/** WHOOP `sport_name` slugs that fit each kind of manual entry. */
export const SPORTS: Record<LinkKind, string[]> = {
  run: ["running", "activity"],
  bike: ["cycling", "spin", "activity"],
  swim: ["swimming", "activity"],
  strength: ["weightlifting", "weightlifting_msk", "powerlifting", "functional-fitness", "activity"],
};

const WINDOW_MS = 30 * 60_000;

/**
 * The id of the WHOOP workout that best matches a manual entry, or null. Candidates overlap
 * [start - 30 min, end + 30 min], fit the sport, and are not linked to another entry. The most
 * overlap with the entry's own range wins; if every overlap is 0, the nearest start wins.
 */
export async function findWhoopMatch(
  db: Db,
  kind: LinkKind,
  start: Date,
  end: Date,
): Promise<string | null> {
  const s = start.getTime();
  const e = Math.max(end.getTime(), s);
  const candidates = await db
    .select({ id: workouts.id, start: workouts.start, end: workouts.end })
    .from(workouts)
    .where(
      and(
        inArray(workouts.sportName, SPORTS[kind]),
        lt(workouts.start, new Date(e + WINDOW_MS)),
        gt(sql`coalesce(${workouts.end}, ${workouts.start})`, new Date(s - WINDOW_MS)),
        sql`not exists (select 1 from ${cardioEntries} where ${cardioEntries.whoopWorkoutId} = ${workouts.id})`,
        sql`not exists (select 1 from ${strengthSessions} where ${strengthSessions.whoopWorkoutId} = ${workouts.id})`,
      ),
    );

  let best: { id: string; overlap: number; dist: number } | null = null;
  for (const c of candidates) {
    const cs = c.start.getTime();
    const ce = (c.end ?? c.start).getTime();
    const overlap = Math.max(0, Math.min(e, ce) - Math.max(s, cs));
    const dist = Math.abs(cs - s);
    if (!best || overlap > best.overlap || (overlap === best.overlap && dist < best.dist)) {
      best = { id: c.id, overlap, dist };
    }
  }
  return best?.id ?? null;
}

/**
 * Fills `whoop_workout_id` for unlinked entries started at or after `since` (finished sessions
 * only). Returns how many were newly linked.
 */
export async function relinkRecent(db: Db, since: Date): Promise<number> {
  let linked = 0;
  const cardio = await db
    .select()
    .from(cardioEntries)
    .where(and(gte(cardioEntries.startedAt, since), isNull(cardioEntries.whoopWorkoutId)));
  for (const c of cardio) {
    const end = new Date(c.startedAt.getTime() + c.durationS * 1000);
    const id = await findWhoopMatch(db, c.kind, c.startedAt, end);
    if (!id) continue;
    await db
      .update(cardioEntries)
      .set({ whoopWorkoutId: id })
      .where(and(eq(cardioEntries.id, c.id), isNull(cardioEntries.whoopWorkoutId)));
    linked++;
  }
  const sessions = await db
    .select()
    .from(strengthSessions)
    .where(
      and(
        gte(strengthSessions.startedAt, since),
        isNotNull(strengthSessions.endedAt),
        isNull(strengthSessions.whoopWorkoutId),
      ),
    );
  for (const t of sessions) {
    const id = await findWhoopMatch(db, "strength", t.startedAt, t.endedAt as Date);
    if (!id) continue;
    await db
      .update(strengthSessions)
      .set({ whoopWorkoutId: id })
      .where(and(eq(strengthSessions.id, t.id), isNull(strengthSessions.whoopWorkoutId)));
    linked++;
  }
  return linked;
}

export type LinkedWorkout = {
  strain: number | null;
  avgHr: number | null;
  start: Date;
  end: Date;
};

/** "WHOOP: strain 9.4 · avg HR 142 · 31 min"; parts WHOOP did not score are left out. */
export function formatWhoop(w: LinkedWorkout): string {
  const parts = ["WHOOP:"];
  const bits: string[] = [];
  if (w.strain !== null) bits.push(`strain ${w.strain.toFixed(1)}`);
  if (w.avgHr !== null) bits.push(`avg HR ${w.avgHr}`);
  bits.push(`${Math.round((w.end.getTime() - w.start.getTime()) / 60_000)} min`);
  return `${parts[0]} ${bits.join(" · ")}`;
}
