/**
 * Plan service: wires the pure engine to the database. It generates and stores each week,
 * regenerates future weeks after a settings change, adapts a day at read time (never persisted
 * onto planned_sessions), logs which rules fired, and marks sessions done from logs and WHOOP.
 *
 * Invariants:
 * - Past and completed rows are never rewritten. Every write is one statement (no transactions).
 * - Each stored session carries its week's phase in details.week ({ index, phase, recovery,
 *   gainPhase }), so a past week's phase is never recomputed from a newer calendar.
 */
import { and, asc, eq, gte, inArray, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notDismissed } from "@/lib/log/dismissed";
import { cardioEntries, cycles, exercises, plannedSessions, recommendationLog, strengthSessions, workouts } from "@/db/schema";
import { adapt, applyPainHold, NOT_ENOUGH_DATA, type AdaptedSession } from "@/lib/engine/adapt";
import { readiness, type Readiness } from "@/lib/engine/readiness";
import { RULES } from "@/lib/engine/rules/catalog";
import { dayType, strainTarget, type DayType, type StrainTarget } from "@/lib/engine/strain-target";
import { buildProgress, seasonCalendar, weeklyTargets, type SeasonCalendar, type WeeklyTargets } from "@/lib/engine/season";
import { PLYO, prescribe, suggestLoad, TEMPLATES, type History, type Prescription, type TemplateItem } from "@/lib/engine/strength";
import { buildWeek, type PlannedSessionDraft, type StrengthTemplate } from "@/lib/engine/week";
import { addDays, localDate, noonOf, weekStart as weekStartOf, zonedLocalToUtc } from "@/lib/log/dates";
import type { LinkKind } from "@/lib/log/link-whoop";
import { ensureExercisesByName, exerciseIncrements, lastTime } from "@/lib/log/strength";
import {
  loadDayInputs,
  loadWeekHistory,
  localDateAtOffset,
  longestRunMin,
  overlapsLogged,
  whoopSports,
  type Span,
} from "./inputs";
import { getPlanSettings, type PlanSettings } from "./settings";

const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 86_400_000;
const LINK_KINDS: LinkKind[] = ["swim", "bike", "run", "strength"];
const ENDURANCE_KINDS = ["swim", "bike", "run"] as const;
type EnduranceKind = (typeof ENDURANCE_KINDS)[number];
const isEndurance = (k: string): k is EnduranceKind => (ENDURANCE_KINDS as readonly string[]).includes(k);
const PLYO_NAMES = new Set(PLYO.map((p) => p.exercise));

type Row = typeof plannedSessions.$inferSelect;
type Insert = typeof plannedSessions.$inferInsert;
export type WeekMeta = { index: number; phase: string; recovery: boolean; gainPhase: boolean };
export type DaySession = AdaptedSession & {
  id: string;
  status: Row["status"];
  completedRef: string | null;
  completedManual: boolean;
  /** The stored session, present only when adaptation changed it. */
  before?: AdaptedSnapshot;
};

/** A session as adapted on its day, stored on its recommendation_log rows for the before/now view. */
export type AdaptedSnapshot = Pick<PlannedSessionDraft, "kind" | "title" | "durationMin" | "intensity">;

export const snapshotOf = (s: AdaptedSnapshot): AdaptedSnapshot => ({
  kind: s.kind,
  title: s.title,
  durationMin: s.durationMin,
  intensity: s.intensity,
});

const weekEnd = (ws: string) => addDays(ws, DAYS_PER_WEEK - 1);
const isLong = (r: { details?: unknown }) => (r.details as { long?: boolean } | undefined)?.long === true;

function toDraft(r: Row): PlannedSessionDraft {
  return {
    localDate: r.localDate,
    slot: r.slot,
    kind: r.kind,
    title: r.title,
    durationMin: r.durationMin,
    intensity: r.intensity,
    details: r.details as Record<string, unknown>,
    ruleIds: r.ruleIds,
  };
}

function rowsOfWeek(db: Db, ws: string) {
  return db
    .select()
    .from(plannedSessions)
    .where(and(gte(plannedSessions.localDate, ws), lte(plannedSessions.localDate, weekEnd(ws))))
    .orderBy(asc(plannedSessions.localDate), asc(plannedSessions.slot));
}

