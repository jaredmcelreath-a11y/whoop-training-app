/** Day tab readers and helpers (kept out of the pure engine). */
import { and, asc, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { RULES } from "@/lib/engine/rules/catalog";
import type { Db } from "@/db/client";
import { cardioEntries, sleeps, strengthSessions, workouts } from "@/db/schema";
import type { ActualWorkout } from "@/lib/engine/day-timeline";
import { overlapsLogged, whoopKind, type Span } from "@/lib/plan/inputs";
import { addDays, toZonedLocal, zonedLocalToUtc } from "@/lib/log/dates";

const SCORED = "SCORED";

function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const ms = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === s;
}

/** The `?date=` value when it is a real YYYY-MM-DD date, else `today`. */
export function parseDateParam(raw: string | string[] | undefined, today: string): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && isRealDate(v) ? v : today;
}

const num = (x: number | null) => (typeof x === "number" && Number.isFinite(x) ? x : 0);

/**
 * Adds each session's during-session fluid (getDayNutrition's water.duringSessions) as
 * `duringMl`, matched by title; repeated titles are matched in order.
 */
export function withDuringFluid<S extends { title: string }>(
  sessions: readonly S[],
  during: readonly { title: string; ml: number }[],
): (S & { duringMl?: number })[] {
  const left = [...during];
  return sessions.map((s) => {
    const k = left.findIndex((d) => d.title === s.title);
    if (k < 0) return s;
    const [d] = left.splice(k, 1);
    return { ...s, duringMl: d.ml };
  });
}

/**
 * WHOOP's sleep need (min) recorded with the latest scored, non-nap sleep that ended before the
 * end of owner-local `date` (for today, last night's sleep): baseline + debt + strain − nap.
 * It is that sleep's need, not a forecast for tonight. WHOOP reports the nap term
 * (need_from_recent_nap) as a negative number, a reduction; its magnitude is subtracted, so a
 * positive value would reduce the need the same way. Null when there is no such sleep or it has
 * no baseline.
 */
export async function latestSleepNeedMin(db: Db, date: string, tz: string): Promise<number | null> {
  const endOfDay = new Date(zonedLocalToUtc(`${addDays(date, 1)}T00:00`, tz));
  const [s] = await db
    .select()
    .from(sleeps)
    .where(and(eq(sleeps.nap, false), eq(sleeps.scoreState, SCORED), lt(sleeps.end, endOfDay)))
    .orderBy(desc(sleeps.end))
    .limit(1);
  if (!s || typeof s.needBaselineMin !== "number" || !(s.needBaselineMin > 0)) return null;
  const need = s.needBaselineMin + num(s.needDebtMin) + num(s.needStrainMin) - Math.abs(num(s.needNapMin));
  return need > 0 ? need : null;
}

/**
 * Inputs for the steady bedtime (recovery.anchorBedtime): the average WHOOP baseline need and
 * time awake in bed over scored, non-nap sleeps that ended in the baselineDays before the end of
 * `date`, plus last night's extra need (debt + strain − nap). Null with fewer than minNights.
 */
export async function sleepAnchorInputs(
  db: Db,
  date: string,
  tz: string,
): Promise<{ baselineMin: number; bufferMin: number; extraMin: number } | null> {
  const A = RULES["recovery.anchorBedtime"].params;
  const endOfDay = new Date(zonedLocalToUtc(`${addDays(date, 1)}T00:00`, tz));
  const since = new Date(zonedLocalToUtc(`${addDays(date, -A.baselineDays + 1)}T00:00`, tz));
  const rows = (
    await db
      .select()
      .from(sleeps)
      .where(and(eq(sleeps.nap, false), eq(sleeps.scoreState, SCORED), lt(sleeps.end, endOfDay), gte(sleeps.end, since)))
      .orderBy(desc(sleeps.end))
  ).filter((r) => typeof r.needBaselineMin === "number" && r.needBaselineMin > 0);
  if (rows.length < A.minNights) return null;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const last = rows[0];
  return {
    baselineMin: Math.round(mean(rows.map((r) => r.needBaselineMin as number))),
    bufferMin: Math.round(mean(rows.map((r) => num(r.awakeMin)))),
    extraMin: Math.round(num(last.needDebtMin) + num(last.needStrainMin) - Math.abs(num(last.needNapMin))),
  };
}

const CARDIO_TITLE = { run: "Run", bike: "Bike", swim: "Swim" } as const;
const minutesBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60_000);
const clock = (at: Date, tz: string) => toZonedLocal(at, tz).slice(11, 16);

/**
 * The day's real workouts, for the Day timeline: finished app strength sessions, app cardio
 * entries, and WHOOP workouts not already linked to an app entry (generic "activity" skipped).
 * Sorted by start; read only.
 */
export async function actualWorkouts(db: Db, date: string, tz: string): Promise<ActualWorkout[]> {
  const from = new Date(zonedLocalToUtc(`${date}T00:00`, tz));
  const to = new Date(zonedLocalToUtc(`${addDays(date, 1)}T00:00`, tz));
  const lifts = await db
    .select({ start: strengthSessions.startedAt, end: strengthSessions.endedAt })
    .from(strengthSessions)
    .where(and(eq(strengthSessions.localDate, date), isNotNull(strengthSessions.endedAt)));
  const cardio = await db
    .select({ kind: cardioEntries.kind, start: cardioEntries.startedAt, durationS: cardioEntries.durationS })
    .from(cardioEntries)
    .where(eq(cardioEntries.localDate, date));
  const whoop = await db
    .select({ start: workouts.start, end: workouts.end, sport: workouts.sportName })
    .from(workouts)
    .where(
      and(
        gte(workouts.start, from),
        lt(workouts.start, to),
        sql`not exists (select 1 from ${cardioEntries} where ${cardioEntries.whoopWorkoutId} = ${workouts.id})`,
        sql`not exists (select 1 from ${strengthSessions} where ${strengthSessions.whoopWorkoutId} = ${workouts.id})`,
      ),
    )
    .orderBy(asc(workouts.start));

  // An unlinked WHOOP workout overlapping an app entry of its kind is that same session.
  const logged: Span[] = [
    ...lifts.map((l) => ({ kind: "strength" as const, start: l.start, end: l.end as Date })),
    ...cardio.map((c) => ({ kind: c.kind, start: c.start, end: new Date(c.start.getTime() + c.durationS * 1000) })),
  ];

  const out: (ActualWorkout & { at: number })[] = [
    ...lifts.map((l) => ({
      at: l.start.getTime(),
      startHHMM: clock(l.start, tz),
      sport: "strength" as const,
      title: "Strength",
      durationMin: minutesBetween(l.start, l.end as Date),
      source: "app" as const,
    })),
    ...cardio.map((c) => ({
      at: c.start.getTime(),
      startHHMM: clock(c.start, tz),
      sport: c.kind,
      title: CARDIO_TITLE[c.kind],
      durationMin: Math.round(c.durationS / 60),
      source: "app" as const,
    })),
    ...whoop
      .filter((w) => w.sport !== null && w.sport !== "activity" && !overlapsLogged(w, logged))
      .map((w) => ({
        at: w.start.getTime(),
        startHHMM: clock(w.start, tz),
        sport: whoopKind(w.sport),
        title: w.sport as string,
        durationMin: minutesBetween(w.start, w.end),
        source: "whoop" as const,
      })),
  ];
  out.sort((a, b) => a.at - b.at);
  return out.map((w) => ({ startHHMM: w.startHHMM, sport: w.sport, title: w.title, durationMin: w.durationMin, source: w.source }));
}
