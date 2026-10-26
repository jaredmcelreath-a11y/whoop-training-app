/**
 * Weekly race projection snapshots (rule race.projection). A week's projection uses logged
 * training dated through the previous Sunday, is saved the first time it's needed, and never
 * changes after that, except that the current week is recomputed when the starting paces change.
 */
import { and, desc, eq, gte, isNotNull, lt, lte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cardioEntries, planSettings, raceProjections, weeklyMetrics, workouts } from "@/db/schema";
import { notDismissed } from "@/lib/log/dismissed";
import { localDateAtOffset } from "./inputs";
import { project, type ProjectionInputs } from "@/lib/engine/race-projection";
import { RULES } from "@/lib/engine/rules/catalog";
import { addDays } from "@/lib/log/dates";

export type SavedProjection = {
  weekStart: string;
  swimS: number;
  bikeS: number;
  runS: number;
  transitionS: number;
  totalS: number;
  /** The total when this week was first saved (null on rows saved before this was kept). */
  initialTotalS: number | null;
  estimates: { swim: boolean; bike: boolean; run: boolean };
};

const DAYS_PER_WEEK = 7;
const M_PER_YD = 0.9144;
const M_PER_MI = 1609.344;
const S_PER_MIN = 60;

type StartPaces = { startSwimSecPer100Yd: number | null; startRunSecPerMi: number | null; startBikeMph: number | null; goalSec?: number | null };

/** Whether a settings save changed a starting pace, so the current week's projection is redone. */
export function startPacesChanged(before: StartPaces, after: StartPaces): boolean {
  return (
    before.startSwimSecPer100Yd !== after.startSwimSecPer100Yd ||
    before.startRunSecPerMi !== after.startRunSecPerMi ||
    before.startBikeMph !== after.startBikeMph
  );
}

/** WHOOP sports that count when they carry GPS distance (spin and generic "activity" don't). */
const WHOOP_KIND: Record<string, "run" | "bike" | "swim"> = { running: "run", cycling: "bike", swimming: "swim" };
/** A logged entry starting this close to a WHOOP workout of the same kind is the same session. */
const SAME_SESSION_MS = 30 * 60_000;
const MS_PER_DAY = 86_400_000;

/**
 * The look-back window's training (logged entries, plus WHOOP runs, rides and swims that have GPS
 * distance and aren't already logged), the latest VO2 max in it, and the starting paces. The
 * window ends the Sunday before `weekStart`, or on `through` to include this week so far.
 */
export async function projectionInputs(db: Db, weekStart: string, tz: string, through?: string): Promise<ProjectionInputs> {
  const P = RULES["race.projection"].params;
  const from = addDays(weekStart, -P.lookbackWeeks * DAYS_PER_WEEK);
  const to = through ?? addDays(weekStart, -1);
  const rows = await db
    .select()
    .from(cardioEntries)
    .where(and(gte(cardioEntries.localDate, from), lte(cardioEntries.localDate, to), isNotNull(cardioEntries.distanceM)));
  // WHOOP workouts with a GPS distance, in the window by their own local day, not already logged.
  const whoop = (
    await db
      .select({ id: workouts.id, start: workouts.start, end: workouts.end, offset: workouts.timezoneOffset, sport: workouts.sportName, distanceM: workouts.distanceM })
      .from(workouts)
      .where(
        and(
          gte(workouts.start, new Date(Date.parse(`${from}T00:00:00Z`) - MS_PER_DAY)),
          lt(workouts.start, new Date(Date.parse(`${to}T00:00:00Z`) + 2 * MS_PER_DAY)),
          isNotNull(workouts.distanceM),
          notDismissed,
          sql`not exists (select 1 from ${cardioEntries} where ${cardioEntries.whoopWorkoutId} = ${workouts.id})`,
        ),
      )
  ).filter((w) => {
    const kind = WHOOP_KIND[w.sport ?? ""];
    const day = localDateAtOffset(w.start, w.offset, tz);
    const logged = rows.some((r) => r.kind === kind && Math.abs(r.startedAt.getTime() - w.start.getTime()) < SAME_SESSION_MS);
    return kind !== undefined && day >= from && day <= to && !logged;
  });
  const fromWhoop = whoop.map((w) => ({
    kind: WHOOP_KIND[w.sport ?? ""],
    distanceM: w.distanceM as number,
    durationS: Math.round((w.end.getTime() - w.start.getTime()) / 1000),
    indoor: false,
    inclinePct: null as number | null,
  }));
  const all = [
    ...rows.map((r) => ({ kind: r.kind, distanceM: r.distanceM as number, durationS: r.durationS, indoor: r.indoor, inclinePct: r.inclinePct })),
    ...fromWhoop,
  ];
  const session = (r: (typeof all)[number]) => ({ distanceM: r.distanceM, durationS: r.durationS });
  const swims = all.filter((r) => r.kind === "swim" && r.distanceM >= P.minSwimYd * M_PER_YD).map(session);
  const rides = all.filter((r) => r.kind === "bike" && !r.indoor && r.durationS >= P.minRideMin * S_PER_MIN).map(session);
  const runs = all
    .filter(
      (r) => r.kind === "run" && r.distanceM >= P.minRunMi * M_PER_MI && !(r.indoor && (r.inclinePct ?? 0) > P.maxTreadmillInclinePct),
    )
    .map(session);
  const [vo2] = await db
    .select({ vo2max: weeklyMetrics.vo2max })
    .from(weeklyMetrics)
    .where(and(gte(weeklyMetrics.weekStart, from), lte(weeklyMetrics.weekStart, to), isNotNull(weeklyMetrics.vo2max)))
    .orderBy(desc(weeklyMetrics.weekStart))
    .limit(1);
  const [s] = await db.select().from(planSettings).where(eq(planSettings.id, 1));
  return {
    swims,
    rides,
    runs,
    vo2max: vo2?.vo2max ?? null,
    start: {
      swimSecPer100Yd: s?.startSwimSecPer100Yd ?? null,
      runSecPerMi: s?.startRunSecPerMi ?? null,
      bikeMph: s?.startBikeMph ?? null,
    },
  };
}