/** last-time history for every exercise in `items`, keyed by exercise name. */
async function strengthHistory(db: Db, items: TemplateItem[]): Promise<Map<string, History>> {
  const names = [...new Set(items.map((i) => i.exercise))];
  const rows = await db.select({ id: exercises.id, name: exercises.name }).from(exercises).where(inArray(exercises.name, names));
  const map = new Map<string, History>();
  for (const r of rows) map.set(r.name, await lastTime(db, r.id));
  return map;
}

/** Template items for a stored session, or null when it has no prescription. */
function itemsFor(d: PlannedSessionDraft): TemplateItem[] | null {
  if (d.kind === "strength") {
    const t = d.details.template as StrengthTemplate;
    return t === "lower" ? [...TEMPLATES.lower, ...PLYO] : TEMPLATES[t];
  }
  if (d.kind === "lower_leg") return TEMPLATES.lowerLeg;
  if (d.kind === "core") return TEMPLATES.core;
  return null;
}

/**
 * The week's targets less the minutes already on its kept rows, so kept + new never exceeds
 * either the week's endurance total or any sport's own target. Each sport keeps
 * max(0, target − kept); the endurance left is max(0, enduranceMin − all kept endurance), and
 * when the sports' remainders add up to more than that, all three are scaled down in proportion
 * (floored). Scaling only lowers a remainder, so run stays within its own cap. enduranceMin is
 * the sum after scaling. Kept rows count at their planned duration whatever their status, so a
 * partial rebuild can only under-plan the week.
 */
export function remainingTargets(targets: WeeklyTargets, kept: Pick<Row, "kind" | "durationMin">[]): WeeklyTargets {
  const used: Record<EnduranceKind, number> = { swim: 0, bike: 0, run: 0 };
  for (const r of kept) if (isEndurance(r.kind)) used[r.kind] += r.durationMin;
  const enduranceLeft = Math.max(0, targets.enduranceMin - (used.swim + used.bike + used.run));
  let runMin = Math.max(0, targets.runMin - used.run);
  let swimMin = Math.max(0, targets.swimMin - used.swim);
  let bikeMin = Math.max(0, targets.bikeMin - used.bike);
  const total = runMin + swimMin + bikeMin;
  if (total > enduranceLeft) {
    const k = enduranceLeft / total;
    runMin = Math.floor(runMin * k);
    swimMin = Math.floor(swimMin * k);
    bikeMin = Math.floor(bikeMin * k);
  }
  return { enduranceMin: runMin + swimMin + bikeMin, runMin, swimMin, bikeMin };
}

/**
 * One week's rows from the engine under `settings`, or [] when the week is outside the season.
 * History, targets, the single-run cap and strength prescriptions are read at generation time.
 * With `kept` rows (a partial rebuild), the targets are first reduced by their minutes
 * (remainingTargets); the caller keeps only the new rows on the days it is filling.
 */
async function generateWeek(
  db: Db,
  ws: string,
  settings: PlanSettings,
  cal: SeasonCalendar,
  today: string,
  tz: string,
  now: Date,
  kept: Row[] = [],
): Promise<Insert[]> {
  const week = cal.weeks.find((w) => w.weekStart === ws);
  if (!week) return [];
  const history = await loadWeekHistory(db, cal, week.index, today, tz);
  const full = weeklyTargets(cal, week.index, history, { jointStatus: settings.jointStatus });
  const targets = kept.length ? remainingTargets(full, kept) : full;
  // Ruling 6: the lookback ends the day before the week, or today for a future week.
  const lookbackEnd = addDays(ws, -1) < today ? addDays(ws, -1) : today;
  const drafts = buildWeek({
    weekStart: ws,
    weekIndex: week.index,
    phase: week.phase,
    recovery: week.recovery,
    targets,
    settings,
    longestRunMinLastLookback: await longestRunMin(db, lookbackEnd, tz),
    buildProgress: buildProgress(cal, week.index),
  });

  const allItems = drafts.flatMap((d) => itemsFor(d) ?? []);
  const hist = allItems.length ? await strengthHistory(db, allItems) : new Map<string, History>();
  const increments = allItems.length ? await exerciseIncrements(db) : new Map<string, number>();
  const taper = week.phase === "taper" || week.phase === "race";
  const meta: WeekMeta = { index: week.index, phase: week.phase, recovery: week.recovery, gainPhase: week.gainPhase };
  return drafts.map((d) => {
    const items = itemsFor(d);
    const details: Record<string, unknown> = { ...d.details, week: meta };
    if (items) {
      details.prescription = prescribe(items, hist, {
        recoveryWeek: week.recovery,
        taper,
        jointStatus: settings.jointStatus,
      }, increments);
    }
    // generated_at is the caller's clock, so provisional-week checks never depend on the DB clock.
    return { ...d, details, weekStart: ws, generatedAt: now };
  });
}

