/**
 * Training progress loader: plan adherence, lift top sets and endurance trends for the Progress
 * tab. Every series is limited to the selected range. Missing data yields empty arrays.
 */
import { and, asc, eq, gte, lte, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cardioEntries, exercises, plannedSessions, strengthSessions, strengthSets, weeklyMetrics } from "@/db/schema";
import { addDays, localDate, weekStart } from "@/lib/log/dates";
import { METERS_PER_MILE, METERS_PER_YARD } from "@/lib/log/units";
import { liftSeries, RANGE_DAYS, weeklyAdherence, type AdherenceWeek, type LiftSeries, type Point, type Range } from "./series";

const SWIM_PACE_YARDS = 100;

export type TrainingProgress = {
  adherence: AdherenceWeek[];
  lifts: LiftSeries[];
  vo2max: Point[];
  whoopAge: Point[];
  swimPace: Point[];
  runPace: Point[];
  bikeWatts: Point[];
};

export async function getTrainingProgress(db: Db, now: Date, tz: string, range: Range): Promise<TrainingProgress> {
  const today = localDate(now, tz);
  const from = addDays(today, -(RANGE_DAYS[range] - 1));

  const planned = await db
    .select({ localDate: plannedSessions.localDate, kind: plannedSessions.kind, status: plannedSessions.status })
    .from(plannedSessions)
    .where(and(gte(plannedSessions.localDate, from), lte(plannedSessions.localDate, today), ne(plannedSessions.kind, "rest")));

  const sets = await db
    .select({
      localDate: strengthSessions.localDate,
      exerciseId: strengthSets.exerciseId,
      exerciseName: exercises.name,
      reps: strengthSets.reps,
      weightLb: strengthSets.weightLb,
    })
    .from(strengthSets)
    .innerJoin(strengthSessions, eq(strengthSets.sessionId, strengthSessions.id))
    .innerJoin(exercises, eq(strengthSets.exerciseId, exercises.id))
    .where(and(gte(strengthSessions.localDate, from), lte(strengthSessions.localDate, today)));

  const metrics = await db
    .select()
    .from(weeklyMetrics)
    .where(and(gte(weeklyMetrics.weekStart, weekStart(from)), lte(weeklyMetrics.weekStart, today)))
    .orderBy(asc(weeklyMetrics.weekStart));

  const cardio = await db
    .select()
    .from(cardioEntries)
    .where(and(gte(cardioEntries.localDate, from), lte(cardioEntries.localDate, today)))
    .orderBy(asc(cardioEntries.localDate), asc(cardioEntries.startedAt));

  const swimPace: Point[] = [];
  const runPace: Point[] = [];
  const bikeWatts: Point[] = [];
  for (const c of cardio) {
    const dist = c.distanceM;
    if (c.kind === "swim" && dist !== null && dist > 0) {
      swimPace.push({ date: c.localDate, value: c.durationS / (dist / METERS_PER_YARD) * SWIM_PACE_YARDS });
    } else if (c.kind === "run" && dist !== null && dist > 0) {
      runPace.push({ date: c.localDate, value: c.durationS / (dist / METERS_PER_MILE) });
    } else if (c.kind === "bike" && c.avgWatts !== null && c.avgWatts > 0) {
      bikeWatts.push({ date: c.localDate, value: c.avgWatts });
    }
  }

  const metricPoints = (pick: (m: (typeof metrics)[number]) => number | null): Point[] =>
    metrics.flatMap((m) => {
      const v = pick(m);
      return v === null ? [] : [{ date: m.weekStart, value: v }];
    });

  return {
    adherence: weeklyAdherence(planned, today),
    lifts: liftSeries(sets),
    vo2max: metricPoints((m) => m.vo2max),
    whoopAge: metricPoints((m) => m.whoopAge),
    swimPace,
    runPace,
    bikeWatts,
  };
}
