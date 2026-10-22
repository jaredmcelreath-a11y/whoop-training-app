import { and, count, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { exercises, strengthSessions, strengthSets } from "@/db/schema";
import { isStrengthKind } from "@/lib/plan/today-view";
import { localDate } from "./dates";

export type LogHub = {
  /** Today's unfinished strength session, if one is open. */
  active: { id: string; startedAt: Date; setCount: number; lastExercise: string | null } | null;
};

/** The open strength session the Log hub highlights. Read only. */
export async function getLogHub(db: Db, now: Date, tz: string): Promise<LogHub> {
  const [open] = await db
    .select({ id: strengthSessions.id, startedAt: strengthSessions.startedAt })
    .from(strengthSessions)
    .where(and(eq(strengthSessions.localDate, localDate(now, tz)), isNull(strengthSessions.endedAt)))
    .orderBy(desc(strengthSessions.startedAt))
    .limit(1);
  if (!open) return { active: null };
  const [{ n }] = await db.select({ n: count() }).from(strengthSets).where(eq(strengthSets.sessionId, open.id));
  const [last] = await db
    .select({ name: exercises.name })
    .from(strengthSets)
    .innerJoin(exercises, eq(exercises.id, strengthSets.exerciseId))
    .where(eq(strengthSets.sessionId, open.id))
    .orderBy(desc(strengthSets.completedAt))
    .limit(1);
  return { active: { id: open.id, startedAt: open.startedAt, setCount: Number(n), lastExercise: last?.name ?? null } };
}

/**
 * Today's lift still to do, from the day's adapted sessions (the same list Today shows),
 * so a pain hold or low-recovery swap never shows a lift the plan dropped.
 */
export function pickTodayLift(
  sessions: readonly { kind: string; title: string; durationMin: number; status: "planned" | "done" | "skipped" }[],
): { title: string; durationMin: number } | null {
  const lift = sessions.find((s) => isStrengthKind(s.kind) && s.status === "planned");
  return lift ? { title: lift.title, durationMin: lift.durationMin } : null;
}