async function insertRows(db: Db, rows: Insert[]): Promise<number> {
  if (!rows.length) return 0;
  const inserted = await db
    .insert(plannedSessions)
    .values(rows)
    .onConflictDoNothing({ target: [plannedSessions.localDate, plannedSessions.slot] })
    .returning({ id: plannedSessions.id });
  return inserted.length;
}

/**
 * Deletes the replaceable planned rows from `from` (through `until`, when given) and regenerates
 * them under the current settings. Shared by regenerateFuture and the provisional-week rebuild.
 * - Deleted: local_date ≥ from, status 'planned', no completed_ref, only on days with no kept
 *   (done, skipped or completed) row, and only where `guard` holds. A partly done day stays as is.
 * - Regenerated: each week that lost rows, oldest first so each sees the one before it in its
 *   history; only days ≥ from (≤ until) that have no rows left are filled.
 * - Whole-week caps (final review A): the new layout is built from the week's targets less the
 *   minutes on the rows it keeps, so kept + new never exceeds the week's caps (when the kept rows
 *   alone exceed a target, nothing of that sport is added). The new layout still spans the whole
 *   week, and its sessions on days that are not being filled are dropped, which can only
 *   under-plan. A long session of a sport that the kept rows already hold is dropped too (one long
 *   session per sport per week), and in walk-run weeks a new run next to a kept run is dropped.
 * - recommendation_log rows pointing at the deleted sessions are deleted first: an ON DELETE SET
 *   NULL would collide on the (date, session, rule) unique key, which treats nulls as equal.
 */
async function replaceFrom(
  db: Db,
  from: string,
  until: string | null,
  guard: SQL | undefined,
  now: Date,
  tz: string,
): Promise<{ deleted: number; created: number }> {
  const today = localDate(now, tz);
  const deletable = and(
    gte(plannedSessions.localDate, from),
    until === null ? undefined : lte(plannedSessions.localDate, until),
    eq(plannedSessions.status, "planned"),
    isNull(plannedSessions.completedRef),
    sql`not exists (select 1 from ${plannedSessions} k where k.local_date = ${plannedSessions.localDate} and (k.status <> 'planned' or k.completed_ref is not null))`,
    guard,
  );
  await db
    .delete(recommendationLog)
    .where(inArray(recommendationLog.plannedSessionId, db.select({ id: plannedSessions.id }).from(plannedSessions).where(deletable)));
  const deleted = await db.delete(plannedSessions).where(deletable).returning({ weekStart: plannedSessions.weekStart });
  if (!deleted.length) return { deleted: 0, created: 0 };

  const settings = await getPlanSettings(db, now, tz);
  const cal = seasonCalendar(settings);
  const weeks = [...new Set(deleted.map((d) => d.weekStart))].sort();
  let created = 0;
  const { walkRunWeeks } = RULES["volume.run"].params;
  for (const ws of weeks) {
    const keptRows = await rowsOfWeek(db, ws);
    const keptDates = new Set(keptRows.map((r) => r.localDate));
    const keptLong = new Set(keptRows.filter((r) => isEndurance(r.kind) && isLong(r)).map((r) => r.kind));
    const keptRunDates = keptRows.filter((r) => r.kind === "run").map((r) => r.localDate);
    const walkRun = (cal.weeks.find((w) => w.weekStart === ws)?.index ?? walkRunWeeks) < walkRunWeeks;
    const rows = (await generateWeek(db, ws, settings, cal, today, tz, now, keptRows)).filter(
      (r) =>
        r.localDate >= from &&
        (until === null || r.localDate <= until) &&
        !keptDates.has(r.localDate) &&
        // One long session per sport per week: a long session already kept is not repeated.
        !(isLong(r) && keptLong.has(r.kind)) &&
        // Walk-run weeks never run on consecutive days, kept runs included.
        !(walkRun && r.kind === "run" && keptRunDates.some((d) => d === addDays(r.localDate, -1) || d === addDays(r.localDate, 1))),
    );
    created += await insertRows(db, rows);
  }
  return { deleted: deleted.length, created };
}