/**
 * The finish this week's workouts so far point to: the saved week's window plus this week through
 * `today`. Never saved; the week's main number stays the weekly snapshot.
 */
export async function liveWeekProjection(db: Db, weekStart: string, today: string, tz: string): Promise<number> {
  return project(await projectionInputs(db, weekStart, tz, today)).totalS;
}

const toSaved = (r: typeof raceProjections.$inferSelect): SavedProjection => ({
  weekStart: r.weekStart,
  swimS: r.swimS,
  bikeS: r.bikeS,
  runS: r.runS,
  transitionS: r.transitionS,
  totalS: r.totalS,
  initialTotalS: r.initialTotalS,
  estimates: r.estimates,
});

async function compute(db: Db, weekStart: string, tz: string) {
  const inputs = await projectionInputs(db, weekStart, tz);
  const p = project(inputs);
  return {
    weekStart,
    swimS: p.swim.seconds,
    bikeS: p.bike.seconds,
    runS: p.run.seconds,
    transitionS: p.transitionS,
    totalS: p.totalS,
    estimates: { swim: p.swim.estimate, bike: p.bike.estimate, run: p.run.estimate },
    inputs: { counts: { swims: inputs.swims.length, rides: inputs.rides.length, runs: inputs.runs.length }, vo2max: inputs.vo2max, start: inputs.start },
  };
}

/** Read only: a week's saved projection, or null. Never computes or writes. */
export async function savedWeekProjection(db: Db, weekStart: string): Promise<SavedProjection | null> {
  const [row] = await db.select().from(raceProjections).where(eq(raceProjections.weekStart, weekStart));
  return row ? toSaved(row) : null;
}

/** The week's saved projection, computed and saved the first time. */
export async function ensureWeekProjection(db: Db, weekStart: string, tz: string): Promise<SavedProjection> {
  const saved = await savedWeekProjection(db, weekStart);
  if (saved) return saved;
  const row = await compute(db, weekStart, tz);
  await db.insert(raceProjections).values({ ...row, initialTotalS: row.totalS }).onConflictDoNothing({ target: raceProjections.weekStart });
  return (await savedWeekProjection(db, weekStart)) as SavedProjection;
}

/** Recomputes and saves a week (used for the current week when the starting paces change). */
export async function recomputeWeekProjection(db: Db, weekStart: string, tz: string): Promise<SavedProjection> {
  const row = await compute(db, weekStart, tz);
  await db
    .insert(raceProjections)
    .values({ ...row, initialTotalS: row.totalS })
    .onConflictDoUpdate({ target: raceProjections.weekStart, set: { ...row, computedAt: new Date() } });
  return (await savedWeekProjection(db, weekStart)) as SavedProjection;
}

/** The latest `n` saved weeks up to `uptoWeekStart`, oldest first. */
export async function projectionHistory(db: Db, uptoWeekStart: string, n: number): Promise<SavedProjection[]> {
  const rows = await db
    .select()
    .from(raceProjections)
    .where(lte(raceProjections.weekStart, uptoWeekStart))
    .orderBy(desc(raceProjections.weekStart))
    .limit(n);
  return rows.map(toSaved).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}
