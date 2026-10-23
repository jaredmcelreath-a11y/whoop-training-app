/**
 * Weekly race projection snapshots (rule race.projection). A week's projection uses logged
 * training dated through the previous Sunday, is saved the first time it's needed, and never
 * changes after that, except that the current week is recomputed when the starting paces change.
 */
import { and, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cardioEntries, planSettings, raceProjections, weeklyMetrics } from "@/db/schema";
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

/** The look-back window's training, the latest VO2 max in it, and the starting paces. */
export async function projectionInputs(db: Db, weekStart: string): Promise<ProjectionInputs> {
  const P = RULES["race.projection"].params;
  const from = addDays(weekStart, -P.lookbackWeeks * DAYS_PER_WEEK);
  const to = addDays(weekStart, -1);
  const rows = await db
    .select()
    .from(cardioEntries)
    .where(and(gte(cardioEntries.localDate, from), lte(cardioEntries.localDate, to), isNotNull(cardioEntries.distanceM)));
  const session = (r: (typeof rows)[number]) => ({ distanceM: r.distanceM as number, durationS: r.durationS });
  const swims = rows.filter((r) => r.kind === "swim" && (r.distanceM as number) >= P.minSwimYd * M_PER_YD).map(session);
  const rides = rows
    .filter((r) => r.kind === "bike" && !r.indoor && r.durationS >= P.minRideMin * S_PER_MIN)
    .map(session);
  const runs = rows
    .filter(
      (r) =>
        r.kind === "run" &&
        (r.distanceM as number) >= P.minRunMi * M_PER_MI &&
        !(r.indoor && (r.inclinePct ?? 0) > P.maxTreadmillInclinePct),
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

const toSaved = (r: typeof raceProjections.$inferSelect): SavedProjection => ({
  weekStart: r.weekStart,
  swimS: r.swimS,
  bikeS: r.bikeS,
  runS: r.runS,
  transitionS: r.transitionS,
  totalS: r.totalS,
  estimates: r.estimates,
});

async function compute(db: Db, weekStart: string) {
  const inputs = await projectionInputs(db, weekStart);
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
export async function ensureWeekProjection(db: Db, weekStart: string): Promise<SavedProjection> {
  const saved = await savedWeekProjection(db, weekStart);
  if (saved) return saved;
  await db.insert(raceProjections).values(await compute(db, weekStart)).onConflictDoNothing({ target: raceProjections.weekStart });
  return (await savedWeekProjection(db, weekStart)) as SavedProjection;
}

/** Recomputes and saves a week (used for the current week when the starting paces change). */
export async function recomputeWeekProjection(db: Db, weekStart: string): Promise<SavedProjection> {
  const row = await compute(db, weekStart);
  await db
    .insert(raceProjections)
    .values(row)
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