/**
 * Generates and stores the week starting `weekStart` if it has no rows yet. A week whose last
 * day is before today is never generated; the current week is generated whole (past days too)
 * only when none of it exists. Idempotent via `on conflict (local_date, slot) do nothing`.
 *
 * Rulings 15a and 16a: a week generated before its own Monday (a preview) is PROVISIONAL,
 * because its history used planned minutes for the unfinished week before it. Once today ≥
 * weekStart, a provisional week is rebuilt from true actuals, but only its days ≥ today, and only
 * while every row in the week was generated before local midnight of weekStart, is still
 * 'planned' and has no completed_ref. Past days are never rewritten. The rebuilt rows carry a
 * newer generated_at, so the week is rebuilt at most once.
 */
export async function ensureWeek(db: Db, weekStart: string, now: Date, tz: string): Promise<void> {
  const today = localDate(now, tz);
  if (weekEnd(weekStart) < today) return;
  const inWeek = and(gte(plannedSessions.localDate, weekStart), lte(plannedSessions.localDate, weekEnd(weekStart)));
  const [existing] = await db.select({ id: plannedSessions.id }).from(plannedSessions).where(inWeek).limit(1);
  if (existing) {
    if (today < weekStart) return;
    const monday = new Date(zonedLocalToUtc(`${weekStart}T00:00`, tz));
    const provisional = sql`not exists (select 1 from ${plannedSessions} k where k.local_date between ${weekStart} and ${weekEnd(weekStart)} and (k.status <> 'planned' or k.completed_ref is not null or k.generated_at >= ${monday.toISOString()}::timestamptz))`;
    await replaceFrom(db, today, weekEnd(weekStart), provisional, now, tz);
    return;
  }
  const settings = await getPlanSettings(db, now, tz);
  const rows = await generateWeek(db, weekStart, settings, seasonCalendar(settings), today, tz, now);
  await insertRows(db, rows);
}

/**
 * After a settings change (call it after updatePlanSettings): deletes future planned rows and
 * regenerates them under the new settings (see replaceFrom). fromDate is clamped to today, so
 * past rows are never touched, and today's completions are marked first so a session already
 * done today is kept.
 */
export async function regenerateFuture(
  db: Db,
  fromDate: string,
  now: Date,
  tz: string,
): Promise<{ deleted: number; created: number }> {
  const today = localDate(now, tz);
  await markCompletion(db, today, tz);
  return replaceFrom(db, fromDate < today ? today : fromDate, null, undefined, now, tz);
}

/** Planned sessions for one day, in slot order. */
async function rowsOfDay(db: Db, date: string): Promise<Row[]> {
  return db.select().from(plannedSessions).where(eq(plannedSessions.localDate, date)).orderBy(asc(plannedSessions.slot));
}

/**
 * Marks planned swim/bike/run/strength sessions on `date` done when a matching activity exists:
 * a cardio_entries row of the same kind ("cardio:<id>"), a finished strength_session
 * ("strength:<id>"), or else an unlinked WHOOP workout that started that local day (by its own
 * offset, else `tz`) with a sport from link-whoop's SPORTS list ("whoop:<id>"). Generic WHOOP
 * "activity" never completes a session, and a WHOOP workout overlapping a logged entry of its own
 * kind is skipped (it is that entry, recorded twice). Each activity completes at most one
 * session. Returns how many sessions were newly marked.
 */
