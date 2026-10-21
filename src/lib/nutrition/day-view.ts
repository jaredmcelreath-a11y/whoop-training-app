/** Day tab readers and helpers (kept out of the pure engine). */
import { and, desc, eq, lt } from "drizzle-orm";
import type { Db } from "@/db/client";
import { sleeps } from "@/db/schema";
import { addDays, zonedLocalToUtc } from "@/lib/log/dates";

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
