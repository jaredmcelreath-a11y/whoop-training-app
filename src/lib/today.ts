import { and, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cycles, recoveries, sleeps, syncState, whoopConnection } from "@/db/schema";
import { getWeightTrend } from "@/lib/log/body";

export type TodaySummary = {
  connection: "none" | "connected" | "needs_reconnect";
  recovery: { score: number | null; state: string; avg7: number | null } | null;
  hrv: { ms: number | null; avg30: number | null } | null;
  rhr: number | null;
  sleep: { asleepMin: number | null; needMin: number | null; performancePct: number | null; endedAt: Date } | null;
  dayStrain: number | null;
  lastSyncedAt: Date | null;
  weight: Awaited<ReturnType<typeof getWeightTrend>>;
};

const SCORED = "SCORED";

/** Placeholder for a record with no score: WHOOP will never score UNSCORABLE ones. */
export function unscoredLabel(state: string | undefined): "Pending" | "Not scored" {
  return state === "UNSCORABLE" ? "Not scored" : "Pending";
}
const DAY_MS = 24 * 60 * 60_000;

const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

/** Offset of `tz` from UTC at `at`, in ms (e.g. -6h for CST). */
function tzOffsetMs(at: Date, tz: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? "");
  if (!m) return 0; // "GMT" alone means UTC+0
  const ms = (Number(m[2]) * 60 + Number(m[3])) * 60_000;
  return m[1] === "-" ? -ms : ms;
}

/** Midnight at the start of the local calendar day in `tz` that contains `at`. */
export function startOfLocalDay(at: Date, tz: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const utcMidnight = Date.UTC(get("year"), get("month") - 1, get("day"));
  // The offset at midnight can differ from the offset at `at` on a DST day.
  let guess = utcMidnight - tzOffsetMs(at, tz);
  guess = utcMidnight - tzOffsetMs(new Date(guess), tz);
  return new Date(guess);
}

/**
 * What the Today screen shows. "Today" is the latest cycle (which can start the
 * evening before) and the main sleep that ended most recently; naps are skipped.
 * Records that are not SCORED yield null values, never 0. A latest cycle with
 * no recovery row yet reads as PENDING_SCORE.
 */
export async function getTodaySummary(db: Db, now: Date, tz: string): Promise<TodaySummary> {
  const [conn] = await db
    .select({ status: whoopConnection.status })
    .from(whoopConnection)
    .where(eq(whoopConnection.id, 1));
  const [sync] = await db.select().from(syncState).where(eq(syncState.key, "whoop"));

  const [cycle] = await db
    .select()
    .from(cycles)
    .where(lte(cycles.start, now))
    .orderBy(desc(cycles.start))
    .limit(1);

  const recRows = () =>
    db
      .select({
        scoreState: recoveries.scoreState,
        recoveryScore: recoveries.recoveryScore,
        hrv: recoveries.hrvRmssdMs,
        rhr: recoveries.rhr,
      })
      .from(recoveries)
      .innerJoin(cycles, eq(cycles.id, recoveries.cycleId));

  // Only the latest cycle's own recovery counts. A new cycle starts at sleep
  // onset, so its recovery can lag; showing an older one would mix yesterday's
  // recovery with today's strain.
  const [latestRec] = cycle
    ? await recRows().where(eq(recoveries.cycleId, cycle.id)).limit(1)
    : [];

  const last7 = await recRows()
    .where(
      and(
        lte(cycles.start, now),
        eq(recoveries.scoreState, SCORED),
        isNotNull(recoveries.recoveryScore),
      ),
    )
    .orderBy(desc(cycles.start))
    .limit(7);

  const windowStart = startOfLocalDay(new Date(now.getTime() - 29 * DAY_MS), tz);
  const last30 = await recRows().where(
    and(
      gte(cycles.start, windowStart),
      lte(cycles.start, now),
      eq(recoveries.scoreState, SCORED),
      isNotNull(recoveries.hrvRmssdMs),
    ),
  );

  const [sleep] = await db
    .select()
    .from(sleeps)
    .where(and(eq(sleeps.nap, false), lte(sleeps.end, now)))
    .orderBy(desc(sleeps.end))
    .limit(1);

  const recScored = latestRec?.scoreState === SCORED;
  const needs = sleep
    ? [sleep.needBaselineMin, sleep.needDebtMin, sleep.needStrainMin, sleep.needNapMin]
    : [];

  return {
    connection: conn ? conn.status : "none",
    recovery: cycle
      ? {
          score: recScored ? latestRec.recoveryScore : null,
          state: latestRec?.scoreState ?? "PENDING_SCORE",
          avg7: mean(last7.map((r) => r.recoveryScore as number)),
        }
      : null,
    hrv: cycle
      ? {
          ms: recScored ? latestRec.hrv : null,
          avg30: mean(last30.map((r) => r.hrv as number)),
        }
      : null,
    rhr: recScored ? latestRec.rhr : null,
    sleep: sleep
      ? {
          asleepMin: sleep.scoreState === SCORED ? sleep.asleepMin : null,
          performancePct: sleep.scoreState === SCORED ? sleep.performancePct : null,
          needMin: needs.every((v) => typeof v === "number")
            ? (needs as number[]).reduce((a, b) => a + b, 0)
            : null,
          endedAt: sleep.end,
        }
      : null,
    dayStrain: cycle && cycle.scoreState === SCORED ? cycle.strain : null,
    lastSyncedAt: sync?.lastSyncedAt ?? null,
    weight: await getWeightTrend(db, now, tz),
  };
}