export async function markCompletion(db: Db, date: string, tz: string): Promise<number> {
  // A manual check is open too: a matching activity upgrades it to a real ref.
  const open = (await rowsOfDay(db, date)).filter(
    (r) => (r.status === "planned" || r.completedManual) && r.completedRef === null && (LINK_KINDS as string[]).includes(r.kind),
  );
  if (!open.length) return 0;

  const cardio = await db
    .select({ id: cardioEntries.id, kind: cardioEntries.kind, startedAt: cardioEntries.startedAt, durationS: cardioEntries.durationS })
    .from(cardioEntries)
    .where(eq(cardioEntries.localDate, date))
    .orderBy(asc(cardioEntries.startedAt));
  const lifts = await db
    .select({ id: strengthSessions.id, startedAt: strengthSessions.startedAt, endedAt: strengthSessions.endedAt })
    .from(strengthSessions)
    .where(and(eq(strengthSessions.localDate, date), sql`${strengthSessions.endedAt} is not null`))
    .orderBy(asc(strengthSessions.startedAt));
  const dayMs = Date.parse(`${date}T00:00:00Z`);
  const whoop = (
    await db
      .select({ id: workouts.id, start: workouts.start, end: workouts.end, offset: workouts.timezoneOffset, sport: workouts.sportName })
      .from(workouts)
      .where(
        and(
          gte(workouts.start, new Date(dayMs - MS_PER_DAY)),
          lt(workouts.start, new Date(dayMs + 2 * MS_PER_DAY)),
          sql`not exists (select 1 from ${cardioEntries} where ${cardioEntries.whoopWorkoutId} = ${workouts.id})`,
          sql`not exists (select 1 from ${strengthSessions} where ${strengthSessions.whoopWorkoutId} = ${workouts.id})`,
          notDismissed,
        ),
      )
      .orderBy(asc(workouts.start))
  ).filter((w) => localDateAtOffset(w.start, w.offset, tz) === date);
  const logged: Span[] = [
    ...cardio.map((c) => ({ kind: c.kind, start: c.startedAt, end: new Date(c.startedAt.getTime() + c.durationS * 1000) })),
    ...lifts.map((l) => ({ kind: "strength" as const, start: l.startedAt, end: l.endedAt ?? l.startedAt })),
  ];
  const whoopFree = whoop.filter((w) => !overlapsLogged(w, logged));

  const candidates = (kind: LinkKind): string[] => [
    ...(kind === "strength"
      ? lifts.map((l) => `strength:${l.id}`)
      : cardio.filter((c) => c.kind === kind).map((c) => `cardio:${c.id}`)),
    ...whoopFree.filter((w) => w.sport !== null && whoopSports(kind).includes(w.sport)).map((w) => `whoop:${w.id}`),
  ];
  const all = [...new Set(LINK_KINDS.flatMap(candidates))];
  if (!all.length) return 0;
  const used = new Set(
    (
      await db
        .select({ ref: plannedSessions.completedRef })
        .from(plannedSessions)
        .where(inArray(plannedSessions.completedRef, all))
    ).map((r) => r.ref),
  );

  let marked = 0;
  for (const s of open) {
    const ref = candidates(s.kind as LinkKind).find((c) => !used.has(c));
    if (!ref) continue;
    const done = await db
      .update(plannedSessions)
      .set({ status: "done", completedRef: ref, completedManual: false })
      .where(
        and(
          eq(plannedSessions.id, s.id),
          or(eq(plannedSessions.status, "planned"), eq(plannedSessions.completedManual, true)),
          isNull(plannedSessions.completedRef),
        ),
      )
      .returning({ id: plannedSessions.id });
    if (done.length) {
      used.add(ref);
      marked++;
    }
  }
  return marked;
}

/**
 * Checks a session off by hand, or undoes a hand check. Checking needs a planned session on or
 * before `today`; unchecking only clears a manual check (a logged or WHOOP completion stays).
 * Each is one guarded update, so a refused call changes nothing.
 */
export async function setManualDone(db: Db, sessionId: string, done: boolean, today: string): Promise<"done" | "undone" | "refused"> {
  const changed = done
    ? await db
        .update(plannedSessions)
        .set({ status: "done", completedManual: true })
        .where(and(eq(plannedSessions.id, sessionId), eq(plannedSessions.status, "planned"), lte(plannedSessions.localDate, today)))
        .returning({ id: plannedSessions.id })
    : await db
        .update(plannedSessions)
        .set({ status: "planned", completedManual: false })
        .where(and(eq(plannedSessions.id, sessionId), eq(plannedSessions.completedManual, true), isNull(plannedSessions.completedRef)))
        .returning({ id: plannedSessions.id });
  if (!changed.length) return "refused";
  return done ? "done" : "undone";
}

/**
 * markCompletion for every day of the week starting `weekStart`, from its Monday through
 * `today` (clamped to the week's Sunday); a week that starts after today marks nothing. Returns
 * how many sessions were newly marked.
 */
