import { and, asc, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { exercises, strengthSessions, strengthSets, workouts } from "@/db/schema";
import { localDate } from "./dates";
import { findWhoopMatch, type LinkedWorkout } from "./link-whoop";
import { classifyExercise, DEFAULT_EXERCISES, type Category } from "./exercise-catalog";
import type { SetInput } from "./validate";

export type { Category };
export type Exercise = typeof exercises.$inferSelect;
export type StrengthSession = typeof strengthSessions.$inferSelect;
export type StrengthSet = typeof strengthSets.$inferSelect;

export async function ensureDefaultExercises(db: Db): Promise<void> {
  await db.insert(exercises).values(DEFAULT_EXERCISES).onConflictDoNothing({ target: exercises.name });
  // Rows created before exercises had a pattern get the catalog's.
  for (const e of DEFAULT_EXERCISES.filter((x) => x.pattern !== null)) {
    await db.update(exercises).set({ pattern: e.pattern }).where(and(eq(exercises.name, e.name), isNull(exercises.pattern)));
  }
}

/** Most recently used first (by latest set), then name. */
export async function listExercises(
  db: Db,
  opts: { includeArchived?: boolean } = {},
): Promise<Exercise[]> {
  const lastUsed = sql<Date | null>`max(${strengthSets.completedAt})`;
  const rows = await db
    .select({ exercise: exercises })
    .from(exercises)
    .leftJoin(strengthSets, eq(strengthSets.exerciseId, exercises.id))
    .where(opts.includeArchived ? undefined : eq(exercises.archived, false))
    .groupBy(exercises.id)
    .orderBy(sql`${lastUsed} desc nulls last`, asc(exercises.name));
  return rows.map((r) => r.exercise);
}

async function findByName(db: Db, name: string): Promise<Exercise | undefined> {
  const [row] = await db
    .select()
    .from(exercises)
    .where(sql`lower(${exercises.name}) = lower(${name})`)
    .limit(1);
  return row;
}

export async function createExercise(db: Db, name: string, category: Category): Promise<Exercise> {
  const trimmed = name.trim();
  const existing = await findByName(db, trimmed);
  if (existing) return existing;
  const [inserted] = await db
    .insert(exercises)
    .values({ name: trimmed, category, pattern: category === "strength" ? classifyExercise(trimmed).pattern : null })
    .onConflictDoNothing({ target: exercises.name })
    .returning();
  if (inserted) return inserted;
  // Lost a race with a concurrent insert of the same name.
  const raced = await findByName(db, trimmed);
  if (!raced) throw new Error("could not create exercise");
  return raced;
}

/**
 * The exercises for these names (any case), keyed by the name as given: existing ones (brought
 * back if archived), and new ones created with the classified category. Used for planned lifts.
 */
export async function ensureExercisesByName(db: Db, names: readonly string[]): Promise<Map<string, Exercise>> {
  const out = new Map<string, Exercise>();
  for (const name of names) {
    if (out.has(name)) continue;
    let ex = await createExercise(db, name, classifyExercise(name).category);
    if (ex.archived) {
      await unarchiveExercise(db, ex.id);
      ex = { ...ex, archived: false };
    }
    out.set(name, ex);
  }
  return out;
}

/** Exercise name to its own load step, for those that have one. */
export async function exerciseIncrements(db: Db): Promise<Map<string, number>> {
  const rows = await db
    .select({ name: exercises.name, incrementLb: exercises.incrementLb })
    .from(exercises)
    .where(isNotNull(exercises.incrementLb));
  return new Map(rows.map((r) => [r.name, r.incrementLb as number]));
}

export async function archiveExercise(db: Db, id: string): Promise<void> {
  await db.update(exercises).set({ archived: true }).where(eq(exercises.id, id));
}

/** createExercise returns an archived row as-is; re-adding it by name brings it back. */
export async function unarchiveExercise(db: Db, id: string): Promise<void> {
  await db.update(exercises).set({ archived: false }).where(eq(exercises.id, id));
}

/** Exercises with logged sets can only be archived. */
export async function deleteExercise(db: Db, id: string): Promise<"deleted" | "has_history"> {
  const [used] = await db
    .select({ id: strengthSets.id })
    .from(strengthSets)
    .where(eq(strengthSets.exerciseId, id))
    .limit(1);
  if (used) return "has_history";
  try {
    await db.delete(exercises).where(eq(exercises.id, id));
  } catch (e) {
    if (hasPgCode(e, "23503")) return "has_history";
    throw e;
  }
  return "deleted";
}

function hasPgCode(e: unknown, code: string): boolean {
  for (let cur: unknown = e; cur && typeof cur === "object"; cur = (cur as { cause?: unknown }).cause) {
    if ((cur as { code?: unknown }).code === code) return true;
  }
  return false;
}

export async function startSession(db: Db, at: Date, tz: string): Promise<{ id: string }> {
  const [row] = await db
    .insert(strengthSessions)
    .values({ startedAt: at, localDate: localDate(at, tz) })
    .returning({ id: strengthSessions.id });
  return row;
}

async function openSessionsOn(db: Db, day: string): Promise<{ id: string }[]> {
  return db
    .select({ id: strengthSessions.id })
    .from(strengthSessions)
    .where(and(eq(strengthSessions.localDate, day), isNull(strengthSessions.endedAt)))
    .orderBy(asc(strengthSessions.startedAt), asc(strengthSessions.id));
}

/**
 * Returns today's unfinished session, opening one only when none exists. There is no
 * unique index, so after inserting it re-reads today's open sessions: if an overlapping
 * start (a double tap) inserted one that sorts first, the fresh, empty row is dropped
 * and the earlier one is returned instead.
 */
export async function startOrResumeSession(db: Db, at: Date, tz: string): Promise<{ id: string }> {
  const day = localDate(at, tz);
  const [open] = await openSessionsOn(db, day);
  if (open) return open;
  const mine = await startSession(db, at, tz);
  const [first] = await openSessionsOn(db, day);
  if (first && first.id !== mine.id) {
    await db.delete(strengthSessions).where(eq(strengthSessions.id, mine.id));
    return first;
  }
  return mine;
}

export async function addSet(
  db: Db,
  input: SetInput & { sessionId: string; at: Date },
): Promise<"added" | "duplicate"> {
  const rows = await db
    .insert(strengthSets)
    .values({
      clientId: input.clientId,
      sessionId: input.sessionId,
      exerciseId: input.exerciseId,
      setIndex: input.setIndex,
      reps: input.reps,
      weightLb: input.weightLb ?? null,
      completedAt: input.at,
    })
    .onConflictDoNothing({ target: strengthSets.clientId })
    .returning({ id: strengthSets.id });
  return rows.length ? "added" : "duplicate";
}

export async function removeSet(db: Db, setId: string): Promise<void> {
  await db.delete(strengthSets).where(eq(strengthSets.id, setId));
}

export async function finishSession(db: Db, sessionId: string, at: Date): Promise<void> {
  const [s] = await db
    .update(strengthSessions)
    .set({ endedAt: at })
    .where(eq(strengthSessions.id, sessionId))
    .returning({ startedAt: strengthSessions.startedAt, whoopWorkoutId: strengthSessions.whoopWorkoutId });
  if (!s || s.whoopWorkoutId) return;
  const id = await findWhoopMatch(db, "strength", s.startedAt, at);
  if (id) {
    await db
      .update(strengthSessions)
      .set({ whoopWorkoutId: id })
      .where(and(eq(strengthSessions.id, sessionId), isNull(strengthSessions.whoopWorkoutId)));
  }
}

/** Sets go with it (FK cascade). */
export async function deleteSession(db: Db, sessionId: string): Promise<void> {
  await db.delete(strengthSessions).where(eq(strengthSessions.id, sessionId));
}

export async function getSession(
  db: Db,
  id: string,
): Promise<{
  session: StrengthSession;
  sets: (StrengthSet & { exerciseName: string })[];
  whoop: LinkedWorkout | null;
} | null> {
  const [found] = await db
    .select({
      session: strengthSessions,
      wId: workouts.id,
      strain: workouts.strain,
      avgHr: workouts.avgHr,
      wStart: workouts.start,
      wEnd: workouts.end,
    })
    .from(strengthSessions)
    .leftJoin(workouts, eq(workouts.id, strengthSessions.whoopWorkoutId))
    .where(eq(strengthSessions.id, id));
  if (!found) return null;
  const session = found.session;
  const whoop: LinkedWorkout | null =
    found.wId === null
      ? null
      : {
          strain: found.strain,
          avgHr: found.avgHr,
          start: found.wStart as Date,
          end: (found.wEnd ?? found.wStart) as Date,
        };
  const rows = await db
    .select({ set: strengthSets, exerciseName: exercises.name })
    .from(strengthSets)
    .innerJoin(exercises, eq(exercises.id, strengthSets.exerciseId))
    .where(eq(strengthSets.sessionId, id))
    .orderBy(asc(strengthSets.completedAt), asc(strengthSets.setIndex));
  // Group by exercise in order of first appearance, then by set_index.
  const order: string[] = [];
  for (const r of rows) if (!order.includes(r.set.exerciseId)) order.push(r.set.exerciseId);
  const sets = rows
    .map((r) => ({ ...r.set, exerciseName: r.exerciseName }))
    .sort(
      (a, b) =>
        order.indexOf(a.exerciseId) - order.indexOf(b.exerciseId) || a.setIndex - b.setIndex,
    );
  return { session, sets, whoop };
}

/** Sets from the most recent other session (by started_at) containing this exercise. */
export async function lastTime(
  db: Db,
  exerciseId: string,
  beforeSessionId?: string,
): Promise<{ date: string; sets: { reps: number; weightLb: number | null }[] } | null> {
  const [prev] = await db
    .select({ id: strengthSessions.id, date: strengthSessions.localDate })
    .from(strengthSessions)
    .where(
      and(
        sql`exists (select 1 from ${strengthSets} where ${strengthSets.sessionId} = ${strengthSessions.id} and ${strengthSets.exerciseId} = ${exerciseId})`,
        beforeSessionId ? ne(strengthSessions.id, beforeSessionId) : undefined,
      ),
    )
    .orderBy(desc(strengthSessions.startedAt))
    .limit(1);
  if (!prev) return null;
  const sets = await db
    .select({ reps: strengthSets.reps, weightLb: strengthSets.weightLb })
    .from(strengthSets)
    .where(and(eq(strengthSets.sessionId, prev.id), eq(strengthSets.exerciseId, exerciseId)))
    .orderBy(asc(strengthSets.setIndex));
  return { date: prev.date, sets };
}

export async function recentSessions(db: Db, limit = 10) {
  const rows = await db
    .select({
      id: strengthSessions.id,
      localDate: strengthSessions.localDate,
      startedAt: strengthSessions.startedAt,
      endedAt: strengthSessions.endedAt,
      exerciseCount: sql<number>`count(distinct ${strengthSets.exerciseId})::int`,
      setCount: sql<number>`count(${strengthSets.id})::int`,
    })
    .from(strengthSessions)
    .leftJoin(strengthSets, eq(strengthSets.sessionId, strengthSessions.id))
    .groupBy(strengthSessions.id)
    .orderBy(desc(strengthSessions.startedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, finished: r.endedAt !== null }));
}
