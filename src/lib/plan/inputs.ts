/**
 * Reads WHOOP and log data into the pure engine's inputs: today's DayInputs for readiness(),
 * the past-week history for weeklyTargets(), and the longest recent run for buildWeek().
 *
 * Owner-local days from WHOOP rows use each row's own `timezone_offset` (falling back to `tz`):
 * - a cycle (and its recovery) belongs to the local day of `start + 12 h`, so a cycle that starts
 *   at sleep onset in the evening counts for the next morning, and one after midnight for that day;
 * - a sleep belongs to the local day it ended;
 * - a workout belongs to the local day it started.
 */
import { and, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notDismissed } from "@/lib/log/dismissed";
import { cardioEntries, cycles, painEntries, plannedSessions, recoveries, sleeps, strengthSessions, workouts } from "@/db/schema";
import { RULES } from "@/lib/engine/rules/catalog";
import type { DayInputs, PainInput } from "@/lib/engine/readiness";
import type { SeasonCalendar, WeekHistory } from "@/lib/engine/season";
import { addDays, localDate, weekStart } from "@/lib/log/dates";
import { SPORTS, type LinkKind } from "@/lib/log/link-whoop";
import type { PlanSettings } from "./settings";

const MS_PER_MIN = 60_000;
const MS_PER_DAY = 86_400_000;
const SEC_PER_MIN = 60;
const MIN_PER_HOUR = 60;
const DAYS_PER_WEEK = 7;
/** A cycle starts at sleep onset; its day is the local day 12 h later. */
const CYCLE_DAY_SHIFT_MS = 12 * 3_600_000;
/** Query margin around a local-date range, wider than any UTC offset. */
const MARGIN_MS = 2 * MS_PER_DAY;
/** Ruling 14a: readiness sees pain entries from the last 90 local days. */
export const PAIN_LOOKBACK_DAYS = 90;
const SCORED = "SCORED";
const ENDURANCE_KINDS = ["swim", "bike", "run"] as const;
/**
 * "activity" is generic WHOOP (walks and the like): it can't be attributed to a sport, so the plan
 * never counts it as training or uses it to complete a session.
 */
const GENERIC_SPORT = "activity";
/** link-whoop's SPORTS for a kind, without the generic "activity". */
export const whoopSports = (k: LinkKind): string[] => SPORTS[k].filter((s) => s !== GENERIC_SPORT);
const LINK_KINDS: LinkKind[] = ["swim", "bike", "run", "strength"];
/** The kind a WHOOP sport stands for, or null for generic or unknown sports. */
export function whoopKind(sport: string | null): LinkKind | null {
  if (sport === null) return null;
  return LINK_KINDS.find((k) => whoopSports(k).includes(sport)) ?? null;
}
const ENDURANCE_SPORTS = [...new Set(ENDURANCE_KINDS.flatMap(whoopSports))];

/** A logged activity's time span. */
export type Span = { kind: LinkKind; start: Date; end: Date };
/**
 * True when a WHOOP workout overlaps a logged activity of its own kind. Such a workout is the same
 * session recorded twice (just not linked), so it is neither counted nor used for completion.
 */
export function overlapsLogged(w: { sport: string | null; start: Date; end: Date }, logged: Span[]): boolean {
  const kind = whoopKind(w.sport);
  return logged.some((l) => l.kind === kind && w.start < l.end && l.start < w.end);
}
const cardioSpan = (c: { kind: LinkKind; startedAt: Date; durationS: number }): Span => ({
  kind: c.kind,
  start: c.startedAt,
  end: new Date(c.startedAt.getTime() + c.durationS * 1000),
});

/** "-05:00", "+0530", "Z" -> minutes east of UTC; null when unparseable. */
export function offsetMinutes(offset: string): number | null {
  if (offset === "Z") return 0;
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(offset);
  if (!m) return null;
  const mins = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === "-" ? -mins : mins;
}

/** Local YYYY-MM-DD of `at` at a WHOOP offset, or in `tz` when the offset is unusable. */
export function localDateAtOffset(at: Date, offset: string, tz: string): string {
  const mins = offsetMinutes(offset);
  if (mins === null) return localDate(at, tz);
  return new Date(at.getTime() + mins * MS_PER_MIN).toISOString().slice(0, 10);
}

/** The owner-local day a WHOOP cycle (and its recovery) counts for. */
export function cycleDate(start: Date, offset: string, tz: string): string {
  return localDateAtOffset(new Date(start.getTime() + CYCLE_DAY_SHIFT_MS), offset, tz);
}