export async function markCompletionThrough(db: Db, weekStart: string, today: string, tz: string): Promise<number> {
  let marked = 0;
  for (let d = weekStart; d <= today && d <= weekEnd(weekStart); d = addDays(d, 1)) marked += await markCompletion(db, d, tz);
  return marked;
}

/**
 * Ruling 14b: plyometric lines are served only while the adapted session still has
 * details.plyo === true. A session swapped to another kind (a lift, lower-leg block or core
 * turned into mobility or rest) serves no prescription.
 */
function servePrescription(stored: Row, s: AdaptedSession): AdaptedSession {
  const rx = s.details.prescription as { exercise: string }[] | undefined;
  if (!rx) return s;
  const details = { ...s.details };
  if (s.kind !== stored.kind) delete details.prescription;
  else if (s.kind === "strength" && details.plyo !== true) details.prescription = rx.filter((p) => !PLYO_NAMES.has(p.exercise));
  else return s;
  return { ...s, details };
}

/**
 * Read only: a past day's sessions exactly as stored, with no adaptation, completion marking,
 * week generation or rule logging. An empty list means nothing was planned that day.
 */
export async function storedDaySessions(db: Db, date: string): Promise<DaySession[]> {
  return (await rowsOfDay(db, date)).map((row) => ({
    ...toDraft(row),
    adjusted: false,
    reasons: [],
    id: row.id,
    status: row.status,
    completedRef: row.completedRef,
    completedManual: row.completedManual,
  }));
}

const NO_SESSION_CHANGED = "No session changed";
/** recommendation_log.adapted on a session row whose session was not changed. */
const UNCHANGED = { unchanged: true } as const;

/**
 * Read only: the sessions a day's logged rules changed, keyed by planned session id, with what
 * each became (null on rows logged before snapshots were kept) and the reasons. "Not enough data"
 * and session-less rows are not changes.
 */
export async function loggedChanges(
  db: Db,
  date: string,
): Promise<Map<string, { now: AdaptedSnapshot | null; reasons: { ruleId: string; text: string }[] }>> {
  const rows = await db
    .select()
    .from(recommendationLog)
    .where(eq(recommendationLog.localDate, date))
    .orderBy(asc(recommendationLog.createdAt), asc(recommendationLog.ruleId));
  const out = new Map<string, { now: AdaptedSnapshot | null; reasons: { ruleId: string; text: string }[] }>();
  for (const r of rows) {
    if (!r.plannedSessionId || r.effect === NOT_ENOUGH_DATA || r.effect === NO_SESSION_CHANGED) continue;
    if ((r.adapted as { unchanged?: boolean } | null)?.unchanged === true) continue;
    const entry = out.get(r.plannedSessionId) ?? { now: null, reasons: [] };
    entry.now ??= (r.adapted as AdaptedSnapshot | null) ?? null;
    entry.reasons.push({ ruleId: r.ruleId, text: r.effect });
    out.set(r.plannedSessionId, entry);
  }
  return out;
}

/**
 * Display only (nothing is written): a later day of the current week under today's pain hold or
 * restricted joint status. Runs show as easy rides and plyometrics are removed (adapt step 1
 * only, via applyPainHold), with the plyometric lines stripped from the prescription as on
 * today. Rows that are no longer 'planned' are shown as stored.
 */
export function holdDayView(stored: Row[], r: Pick<Readiness, "painHold" | "jointRestricted">): DaySession[] {
  const adapted = applyPainHold(stored.map(toDraft), r).sessions;
  return stored.map((row, i) => {
    const base = { id: row.id, status: row.status, completedRef: row.completedRef, completedManual: row.completedManual };
    if (row.status !== "planned") return { ...toDraft(row), adjusted: false, reasons: [], ...base };
    const s = servePrescription(row, adapted[i]);
    return { ...s, ...base, ...(s.adjusted ? { before: snapshotOf(toDraft(row)) } : {}) };
  });
}

/**
 * The day's sessions after daily adaptation, plus readiness. Marks this week's completions
 * through today, makes sure the week exists, adapts at read time (nothing is written back to
 * planned_sessions) and, for today only, logs each rule that fired: one row per (session,
 * rule) from the sessions' reasons, and a session-less row for a fired rule no session cites.
 * Rows are upserted on the unique key (effect and inputs refreshed), so re-reading adds no
 * duplicates; "not enough data" rows for the day are removed once readiness is known.
 */
export async function getDayPlan(
  db: Db,
  date: string,
  now: Date,
  tz: string,
): Promise<{ sessions: DaySession[]; readiness: Readiness }> {
  const today = localDate(now, tz);
  const thisWeek = weekStartOf(today);
  // Completions first, so a session done earlier this week blocks a provisional rebuild; then
  // again, so a session generated just now can be matched (Ruling 16a). On a Monday, yesterday
  // closes last week and is marked too.
  await markCompletionThrough(db, thisWeek, today, tz);
  if (addDays(today, -1) < thisWeek) await markCompletion(db, addDays(today, -1), tz);
  await ensureWeek(db, weekStartOf(date), now, tz);
  await markCompletionThrough(db, thisWeek, today, tz);

  const stored = await rowsOfDay(db, date);
  const settings = await getPlanSettings(db, now, tz);
  const r = readiness(await loadDayInputs(db, date, tz, settings));
  const adapted = adapt(stored.map(toDraft), r).sessions;
  const sessions: DaySession[] = adapted.map((s, i) => ({
    ...servePrescription(stored[i], s),
    id: stored[i].id,
    status: stored[i].status,
    completedRef: stored[i].completedRef,
    completedManual: stored[i].completedManual,
    ...(s.adjusted ? { before: snapshotOf(toDraft(stored[i])) } : {}),
  }));

  if (date === today) {
    const inputsOf = (ruleId: string) => {
      const f = r.fired.filter((x) => x.ruleId === ruleId).map((x) => x.inputs);
      return f.length === 1 ? f[0] : f.length ? { entries: f } : {};
    };
    const logs: (typeof recommendationLog.$inferInsert)[] = [];
    const cited = new Set<string>();
    for (const s of sessions) {
      const byRule = new Map<string, string[]>();
      for (const x of s.reasons) byRule.set(x.ruleId, [...(byRule.get(x.ruleId) ?? []), x.text]);
      // What the session became, kept so a past day can still show its before/now view. A note
      // that changed nothing says so, so it is never mistaken for a row logged before snapshots.
      const adapted: AdaptedSnapshot | typeof UNCHANGED = s.adjusted ? snapshotOf(s) : UNCHANGED;
      for (const [ruleId, texts] of byRule) {
        cited.add(ruleId);
        logs.push({ localDate: date, plannedSessionId: s.id, ruleId, inputs: inputsOf(ruleId), effect: texts.join(" · "), adapted });
      }
    }
    for (const ruleId of new Set(r.fired.map((f) => f.ruleId))) {
      if (!cited.has(ruleId)) {
        logs.push({ localDate: date, plannedSessionId: null, ruleId, inputs: inputsOf(ruleId), effect: NO_SESSION_CHANGED });
      }
    }
    // Ruling 15b: re-reading refreshes a row's effect and inputs (e.g. once recovery is scored).
    if (logs.length) {
      await db
        .insert(recommendationLog)
        .values(logs)
        .onConflictDoUpdate({
          target: [recommendationLog.localDate, recommendationLog.plannedSessionId, recommendationLog.ruleId],
          set: { effect: sql`excluded.effect`, inputs: sql`excluded.inputs`, adapted: sql`excluded.adapted` },
        });
    }
    // A "not enough data" row no longer applies once readiness is known; a scored day cites
    // other rules for that session, so the upsert alone would leave the stale row behind.
    if (r.color !== "unknown") {
      await db
        .delete(recommendationLog)
        .where(and(eq(recommendationLog.localDate, date), eq(recommendationLog.effect, NOT_ENOUGH_DATA)));
    }
  }
  return { sessions, readiness: r };
}

/**
 * The 7 days of the week starting `weekStart`, each with its stored sessions and status. Marks
 * the week's completions through today first.
 */
export async function getWeekPlan(
  db: Db,
  weekStart: string,
  now: Date,
  tz: string,
): Promise<{ date: string; sessions: Row[] }[]> {
  // Completions before ensureWeek, so a session done this week blocks a provisional rebuild.
  await markCompletionThrough(db, weekStart, localDate(now, tz), tz);
  await ensureWeek(db, weekStart, now, tz);
  const rows = await rowsOfWeek(db, weekStart);
  return Array.from({ length: DAYS_PER_WEEK }, (_, i) => {
    const date = addDays(weekStart, i);
    return { date, sessions: rows.filter((r) => r.localDate === date) };
  });
}