/** UTC instant bounds that safely contain local dates [from, to] in any zone. */
function utcBounds(from: string, to: string): [Date, Date] {
  return [new Date(Date.parse(`${from}T00:00:00Z`) - MARGIN_MS), new Date(Date.parse(`${to}T00:00:00Z`) + MARGIN_MS)];
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
function sampleSd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/** Local dates from `from` to `to` inclusive. */
function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

type DayRecovery = { state: string; score: number | null; hrv: number | null; rhr: number | null };

/**
 * One recovery per local day in [from, to] (the latest cycle wins when a day has two).
 */
async function recoveriesByDay(db: Db, from: string, to: string, tz: string): Promise<Map<string, DayRecovery>> {
  const [lo, hi] = utcBounds(from, to);
  const rows = await db
    .select({
      start: cycles.start,
      offset: cycles.timezoneOffset,
      state: recoveries.scoreState,
      score: recoveries.recoveryScore,
      hrv: recoveries.hrvRmssdMs,
      rhr: recoveries.rhr,
    })
    .from(recoveries)
    .innerJoin(cycles, eq(cycles.id, recoveries.cycleId))
    .where(and(gte(cycles.start, lo), lt(cycles.start, hi)))
    .orderBy(cycles.start);
  const out = new Map<string, DayRecovery>();
  for (const r of rows) {
    const day = cycleDate(r.start, r.offset, tz);
    if (day < from || day > to) continue;
    out.set(day, { state: r.state, score: r.score, hrv: r.hrv, rhr: r.rhr });
  }
  return out;
}

/**
 * Everything readiness() needs for one owner-local day.
 * - The 7-day window is [date − (rollingDays − 1), date]; hrvLn7 and rhr7 are null with fewer than
 *   recovery.hrvTrend.minNightsInWindow scored nights in it.
 * - The baseline is the baselineMaxDays days before that window (so the last 7 are excluded);
 *   hrvBaseline (mean and sample SD of ln rMSSD) and rhrBaseline are null with fewer than
 *   baselineMinDays scored days.
 * - Sleep debt sums (need − asleep) over the last recovery.sleepDebt.windowDays main sleeps, where
 *   need is the night's baseline + strain + nap need. WHOOP's own debt component is left out: it is
 *   earlier nights' shortfall, and summing it night after night would count that shortfall twice.
 *   Null when no night has both values.
 * - Pain: entries from the last PAIN_LOOKBACK_DAYS local days (Ruling 14a).
 */
export async function loadDayInputs(db: Db, date: string, tz: string, settings: PlanSettings): Promise<DayInputs> {
  const HRV = RULES["recovery.hrvTrend"].params;
  const SLEEP = RULES["recovery.sleepDebt"].params;
  const windowFrom = addDays(date, -(HRV.rollingDays - 1));
  const baseTo = addDays(windowFrom, -1);
  const baseFrom = addDays(baseTo, -(HRV.baselineMaxDays - 1));

  const rec = await recoveriesByDay(db, baseFrom, date, tz);
  const scored = (d: string) => {
    const r = rec.get(d);
    return r && r.state === SCORED ? r : null;
  };
  const lnHrv = (days: string[]) =>
    days.map((d) => scored(d)?.hrv).filter((v): v is number => typeof v === "number" && v > 0).map(Math.log);
  const rhrs = (days: string[]) => days.map((d) => scored(d)?.rhr).filter((v): v is number => typeof v === "number");

  const windowDays = dateRange(windowFrom, date);
  const baseDays = dateRange(baseFrom, baseTo);
  const ln7 = lnHrv(windowDays);
  const rhr7 = rhrs(windowDays);
  const lnBase = lnHrv(baseDays);
  const rhrBase = rhrs(baseDays);

  const today = rec.get(date) ?? null;

  // Sleep debt over the last windowDays nights.
  const sleepFrom = addDays(date, -(SLEEP.windowDays - 1));
  const [slo, shi] = utcBounds(sleepFrom, date);
  const nights = await db
    .select()
    .from(sleeps)
    .where(and(eq(sleeps.nap, false), gte(sleeps.end, slo), lt(sleeps.end, shi)));
  const shortfalls = nights
    .filter((n) => {
      const d = localDateAtOffset(n.end, n.timezoneOffset, tz);
      return d >= sleepFrom && d <= date && n.scoreState === SCORED;
    })
    .filter((n) => n.asleepMin !== null && n.needBaselineMin !== null)
    .map((n) => (n.needBaselineMin as number) + (n.needStrainMin ?? 0) + (n.needNapMin ?? 0) - (n.asleepMin as number));

  const painRows = await db
    .select()
    .from(painEntries)
    .where(and(gte(painEntries.localDate, addDays(date, -(PAIN_LOOKBACK_DAYS - 1))), lte(painEntries.localDate, date)));
  const pain: PainInput[] = painRows.map((p) => ({ area: p.area, date: p.localDate, max: p.score, context: p.context }));

  return {
    date,
    recoveryScore: today?.score ?? null,
    recoveryState: today?.state ?? null,
    hrvLn7: ln7.length >= HRV.minNightsInWindow ? mean(ln7) : null,
    hrvBaseline: lnBase.length >= HRV.baselineMinDays ? { mean: mean(lnBase), sd: sampleSd(lnBase), days: lnBase.length } : null,
    rhr7: rhr7.length >= HRV.minNightsInWindow ? mean(rhr7) : null,
    rhrBaseline: rhrBase.length >= HRV.baselineMinDays ? mean(rhrBase) : null,
    sleepDebtMin3d: shortfalls.length ? shortfalls.reduce((a, b) => a + b, 0) : null,
    recentScores: windowDays.map((d) => scored(d)?.score ?? null),
    pain,
    jointStatus: settings.jointStatus,
  };
}

/**
 * Past-week history for weeklyTargets(cal, weekIndex, …): season weeks 0..weekIndex−1, oldest
 * first, aligned to end at weekIndex−1.
 * - A finished week: endurance = logged cardio_entries minutes + unlinked WHOOP endurance workouts
 *   (a WHOOP workout linked to a manual entry is counted once, through the entry); run likewise.
 *   strainRatio = the week's summed cycle strain ÷ the mean of the volume.loadCheck.trailingWeeks
 *   weeks before it, null unless all of those weeks have strain.
 * - A week not yet finished (its last day is today or later): its planned swim/bike/run minutes
 *   stand in for the actual, and strainRatio is null.
 * - A week with no data at all (no cycles, entries, workouts or planned rows) carries the previous
 *   week's values forward, never 0, with strainRatio null. Leading no-data weeks get the season's
 *   start level (volume.endurance.startHours, volume.run.startMinPerWeek), so the arrays are
 *   exactly weekIndex long and index i is season week i (Ruling 16c).
 * - WHOOP workouts that are generic "activity", or that overlap a logged entry of the same kind,
 *   are not counted.
 * A finished week with WHOOP cycles but no training is a real 0 (a missed week).
 */
export async function loadWeekHistory(
  db: Db,
  cal: SeasonCalendar,
  weekIndex: number,
  today: string,
  tz: string,
): Promise<WeekHistory> {
  const { trailingWeeks } = RULES["volume.loadCheck"].params;
  const weeks = cal.weeks.slice(0, weekIndex);
  const out: WeekHistory = { actualEnduranceMin: [], actualRunMin: [], strainRatio: [] };
  if (!weeks.length) return out;
  const first = weeks[0].weekStart;
  const last = addDays(weeks[weeks.length - 1].weekStart, DAYS_PER_WEEK - 1);
  const strainFrom = addDays(first, -DAYS_PER_WEEK * trailingWeeks);

  const cardio = await db
    .select({
      kind: cardioEntries.kind,
      durationS: cardioEntries.durationS,
      localDate: cardioEntries.localDate,
      startedAt: cardioEntries.startedAt,
    })
    .from(cardioEntries)
    .where(and(gte(cardioEntries.localDate, first), lte(cardioEntries.localDate, last)));
  const logged = cardio.map(cardioSpan);

  const [wlo, whi] = utcBounds(first, last);
  const whoop = await db
    .select({ start: workouts.start, end: workouts.end, offset: workouts.timezoneOffset, sport: workouts.sportName })
    .from(workouts)
    .where(
      and(
        gte(workouts.start, wlo),
        lt(workouts.start, whi),
        inArray(workouts.sportName, ENDURANCE_SPORTS),
        notDismissed,
        sql`not exists (select 1 from ${cardioEntries} where ${cardioEntries.whoopWorkoutId} = ${workouts.id})`,
        sql`not exists (select 1 from ${strengthSessions} where ${strengthSessions.whoopWorkoutId} = ${workouts.id})`,
      ),
    );

  const [clo, chi] = utcBounds(strainFrom, last);
  const cyc = await db
    .select({ start: cycles.start, offset: cycles.timezoneOffset, state: cycles.scoreState, strain: cycles.strain })
    .from(cycles)
    .where(and(gte(cycles.start, clo), lt(cycles.start, chi)));

  const planned = await db
    .select({ kind: plannedSessions.kind, durationMin: plannedSessions.durationMin, localDate: plannedSessions.localDate })
    .from(plannedSessions)
    .where(
      and(
        gte(plannedSessions.localDate, first),
        lte(plannedSessions.localDate, last),
        inArray(plannedSessions.kind, [...ENDURANCE_KINDS]),
      ),
    );

  type Acc = { endMin: number; runMin: number; data: boolean };
  const acc = new Map<string, Acc>();
  const get = (ws: string) => {
    let a = acc.get(ws);
    if (!a) acc.set(ws, (a = { endMin: 0, runMin: 0, data: false }));
    return a;
  };
  for (const c of cardio) {
    const a = get(weekStart(c.localDate));
    a.data = true;
    a.endMin += c.durationS / SEC_PER_MIN;
    if (c.kind === "run") a.runMin += c.durationS / SEC_PER_MIN;
  }
  for (const w of whoop) {
    if (overlapsLogged(w, logged)) continue;
    const a = get(weekStart(localDateAtOffset(w.start, w.offset, tz)));
    const min = Math.max(0, w.end.getTime() - w.start.getTime()) / MS_PER_MIN;
    a.data = true;
    a.endMin += min;
    if (whoopKind(w.sport) === "run") a.runMin += min;
  }
  const strain = new Map<string, number>();
  const anyCycle = new Set<string>();
  for (const c of cyc) {
    const ws = weekStart(cycleDate(c.start, c.offset, tz));
    anyCycle.add(ws);
    if (c.state === SCORED && c.strain !== null) strain.set(ws, (strain.get(ws) ?? 0) + c.strain);
  }
  const plannedByWeek = new Map<string, { endMin: number; runMin: number }>();
  for (const p of planned) {
    const ws = weekStart(p.localDate);
    const t = plannedByWeek.get(ws) ?? { endMin: 0, runMin: 0 };
    t.endMin += p.durationMin;
    if (p.kind === "run") t.runMin += p.durationMin;
    plannedByWeek.set(ws, t);
  }

  // Ruling 16c: weeklyTargets indexes history by calendar position, so the arrays are exactly
  // weekIndex long. Leading weeks with no data stand at the season's start level.
  const startLevel = {
    endMin: RULES["volume.endurance"].params.startHours * MIN_PER_HOUR,
    runMin: RULES["volume.run"].params.startMinPerWeek,
  };
  let prev: { endMin: number; runMin: number } | null = null;
  for (const w of weeks) {
    const ws = w.weekStart;
    const finished = addDays(ws, DAYS_PER_WEEK - 1) < today;
    let value: { endMin: number; runMin: number } | null = null;
    let ratio: number | null = null;
    if (finished) {
      const a = acc.get(ws);
      if (a?.data || anyCycle.has(ws)) {
        value = { endMin: a?.endMin ?? 0, runMin: a?.runMin ?? 0 };
        const s = strain.get(ws);
        const trailing = Array.from({ length: trailingWeeks }, (_, i) => strain.get(addDays(ws, -DAYS_PER_WEEK * (i + 1))));
        if (s !== undefined && trailing.every((t) => t !== undefined)) {
          const avg = mean(trailing as number[]);
          ratio = avg > 0 ? s / avg : null;
        }
      }
    } else {
      value = plannedByWeek.get(ws) ?? null;
    }
    if (!value) {
      value = prev ?? startLevel;
      ratio = null;
    }
    out.actualEnduranceMin.push(value.endMin);
    out.actualRunMin.push(value.runMin);
    out.strainRatio.push(ratio);
    prev = value;
  }
  return out;
}

/**
 * Ruling 6 (+16d): the longest single run in the volume.run.longRunLookbackDays local days ending
 * `endDate`, in minutes, from cardio_entries (kind "run") and from WHOOP running workouts that are
 * not linked to an entry and don't overlap a logged run. Null when there is none.
 */
export async function longestRunMin(db: Db, endDate: string, tz: string): Promise<number | null> {
  const { longRunLookbackDays } = RULES["volume.run"].params;
  const from = addDays(endDate, -(longRunLookbackDays - 1));
  const runs = await db
    .select({ kind: cardioEntries.kind, startedAt: cardioEntries.startedAt, durationS: cardioEntries.durationS })
    .from(cardioEntries)
    .where(and(eq(cardioEntries.kind, "run"), gte(cardioEntries.localDate, from), lte(cardioEntries.localDate, endDate)));
  const [lo, hi] = utcBounds(from, endDate);
  const whoop = (
    await db
      .select({ start: workouts.start, end: workouts.end, offset: workouts.timezoneOffset, sport: workouts.sportName })
      .from(workouts)
      .where(
        and(
          gte(workouts.start, lo),
          lt(workouts.start, hi),
          inArray(workouts.sportName, whoopSports("run")),
          notDismissed,
          sql`not exists (select 1 from ${cardioEntries} where ${cardioEntries.whoopWorkoutId} = ${workouts.id})`,
        ),
      )
  ).filter((w) => {
    const d = localDateAtOffset(w.start, w.offset, tz);
    return d >= from && d <= endDate;
  });
  const logged = runs.map(cardioSpan);
  const mins = [
    ...runs.map((r) => r.durationS / SEC_PER_MIN),
    ...whoop.filter((w) => !overlapsLogged(w, logged)).map((w) => (w.end.getTime() - w.start.getTime()) / MS_PER_MIN),
  ].filter((m) => m > 0);
  return mins.length ? Math.max(...mins) : null;
}