const SCORED = "SCORED";

/**
 * Read only: today's strain target band (rule strain.dailyTarget) for `sessions`, learned from
 * the last lookbackDays of stored plans. A past day counts when every planned workout was done
 * (by a log, WHOOP or a check; a missed or skipped one would make it look like a lighter day of
 * that type) and it has a scored WHOOP cycle; its strain is the cycle running at local noon (the cycle
 * that began with the night before).
 */
export async function getStrainTarget(
  db: Db,
  date: string,
  sessions: readonly { kind: string; intensity: string; durationMin: number; details: Record<string, unknown> }[],
  tz: string,
): Promise<StrainTarget> {
  const { lookbackDays } = RULES["strain.dailyTarget"].params;
  const from = addDays(date, -lookbackDays);
  const to = addDays(date, -1);
  const rows = await db
    .select()
    .from(plannedSessions)
    .where(and(gte(plannedSessions.localDate, from), lte(plannedSessions.localDate, to)));
  const cycleRows = await db
    .select({ start: cycles.start, scoreState: cycles.scoreState, strain: cycles.strain })
    .from(cycles)
    .where(and(gte(cycles.start, new Date(noonOf(addDays(from, -1), tz))), lte(cycles.start, noonOf(to, tz))))
    .orderBy(asc(cycles.start));

  const byDay = new Map<string, Row[]>();
  for (const r of rows) byDay.set(r.localDate, [...(byDay.get(r.localDate) ?? []), r]);
  const history: { type: DayType; strain: number }[] = [];
  for (const [day, dayRows] of byDay) {
    if (dayRows.some((r) => r.kind !== "rest" && r.status !== "done" && r.completedRef === null)) continue;
    const noon = noonOf(day, tz).getTime();
    const cycle = cycleRows.filter((c) => c.start.getTime() <= noon).at(-1);
    if (!cycle || cycle.scoreState !== SCORED || cycle.strain === null) continue;
    history.push({ type: dayType(dayRows.map((r) => ({ ...r, details: r.details as Record<string, unknown> }))), strain: cycle.strain });
  }
  return strainTarget(dayType(sessions), history);
}

const LIFT_KINDS = new Set(["strength", "lower_leg", "core"]);

/**
 * Today's planned lifting, for a workout logged today: the prescription lines of today's adapted
 * strength, lower-leg and core sessions in slot order. A session already completed by a log or
 * WHOOP is skipped; a hand check is not (logging it is how the check gets its details). Any
 * other day gets none: a workout opened later is shown as logged, with no plan to fill in.
 *
 * The stored lines keep their sets and range, but the suggested weight is re-derived from each
 * lift's latest session before `currentSessionId` (a week's prescriptions are fixed when it is
 * built, and the two upper days share lifts). Never throws: logging must work without a plan.
 */
export async function todayPrescription(
  db: Db,
  sessionLocalDate: string,
  now: Date,
  tz: string,
  currentSessionId?: string,
): Promise<Prescription[]> {
  try {
    if (sessionLocalDate !== localDate(now, tz)) return [];
    const { sessions } = await getDayPlan(db, sessionLocalDate, now, tz);
    const lines = sessions
      .filter((s) => LIFT_KINDS.has(s.kind) && s.completedRef === null)
      .flatMap((s) => (s.details.prescription as Prescription[] | undefined) ?? []);
    const byName = await ensureExercisesByName(db, lines.map((p) => p.exercise));
    const increments = await exerciseIncrements(db);
    const out: Prescription[] = [];
    for (const p of lines) {
      if (!p.ruleIds.includes("strength.progression")) {
        out.push(p);
        continue;
      }
      const history = await lastTime(db, byName.get(p.exercise)!.id, currentSessionId);
      const increment = increments.get(p.exercise) ?? RULES["strength.progression"].params.defaultIncrementLb;
      out.push({ ...p, ...suggestLoad(p.repRange, history, increment) });
    }
    return out;
  } catch (err) {
    console.error("todayPrescription failed:", err);
    return [];
  }
}
