import { RULES } from "@/lib/engine/rules/catalog";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, asc, eq, gte, lt } from "drizzle-orm";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import {
  cardioEntries,
  cycles,
  exercises,
  painEntries,
  plannedSessions,
  planSettings,
  recommendationLog,
  recoveries,
  sleeps,
  strengthSessions,
  strengthSets,
  workouts,
} from "@/db/schema";
import { NOT_ENOUGH_DATA } from "@/lib/engine/adapt";
import { addDays, localDate, weekStart, zonedLocalToUtc } from "@/lib/log/dates";
import { ensureDefaultExercises } from "@/lib/log/strength";
import { dismissWorkout } from "@/lib/log/log-boxes";
import { getPlanSettings, updatePlanSettings } from "./settings";
import { seasonCalendar, weeklyTargets } from "@/lib/engine/season";
import { loadDayInputs, loadWeekHistory, longestRunMin } from "./inputs";
import {
  ensureWeek,
  getDayPlan,
  getStrainTarget,
  loggedChanges,
  getWeekPlan,
  holdDayView,
  markCompletion,
  markCompletionThrough,
  regenerateFuture,
  remainingTargets,
  setManualDone,
  storedDaySessions,
  todayPrescription,
} from "./service";

// All values below are invented test data.
const TZ = "America/Chicago";
// Wednesday 2026-10-21, noon in Chicago (CDT).
const NOW = new Date("2026-10-21T17:00:00Z");
const TODAY = "2026-10-21";
const THIS_WEEK = "2026-10-19";
const NEXT_WEEK = "2026-10-26";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await db.delete(recommendationLog);
  await db.delete(plannedSessions);
  await db.delete(planSettings);
  await db.delete(recoveries);
  await db.delete(cycles);
  await db.delete(sleeps);
  await db.delete(painEntries);
  await db.delete(cardioEntries);
  await db.delete(strengthSets);
  await db.delete(strengthSessions);
  await db.delete(workouts);
  await db.delete(exercises);
});

/** Settings with the season started two weeks before NOW (week index 1 is the current week). */
async function setup(patch: Parameters<typeof updatePlanSettings>[1] = {}) {
  await getPlanSettings(db, NOW, TZ);
  return updatePlanSettings(db, { seasonStart: "2026-10-12", ...patch });
}

const rowsBetween = (from: string, toExclusive: string) =>
  db
    .select()
    .from(plannedSessions)
    .where(and(gte(plannedSessions.localDate, from), lt(plannedSessions.localDate, toExclusive)))
    .orderBy(asc(plannedSessions.localDate), asc(plannedSessions.slot));

type WeekMeta = { index: number; phase: string; recovery: boolean; gainPhase: boolean };
const weekMeta = (r: { details: unknown }) => (r.details as { week: WeekMeta }).week;

/** One scored recovery for owner-local day `day` (its cycle starts at 22:00 the evening before). */
async function seedRecovery(id: number, day: string, hrv: number, score = 70, rhr = 52) {
  await db.insert(cycles).values({
    id,
    start: new Date(zonedLocalToUtc(`${addDays(day, -1)}T22:00`, TZ)),
    end: null,
    timezoneOffset: "-05:00",
    scoreState: "SCORED",
    strain: 8,
  });
  await db.insert(recoveries).values({
    cycleId: id,
    sleepId: `sleep-${id}`,
    scoreState: "SCORED",
    recoveryScore: score,
    rhr,
    hrvRmssdMs: hrv,
  });
}

describe("ensureWeek", () => {
  it("is idempotent: a second call gives exactly the same rows", async () => {
    await setup();
    await ensureWeek(db, THIS_WEEK, NOW, TZ);
    const a = await rowsBetween(THIS_WEEK, NEXT_WEEK);
    expect(a.length).toBeGreaterThan(7);
    expect(a.filter((r) => r.kind === "rest").map((r) => r.localDate)).toEqual([THIS_WEEK]);
    expect(a.every((r) => r.weekStart === THIS_WEEK)).toBe(true);
    await ensureWeek(db, THIS_WEEK, NOW, TZ);
    const b = await rowsBetween(THIS_WEEK, NEXT_WEEK);
    expect(b).toEqual(a);
  });

  it("never generates a week that has already ended", async () => {
    await setup();
    await ensureWeek(db, "2026-10-12", NOW, TZ);
    expect(await rowsBetween("2026-10-12", THIS_WEEK)).toHaveLength(0);
  });

  it("stores the week's phase and a strength prescription from last-time history", async () => {
    await setup();
    await ensureDefaultExercises(db);
    const [legPress] = await db.select().from(exercises).where(eq(exercises.name, "Leg Press"));
    const [s] = await db
      .insert(strengthSessions)
      .values({
        startedAt: new Date("2026-10-14T12:00:00Z"),
        endedAt: new Date("2026-10-14T13:00:00Z"),
        localDate: "2026-10-14",
      })
      .returning();
    await db.insert(strengthSets).values(
      [0, 1, 2].map((i) => ({
        clientId: crypto.randomUUID(),
        sessionId: s.id,
        exerciseId: legPress.id,
        setIndex: i,
        reps: 12,
        weightLb: 200,
        completedAt: new Date("2026-10-14T12:30:00Z"),
      })),
    );
    await ensureWeek(db, THIS_WEEK, NOW, TZ);
    const rows = await rowsBetween(THIS_WEEK, NEXT_WEEK);
    expect(rows.every((r) => weekMeta(r).index === 1 && weekMeta(r).phase === "base")).toBe(true);
    const lower = rows.find((r) => r.kind === "strength" && (r.details as { template: string }).template === "lower");
    expect(lower).toBeDefined();
    const rx = (lower!.details as { prescription: { exercise: string; targetWeightLb: number | null }[] })
      .prescription;
    expect(rx.find((p) => p.exercise === "Leg Press")?.targetWeightLb).toBe(205); // 2.5% of 200 lb, in 5 lb increments (strength.progression)
    // Joint status "caution" (the default) allows no plyometrics.
    expect(rx.some((p) => p.exercise === "Box Jump")).toBe(false);
  });

  it("uses an exercise's own increment in the prescription", async () => {
    await setup();
    await ensureDefaultExercises(db);
    await db.update(exercises).set({ incrementLb: 2.5 }).where(eq(exercises.name, "Leg Press"));
    const [legPress] = await db.select().from(exercises).where(eq(exercises.name, "Leg Press"));
    const [s] = await db
      .insert(strengthSessions)
      .values({ startedAt: new Date("2026-10-14T12:00:00Z"), endedAt: new Date("2026-10-14T13:00:00Z"), localDate: "2026-10-14" })
      .returning();
    await db.insert(strengthSets).values(
      [0, 1, 2].map((i) => ({
        clientId: crypto.randomUUID(), sessionId: s.id, exerciseId: legPress.id, setIndex: i, reps: 10, weightLb: 40,
        completedAt: new Date("2026-10-14T12:30:00Z"),
      })),
    );
    await ensureWeek(db, THIS_WEEK, NOW, TZ);
    const lower = (await rowsBetween(THIS_WEEK, NEXT_WEEK)).find(
      (r) => r.kind === "strength" && (r.details as { template: string }).template === "lower",
    )!;
    const rx = (lower.details as { prescription: { exercise: string; targetWeightLb: number | null }[] }).prescription;
    // 2.5% of 40 lb is 1 lb, so one 2.5 lb increment (a 5 lb default would be 12.5%).
    expect(rx.find((p) => p.exercise === "Leg Press")?.targetWeightLb).toBe(42.5);
  });

  it("caps single runs from the longest logged run in the lookback (Ruling 6)", async () => {
    // Nine weeks in, so NEXT_WEEK is past walk-run (walk-run sessions aren't capped).
    await setup({ seasonStart: "2026-08-24" });
    await db.insert(cardioEntries).values({
      kind: "run",
      startedAt: new Date("2026-10-15T12:00:00Z"),
      localDate: "2026-10-15",
      durationS: 10 * 60,
    });
    await ensureWeek(db, NEXT_WEEK, NOW, TZ);
    const runs = (await rowsBetween(NEXT_WEEK, addDays(NEXT_WEEK, 7))).filter((r) => r.kind === "run");
    expect(runs.length).toBeGreaterThan(0);
    // 10 min × 1.1 is 11, but the cap never drops below volume.run.longRunCapFloorMin.
    const floor = RULES["volume.run"].params.longRunCapFloorMin;
    expect(Math.max(...runs.map((r) => r.durationMin))).toBeLessThanOrEqual(floor);
    const long = runs.find((r) => (r.details as { long?: boolean }).long)!;
    expect((long.details as { longRunCap?: { capMin: number } }).longRunCap?.capMin).toBe(floor);
  });
});

describe("regenerateFuture after a race-date change (Review Focus 2)", () => {
  it("keeps past and done rows, regenerates the future, and shrinks the gain phase", async () => {
    await setup();
    await ensureWeek(db, THIS_WEEK, NOW, TZ);
    await ensureWeek(db, NEXT_WEEK, NOW, TZ);
    const thursday = "2026-10-22";
    await db
      .update(plannedSessions)
      .set({ status: "done", completedRef: "cardio:invented" })
      .where(and(eq(plannedSessions.localDate, thursday), eq(plannedSessions.slot, 0)));

    const datesBefore = new Set((await rowsBetween(THIS_WEEK, addDays(NEXT_WEEK, 7))).map((r) => r.localDate));
    const pastBefore = await rowsBetween(THIS_WEEK, TODAY);
    const thursdayBefore = await rowsBetween(thursday, addDays(thursday, 1));
    const futureBefore = await rowsBetween(TODAY, addDays(NEXT_WEEK, 7));
    expect(pastBefore.every((r) => weekMeta(r).gainPhase && weekMeta(r).phase === "base")).toBe(true);
    expect(futureBefore.every((r) => weekMeta(r).gainPhase)).toBe(true);

    // Reading today first leaves recommendation_log rows on today's sessions.
    await getDayPlan(db, TODAY, NOW, TZ);
    expect((await db.select().from(recommendationLog)).length).toBeGreaterThan(0);

    // 20-week season: build starts at week 1, so the gain phase is week 0 only.
    await updatePlanSettings(db, { raceDate: "2027-02-28" });
    const res = await regenerateFuture(db, TODAY, NOW, TZ);
    expect(res.deleted).toBeGreaterThan(0);
    expect(res.created).toBeGreaterThan(0);

    expect(await rowsBetween(THIS_WEEK, TODAY)).toEqual(pastBefore);
    expect(await rowsBetween(thursday, addDays(thursday, 1))).toEqual(thursdayBefore);

    const regenerated = (await rowsBetween(TODAY, addDays(NEXT_WEEK, 7))).filter(
      (r) => r.localDate !== thursday,
    );
    const oldIds = new Set(futureBefore.map((r) => r.id));
    expect(regenerated.length).toBeGreaterThan(0);
    expect(regenerated.every((r) => !oldIds.has(r.id))).toBe(true);
    expect(regenerated.every((r) => weekMeta(r).gainPhase === false)).toBe(true);
    expect(regenerated.every((r) => weekMeta(r).phase === "build")).toBe(true);
    // Both weeks still cover the same days (the engine may leave a day empty).
    const dates = new Set((await rowsBetween(THIS_WEEK, addDays(NEXT_WEEK, 7))).map((r) => r.localDate));
    expect(dates.size).toBeGreaterThanOrEqual(datesBefore.size - 1);
    expect(dates.has(TODAY) && dates.has(NEXT_WEEK)).toBe(true);
  });
});

describe("loadDayInputs", () => {
  it("gives no HRV baseline with only 20 days of recoveries", async () => {
    const settings = await setup();
    for (let k = 0; k < 20; k++) await seedRecovery(1000 + k, addDays(TODAY, -k), 50 + (k % 5));
    const d = await loadDayInputs(db, TODAY, TZ, settings);
    expect(d.hrvBaseline).toBeNull();
    expect(d.hrvLn7).not.toBeNull();
    expect(d.recoveryScore).toBe(70);
    expect(d.recentScores).toHaveLength(7);
  });

  it("gives a baseline of 30-38 days with 45 days of recoveries, excluding the last 7", async () => {
    const settings = await setup();
    for (let k = 0; k < 45; k++) await seedRecovery(2000 + k, addDays(TODAY, -k), 50 + (k % 5));
    const d = await loadDayInputs(db, TODAY, TZ, settings);
    expect(d.hrvBaseline).not.toBeNull();
    expect(d.hrvBaseline!.days).toBeGreaterThanOrEqual(30);
    expect(d.hrvBaseline!.days).toBeLessThanOrEqual(38);
    expect(d.hrvBaseline!.sd).toBeGreaterThan(0);
  });

  it("sums 3 nights of (need - asleep) and passes 90 days of pain (Ruling 14a)", async () => {
    const settings = await setup();
    for (let k = 0; k < 3; k++) {
      const end = new Date(zonedLocalToUtc(`${addDays(TODAY, -k)}T06:30`, TZ));
      await db.insert(sleeps).values({
        id: `night-${k}`,
        start: new Date(end.getTime() - 7 * 3_600_000),
        end,
        timezoneOffset: "-05:00",
        nap: false,
        scoreState: "SCORED",
        asleepMin: 380,
        needBaselineMin: 450,
        needStrainMin: 10,
        needNapMin: 0,
        needDebtMin: 30,
      });
    }
    await db.insert(painEntries).values([
      { localDate: addDays(TODAY, -80), area: "knee", side: "left", score: 2, context: "daily" },
      { localDate: addDays(TODAY, -100), area: "knee", side: "left", score: 2, context: "daily" },
    ]);
    const d = await loadDayInputs(db, TODAY, TZ, settings);
    expect(d.sleepDebtMin3d).toBe(3 * (460 - 380));
    expect(d.pain).toHaveLength(1);
    expect(d.recoveryScore).toBeNull();
    expect(d.hrvLn7).toBeNull();
  });
});

describe("week boundaries in Chicago across the November DST change (Review Focus 5)", () => {
  it("Sunday 23:30 after the change is Sunday in week 2026-10-26", async () => {
    const at = new Date("2026-11-02T05:30:00Z"); // 23:30 CST, Sunday 2026-11-01
    await setup();
    expect(localDate(at, TZ)).toBe("2026-11-01");
    expect(weekStart(localDate(at, TZ))).toBe("2026-10-26");
    // A WHOOP run at 23:00 Sunday local (offset -06:00 after the change); Sunday is the long run.
    await db.insert(workouts).values({
      id: "w-sunday-run",
      start: new Date("2026-11-02T05:00:00Z"),
      end: new Date("2026-11-02T05:25:00Z"),
      timezoneOffset: "-06:00",
      sportName: "running",
      scoreState: "SCORED",
    });
    const plan = await getDayPlan(db, localDate(at, TZ), at, TZ);
    expect(plan.sessions.length).toBeGreaterThan(0);
    expect(plan.sessions.every((s) => s.localDate === "2026-11-01")).toBe(true);
    const rows = await rowsBetween("2026-11-01", "2026-11-02");
    expect(rows.every((r) => r.weekStart === "2026-10-26")).toBe(true);
    const run = rows.find((r) => r.kind === "run");
    expect(run?.status).toBe("done");
    expect(run?.completedRef).toBe("whoop:w-sunday-run");
  });

  it("Monday 00:30 is Monday in week 2026-11-02", async () => {
    const at = new Date("2026-11-02T06:30:00Z"); // 00:30 CST, Monday 2026-11-02
    await setup();
    expect(localDate(at, TZ)).toBe("2026-11-02");
    expect(weekStart(localDate(at, TZ))).toBe("2026-11-02");
    const plan = await getDayPlan(db, localDate(at, TZ), at, TZ);
    expect(plan.sessions.map((s) => s.kind)).toEqual(["rest"]);
    expect(plan.sessions[0].localDate).toBe("2026-11-02");
    const rows = await rowsBetween("2026-11-02", "2026-11-03");
    expect(rows.every((r) => r.weekStart === "2026-11-02")).toBe(true);
    const week = await getWeekPlan(db, "2026-11-02", at, TZ);
    expect(week.map((d) => d.date)).toEqual(Array.from({ length: 7 }, (_, i) => addDays("2026-11-02", i)));
  });
});

describe("getDayPlan", () => {
  it("with no recovery today follows the plan and says there is not enough data (Review Focus 1)", async () => {
    await setup();
    const plan = await getDayPlan(db, TODAY, NOW, TZ);
    const stored = await rowsBetween(TODAY, addDays(TODAY, 1));
    expect(plan.readiness.color).toBe("unknown");
    expect(plan.sessions).toHaveLength(stored.length);
    plan.sessions.forEach((s, i) => {
      expect(s.adjusted).toBe(false);
      expect(s.durationMin).toBe(stored[i].durationMin);
      expect(s.intensity).toBe(stored[i].intensity);
      expect(s.id).toBe(stored[i].id);
      expect(s.reasons).toContainEqual({ ruleId: "recovery.color", text: NOT_ENOUGH_DATA });
    });
  });

  it("writes no duplicate recommendation_log rows when the same day is read twice", async () => {
    await setup();
    await getDayPlan(db, TODAY, NOW, TZ);
    const first = await db.select().from(recommendationLog);
    expect(first.length).toBeGreaterThan(0);
    await getDayPlan(db, TODAY, NOW, TZ);
    const second = await db.select().from(recommendationLog);
    expect(second).toHaveLength(first.length);
    const keys = second.map((r) => `${r.localDate}|${r.plannedSessionId}|${r.ruleId}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(second.map((r) => r.id).sort()).toEqual(first.map((r) => r.id).sort());
  });

  it("serves plyometrics only while the adapted session keeps details.plyo (Ruling 14b)", async () => {
    await setup({ jointStatus: "unrestricted" });
    await ensureWeek(db, THIS_WEEK, NOW, TZ);
    const lower = (await rowsBetween(THIS_WEEK, NEXT_WEEK)).find(
      (r) => r.kind === "strength" && (r.details as { template: string }).template === "lower",
    )!;
    type Rx = { exercise: string }[];
    const servedLower = async () =>
      (await getDayPlan(db, lower.localDate, NOW, TZ)).sessions.find((s) => s.id === lower.id)!;

    const clean = await servedLower();
    expect(clean.details.plyo).toBe(true);
    expect((clean.details.prescription as Rx).some((p) => p.exercise === "Box Jump")).toBe(true);

    await db
      .insert(painEntries)
      .values({ localDate: lower.localDate, area: "knee", side: "left", score: 6, context: "daily" });
    const held = await servedLower();
    expect(held.details.plyo).toBeUndefined();
    expect((held.details.prescription as Rx).some((p) => p.exercise === "Box Jump")).toBe(false);
    expect((held.details.prescription as Rx).some((p) => p.exercise === "Leg Press")).toBe(true);
    // The stored row is never changed by adaptation.
    const [stored] = await db.select().from(plannedSessions).where(eq(plannedSessions.id, lower.id));
    expect(stored.details).toEqual(lower.details);
  });
});

describe("markCompletion", () => {
  it("marks a planned swim done when a swim is logged that day", async () => {
    await setup();
    await ensureWeek(db, THIS_WEEK, NOW, TZ);
    const swim = (await rowsBetween(THIS_WEEK, NEXT_WEEK)).find((r) => r.kind === "swim")!;
    const [entry] = await db
      .insert(cardioEntries)
      .values({
        kind: "swim",
        startedAt: new Date(zonedLocalToUtc(`${swim.localDate}T07:00`, TZ)),
        localDate: swim.localDate,
        durationS: 30 * 60,
      })
      .returning();
    expect(await markCompletion(db, swim.localDate, TZ)).toBe(1);
    const [after] = await db.select().from(plannedSessions).where(eq(plannedSessions.id, swim.id));
    expect(after.status).toBe("done");
    expect(after.completedRef).toBe(`cardio:${entry.id}`);
    expect(await markCompletion(db, swim.localDate, TZ)).toBe(0);
  });
});

describe("provisional weeks (Ruling 15a)", () => {
  const MONDAY_NOW = new Date("2026-10-26T13:00:00Z"); // 08:00 CDT, Monday 2026-10-26
  const nextWeekRows = () => rowsBetween(NEXT_WEEK, addDays(NEXT_WEEK, 7));
  const enduranceMin = (rows: { kind: string; durationMin: number }[]) =>
    rows.filter((r) => ["swim", "bike", "run"].includes(r.kind)).reduce((t, r) => t + r.durationMin, 0);
  /** Last week's actual: two invented 100-min rides, far under the plan. */
  const logLowWeek = () =>
    db.insert(cardioEntries).values(
      ["2026-10-20", "2026-10-23"].map((d) => ({
        kind: "bike" as const,
        startedAt: new Date(zonedLocalToUtc(`${d}T07:00`, TZ)),
        localDate: d,
        durationS: 100 * 60,
      })),
    );

  it("rebuilds a preview on its Monday, capped against last week's low actuals", async () => {
    await setup();
    await ensureWeek(db, THIS_WEEK, NOW, TZ);
    await ensureWeek(db, NEXT_WEEK, NOW, TZ); // previewed on Wednesday: provisional
    const preview = await nextWeekRows();
    // 200 actual minutes x (1 + 10%) = 220 is the cap once the actuals are in.
    expect(enduranceMin(preview)).toBeGreaterThan(220);

    await logLowWeek();
    await ensureWeek(db, NEXT_WEEK, MONDAY_NOW, TZ);
    const rebuilt = await nextWeekRows();
    const oldIds = new Set(preview.map((r) => r.id));
    expect(rebuilt.length).toBeGreaterThan(0);
    expect(rebuilt.every((r) => !oldIds.has(r.id))).toBe(true);
    expect(enduranceMin(rebuilt)).toBeGreaterThan(0);
    expect(enduranceMin(rebuilt)).toBeLessThanOrEqual(220);

    // Generated on its Monday, so it is no longer provisional.
    await ensureWeek(db, NEXT_WEEK, new Date("2026-10-27T13:00:00Z"), TZ);
    expect(await nextWeekRows()).toEqual(rebuilt);
  });

  it("does not rebuild a preview that has a done session", async () => {
    await setup();
    await ensureWeek(db, THIS_WEEK, NOW, TZ);
    await ensureWeek(db, NEXT_WEEK, NOW, TZ);
    const [first] = await nextWeekRows();
    await db
      .update(plannedSessions)
      .set({ status: "done", completedRef: "cardio:invented" })
      .where(eq(plannedSessions.id, first.id));
    const before = await nextWeekRows();
    await logLowWeek();
    await ensureWeek(db, NEXT_WEEK, MONDAY_NOW, TZ);
    expect(await nextWeekRows()).toEqual(before);
  });
});

describe("recommendation_log upsert (Ruling 15b)", () => {
  it("replaces 'not enough data' once today's recovery is scored", async () => {
    await setup();
    await getDayPlan(db, TODAY, NOW, TZ);
    expect((await db.select().from(recommendationLog)).some((r) => r.effect === NOT_ENOUGH_DATA)).toBe(true);

    await seedRecovery(3000, TODAY, 45, 50); // yellow
    await getDayPlan(db, TODAY, NOW, TZ);
    const rows = await db.select().from(recommendationLog);
    expect(rows.some((r) => r.effect === NOT_ENOUGH_DATA)).toBe(false);
    expect(rows.some((r) => r.ruleId === "recovery.yellowScale")).toBe(true);
    const color = rows.filter((r) => r.ruleId === "recovery.color");
    expect(color.length).toBeGreaterThan(0);
    expect(color.every((r) => (r.inputs as { color: string }).color === "yellow")).toBe(true);
  });

  it("refreshes inputs on the same (date, session, rule) key", async () => {
    await setup();
    const pain = (localDate: string, score: number) =>
      db.insert(painEntries).values({ localDate, area: "knee", side: "left", score, context: "daily" });
    await pain(addDays(TODAY, -1), 6);
    await getDayPlan(db, TODAY, NOW, TZ);
    const painRows = () =>
      db.select().from(recommendationLog).where(eq(recommendationLog.ruleId, "pain.monitoring"));
    const before = await painRows();
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((r) => (r.inputs as { over: { max: number } }).over.max === 6)).toBe(true);

    await pain(TODAY, 8);
    await getDayPlan(db, TODAY, NOW, TZ);
    const after = await painRows();
    expect(after.map((r) => r.id).sort()).toEqual(before.map((r) => r.id).sort());
    expect(after.every((r) => (r.inputs as { over: { max: number } }).over.max === 8)).toBe(true);
  });
});

describe("Ruling 16 fixes", () => {
  const at = (day: string, hhmm: string) => new Date(zonedLocalToUtc(`${day}T${hhmm}`, TZ));
  /** Hand-placed planned rows, so a test controls exactly what is on the day. */
  const plan = (day: string, kinds: ("swim" | "strength" | "run")[]) =>
    db.insert(plannedSessions).values(
      kinds.map((kind, slot) => ({
        localDate: day,
        slot,
        kind,
        title: kind,
        durationMin: 30,
        intensity: kind === "strength" ? ("strength" as const) : ("z2" as const),
        details: {},
        ruleIds: [],
        weekStart: weekStart(day),
      })),
    );
  const whoopAt = (id: string, sportName: string, start: Date, minutes: number) =>
    db.insert(workouts).values({
      id,
      start,
      end: new Date(start.getTime() + minutes * 60_000),
      timezoneOffset: "-05:00",
      sportName,
      scoreState: "SCORED",
    });

  it("(a) opening a previewed week mid-week leaves its past days exactly as they were", async () => {
    await setup();
    await ensureWeek(db, THIS_WEEK, NOW, TZ);
    await ensureWeek(db, NEXT_WEEK, NOW, TZ); // preview on Wednesday 2026-10-21
    const preview = await rowsBetween(NEXT_WEEK, addDays(NEXT_WEEK, 7));
    const wed = "2026-10-28";
    const openedAt = new Date("2026-10-28T17:00:00Z"); // its own Wednesday
    await getDayPlan(db, wed, openedAt, TZ);
    const after = await rowsBetween(NEXT_WEEK, addDays(NEXT_WEEK, 7));
    expect(after.filter((r) => r.localDate < wed)).toEqual(preview.filter((r) => r.localDate < wed));
    // Days from today on were rebuilt from actuals.
    const oldIds = new Set(preview.map((r) => r.id));
    const fromToday = after.filter((r) => r.localDate >= wed);
    expect(fromToday.length).toBeGreaterThan(0);
    expect(fromToday.every((r) => !oldIds.has(r.id))).toBe(true);
  });

  it("(a) a session done yesterday blocks the provisional rebuild", async () => {
    await setup();
    await ensureWeek(db, THIS_WEEK, NOW, TZ);
    await ensureWeek(db, NEXT_WEEK, NOW, TZ);
    const preview = await rowsBetween(NEXT_WEEK, addDays(NEXT_WEEK, 7));
    const tue = "2026-10-27";
    const target = preview.find((r) => r.localDate === tue && ["swim", "bike", "run"].includes(r.kind));
    expect(target).toBeDefined();
    const [entry] = await db
      .insert(cardioEntries)
      .values({ kind: target!.kind as "swim" | "bike" | "run", startedAt: at(tue, "07:00"), localDate: tue, durationS: 1800 })
      .returning();
    await getDayPlan(db, "2026-10-28", new Date("2026-10-28T17:00:00Z"), TZ);
    const after = await rowsBetween(NEXT_WEEK, addDays(NEXT_WEEK, 7));
    expect(after.map((r) => r.id)).toEqual(preview.map((r) => r.id));
    expect(after.find((r) => r.id === target!.id)?.completedRef).toBe(`cardio:${entry.id}`);
  });

  it("(b) a generic WHOOP activity completes neither a strength session nor a swim", async () => {
    await plan(TODAY, ["strength", "swim"]);
    await whoopAt("w-walk", "activity", at(TODAY, "07:00"), 45);
    expect(await markCompletion(db, TODAY, TZ)).toBe(0);
    const rows = await rowsBetween(TODAY, addDays(TODAY, 1));
    expect(rows.every((r) => r.status === "planned" && r.completedRef === null)).toBe(true);
  });

  it("(e) a WHOOP workout overlapping a same-kind entry completes nothing more", async () => {
    await plan(TODAY, ["swim", "swim"]);
    await db.insert(cardioEntries).values({ kind: "swim", startedAt: at(TODAY, "07:00"), localDate: TODAY, durationS: 1800 });
    await whoopAt("w-dup-swim", "swimming", at(TODAY, "07:05"), 30);
    expect(await markCompletion(db, TODAY, TZ)).toBe(1);
    const rows = await rowsBetween(TODAY, addDays(TODAY, 1));
    expect(rows.map((r) => r.completedRef?.split(":")[0] ?? null)).toEqual(["cardio", null]);
  });

  it("(c, e) history is exactly weekIndex long, padding no-data weeks and skipping duplicate WHOOP", async () => {
    const cal = seasonCalendar({ seasonStart: "2026-10-12", raceDate: "2027-10-17" });
    const empty = await loadWeekHistory(db, cal, 2, "2026-10-28", TZ);
    expect(empty).toEqual({ actualEnduranceMin: [300, 300], actualRunMin: [45, 45], strainRatio: [null, null] });

    // Week 1 (2026-10-19): a logged 30-min swim, the same swim on WHOOP, and a WHOOP walk.
    await db.insert(cardioEntries).values({ kind: "swim", startedAt: at("2026-10-20", "07:00"), localDate: "2026-10-20", durationS: 1800 });
    await whoopAt("w-dup", "swimming", at("2026-10-20", "07:02"), 30);
    await whoopAt("w-walk", "activity", at("2026-10-21", "18:00"), 60);
    const h = await loadWeekHistory(db, cal, 2, "2026-10-28", TZ);
    expect(h).toEqual({ actualEnduranceMin: [300, 30], actualRunMin: [45, 0], strainRatio: [null, null] });
  });

  it("a dismissed WHOOP run counts nowhere in the run history", async () => {
    const cal = seasonCalendar({ seasonStart: "2026-10-12", raceDate: "2027-10-17" });
    const longestBefore = await longestRunMin(db, TODAY, TZ);
    const before = await loadWeekHistory(db, cal, 2, "2026-10-28", TZ);
    await whoopAt("w-fake", "running", at("2026-10-20", "07:00"), 90);
    await dismissWorkout(db, "w-fake");
    expect(await longestRunMin(db, TODAY, TZ)).toBe(longestBefore);
    expect(await loadWeekHistory(db, cal, 2, "2026-10-28", TZ)).toEqual(before);
  });

  it("(d) the long-run lookback counts unlinked WHOOP runs, once", async () => {
    expect(await longestRunMin(db, TODAY, TZ)).toBeNull();
    await whoopAt("w-run", "running", at("2026-10-18", "07:00"), 25);
    expect(await longestRunMin(db, TODAY, TZ)).toBe(25);
    // A logged 20-min run overlapping a 40-min WHOOP run: the WHOOP copy is skipped.
    await db.insert(cardioEntries).values({ kind: "run", startedAt: at("2026-10-19", "07:00"), localDate: "2026-10-19", durationS: 1200 });
    await whoopAt("w-run-dup", "running", at("2026-10-19", "06:55"), 40);
    expect(await longestRunMin(db, TODAY, TZ)).toBe(25);
  });

  it("(e) logs recommendation rows only for today", async () => {
    await setup();
    await getDayPlan(db, addDays(TODAY, -1), NOW, TZ);
    await getDayPlan(db, addDays(TODAY, 1), NOW, TZ);
    expect(await db.select().from(recommendationLog)).toHaveLength(0);
  });
});

describe("whole-week caps after a partial rebuild (final review A)", () => {
  const ENDURANCE = ["swim", "bike", "run"];
  type R = { id: string; kind: string; durationMin: number; localDate: string; details: unknown };
  const sum = (rows: R[], kinds: string[]) =>
    rows.filter((r) => kinds.includes(r.kind)).reduce((t, r) => t + r.durationMin, 0);
  const weekRows = (ws: string) => rowsBetween(ws, addDays(ws, 7));
  /** weeklyTargets for week `ws` as the engine sees it at `now`. */
  async function targetsAt(ws: string, now: Date) {
    const settings = await getPlanSettings(db, now, TZ);
    const cal = seasonCalendar(settings);
    const week = cal.weeks.find((w) => w.weekStart === ws)!;
    const history = await loadWeekHistory(db, cal, week.index, localDate(now, TZ), TZ);
    return weeklyTargets(cal, week.index, history, { jointStatus: settings.jointStatus });
  }
  /**
   * Whole-week totals stay within the new targets; when the kept days alone already exceed a
   * target (a settings change can lower it below what is past), nothing new is added.
   */
  function expectWithinCaps(before: R[], after: R[], from: string, t: { runMin: number; enduranceMin: number }) {
    const kept = after.filter((r) => r.localDate < from);
    expect(kept).toEqual(before.filter((r) => r.localDate < from));
    const runAll = sum(after, ["run"]);
    const endAll = sum(after, ENDURANCE);
    // Kept rows count wherever they are in the week (partly done days ≥ from too).
    const keptAll = after.filter((r) => before.some((b) => b.id === r.id));
    const keptRun = sum(keptAll, ["run"]);
    const keptEnd = sum(keptAll, ENDURANCE);
    expect(runAll).toBeLessThanOrEqual(keptRun <= t.runMin ? t.runMin : keptRun);
    expect(endAll).toBeLessThanOrEqual(keptEnd <= t.enduranceMin ? t.enduranceMin : keptEnd);
    const longRuns = after.filter((r) => r.kind === "run" && (r.details as { long?: boolean }).long);
    expect(longRuns.length).toBeLessThanOrEqual(1);
    // These are walk-run weeks (index < volume.run.walkRunWeeks): never runs on consecutive days.
    const runDays = [...new Set(after.filter((r) => r.kind === "run").map((r) => r.localDate))].sort();
    expect(runDays.some((d, i) => i > 0 && addDays(runDays[i - 1], 1) === d)).toBe(false);
  }

  it("remainingTargets subtracts kept minutes per sport, floors at 0 and re-sums endurance", () => {
    const t = { enduranceMin: 100, runMin: 30, swimMin: 30, bikeMin: 40 };
    const kept = [
      { kind: "run" as const, durationMin: 25 },
      { kind: "bike" as const, durationMin: 50 },
      { kind: "strength" as const, durationMin: 45 },
    ];
    // 75 kept leaves 25 of endurance; the remainders (5 + 30 + 0 = 35) are scaled down to fit.
    expect(remainingTargets(t, kept)).toEqual({ enduranceMin: 24, runMin: 3, swimMin: 21, bikeMin: 0 });
  });

  it("remainingTargets caps the sports by the endurance left, not only per sport", () => {
    const t = { enduranceMin: 200, runMin: 0, swimMin: 100, bikeMin: 100 };
    const r = remainingTargets(t, [{ kind: "bike", durationMin: 150 }]);
    expect(r).toEqual({ enduranceMin: 50, runMin: 0, swimMin: 50, bikeMin: 0 });
    expect(150 + r.enduranceMin).toBeLessThanOrEqual(200);
  });

  it("remainingTargets: kept run over the run target adds no run and still fits the total", () => {
    const t = { enduranceMin: 100, runMin: 30, swimMin: 30, bikeMin: 40 };
    const r = remainingTargets(t, [{ kind: "run", durationMin: 40 }]);
    expect(r.runMin).toBe(0);
    expect(r.swimMin).toBeLessThanOrEqual(30);
    expect(r.bikeMin).toBeLessThanOrEqual(40);
    expect(r.enduranceMin).toBe(r.swimMin + r.bikeMin);
    expect(40 + r.enduranceMin).toBeLessThanOrEqual(100);
  });

  it("a provisional week opened on Friday after a low actual stays within its caps", async () => {
    await setup();
    await ensureWeek(db, THIS_WEEK, NOW, TZ);
    await ensureWeek(db, NEXT_WEEK, NOW, TZ); // preview: provisional
    const before = await weekRows(NEXT_WEEK);
    // Last week's invented actual: two 100-min rides and one 15-min run, under the plan.
    await db.insert(cardioEntries).values(
      (
        [
          ["2026-10-20", "bike", 100],
          ["2026-10-22", "run", 15],
          ["2026-10-23", "bike", 100],
        ] as const
      ).map(([d, kind, min]) => ({
        kind,
        startedAt: new Date(zonedLocalToUtc(`${d}T07:00`, TZ)),
        localDate: d,
        durationS: min * 60,
      })),
    );
    const fri = "2026-10-30";
    const openedAt = new Date("2026-10-30T17:00:00Z");
    await ensureWeek(db, NEXT_WEEK, openedAt, TZ);
    const after = await weekRows(NEXT_WEEK);
    expect(after.some((r) => r.localDate >= fri && ENDURANCE.includes(r.kind))).toBe(true);
    expectWithinCaps(before, after, fri, await targetsAt(NEXT_WEEK, openedAt));
  });

  it("a mid-week save after a kept ride longer than the new bike target stays within the endurance cap", async () => {
    await setup();
    await ensureWeek(db, THIS_WEEK, NOW, TZ);
    // An invented long ride done on Tuesday, above the week's whole bike target.
    const [tueBike] = (await weekRows(THIS_WEEK)).filter((r) => r.localDate === "2026-10-20" && r.kind === "bike");
    expect(tueBike).toBeDefined();
    await db.update(plannedSessions).set({ durationMin: 200, status: "done", completedRef: "cardio:invented" }).where(eq(plannedSessions.id, tueBike.id));
    const before = await weekRows(THIS_WEEK);
    await updatePlanSettings(db, { longRideDow: 4 });
    await regenerateFuture(db, TODAY, NOW, TZ);
    const after = await weekRows(THIS_WEEK);
    const t = await targetsAt(THIS_WEEK, NOW);
    expect(200).toBeGreaterThan(t.bikeMin);
    expect(sum(before.filter((r) => r.localDate < TODAY), ENDURANCE)).toBeLessThanOrEqual(t.enduranceMin);
    expectWithinCaps(before, after, TODAY, t);
  });

  for (const [initial, patch] of [
    [{ longRideDow: 1 }, { longRideDow: 5 }], // a long ride already done on Tuesday
    [{ longRunDow: 1 }, { longRunDow: 6 }], // a long run already done on Tuesday
    [{ restDow: 3 }, { restDow: 0 }],
    [{}, { longRideDow: 4 }],
    [{}, { longRunDow: 1 }], // the new long-run day (Tuesday) is already past
    [{}, { jointStatus: "unrestricted" as const }],
    [{}, { jointStatus: "restricted" as const }],
    [{}, { raceDate: "2027-02-28" }],
  ] as [Parameters<typeof updatePlanSettings>[1], Parameters<typeof updatePlanSettings>[1]][]) {
    it(`a mid-week settings save ${JSON.stringify(initial)} -> ${JSON.stringify(patch)} stays within the new caps`, async () => {
      await setup(initial);
      await ensureWeek(db, THIS_WEEK, NOW, TZ);
      const before = await weekRows(THIS_WEEK);
      await updatePlanSettings(db, patch);
      await regenerateFuture(db, TODAY, NOW, TZ);
      const after = await weekRows(THIS_WEEK);
      expect(after.some((r) => r.localDate >= TODAY)).toBe(true);
      expectWithinCaps(before, after, TODAY, await targetsAt(THIS_WEEK, NOW));
    });
  }
});

describe("holdDayView (final review B: Plan-tab future days under a hold)", () => {
  const hold = { painHold: { area: "knee", reason: "Knee: invented. Log your pain daily to clear this hold." }, jointRestricted: false };

  it("shows runs as rides and strips plyometric lines, without writing anything", async () => {
    await setup({ jointStatus: "unrestricted" });
    await ensureDefaultExercises(db);
    await ensureWeek(db, NEXT_WEEK, NOW, TZ);
    const stored = await rowsBetween(NEXT_WEEK, addDays(NEXT_WEEK, 7));
    const view = holdDayView(stored, hold);
    expect(stored.some((r) => r.kind === "run")).toBe(true);
    expect(view.some((v) => v.kind === "run")).toBe(false);
    const lower = view.find((v) => v.kind === "strength" && v.details.template === "lower")!;
    const storedLower = stored.find((r) => r.id === lower.id)!;
    expect((storedLower.details as { plyo?: boolean }).plyo).toBe(true);
    const names = (lower.details.prescription as { exercise: string }[]).map((p) => p.exercise);
    expect(names).not.toContain("Box Jump");
    expect(view.filter((v) => v.details.swappedFrom === "run").every((v) => v.adjusted && v.reasons.length > 0)).toBe(true);
    expect(await rowsBetween(NEXT_WEEK, addDays(NEXT_WEEK, 7))).toEqual(stored);
  });

  it("leaves a done row and every row without a hold as stored", async () => {
    await setup();
    await ensureWeek(db, NEXT_WEEK, NOW, TZ);
    const stored = await rowsBetween(NEXT_WEEK, addDays(NEXT_WEEK, 7));
    const run = stored.find((r) => r.kind === "run")!;
    const rows = stored.map((r) => (r.id === run.id ? { ...r, status: "done" as const } : r));
    expect(holdDayView(rows, hold).find((v) => v.id === run.id)!.kind).toBe("run");
    const none = holdDayView(stored, { painHold: null, jointRestricted: false });
    expect(none.map((v) => [v.id, v.kind, v.durationMin, v.adjusted])).toEqual(stored.map((r) => [r.id, r.kind, r.durationMin, false]));
  });
});

describe("markCompletionThrough (final review E)", () => {
  const swimRow = (day: string) => ({
    localDate: day,
    slot: 0,
    kind: "swim" as const,
    title: "Easy swim",
    durationMin: 30,
    intensity: "z2" as const,
    details: {},
    ruleIds: [],
    weekStart: weekStart(day),
  });
  const logSwim = (day: string) =>
    db.insert(cardioEntries).values({
      kind: "swim",
      startedAt: new Date(zonedLocalToUtc(`${day}T07:00`, TZ)),
      localDate: day,
      durationS: 1800,
    });
  const days = ["2026-10-19", "2026-10-20", TODAY, "2026-10-22"];

  it("marks every day of the week from Monday through today, and none after", async () => {
    await db.insert(plannedSessions).values(days.map(swimRow));
    for (const d of days) await logSwim(d);
    expect(await markCompletionThrough(db, THIS_WEEK, TODAY, TZ)).toBe(3);
    const rows = await rowsBetween(THIS_WEEK, NEXT_WEEK);
    expect(rows.map((r) => [r.localDate, r.status])).toEqual([
      ["2026-10-19", "done"],
      ["2026-10-20", "done"],
      [TODAY, "done"],
      ["2026-10-22", "planned"],
    ]);
    // A past week is marked whole; a future week not at all.
    expect(await markCompletionThrough(db, NEXT_WEEK, TODAY, TZ)).toBe(0);
  });

  it("getWeekPlan marks Monday's session before ensureWeek (a done Monday blocks a rebuild)", async () => {
    await setup();
    await ensureWeek(db, THIS_WEEK, NOW, TZ);
    await ensureWeek(db, NEXT_WEEK, NOW, TZ); // preview: provisional
    const preview = await rowsBetween(NEXT_WEEK, addDays(NEXT_WEEK, 7));
    const mon = preview.find((r) => ["swim", "bike", "run"].includes(r.kind) && r.localDate <= "2026-10-27")!;
    expect(mon).toBeDefined();
    await db.insert(cardioEntries).values({
      kind: mon.kind as "swim" | "bike" | "run",
      startedAt: new Date(zonedLocalToUtc(`${mon.localDate}T07:00`, TZ)),
      localDate: mon.localDate,
      durationS: 1800,
    });
    // Opened on Wednesday 2026-10-28 from the Plan tab.
    const week = await getWeekPlan(db, NEXT_WEEK, new Date("2026-10-28T17:00:00Z"), TZ);
    const ids = week.flatMap((d) => d.sessions.map((s) => s.id));
    expect(ids).toEqual(preview.map((r) => r.id));
    expect(week.flatMap((d) => d.sessions).find((s) => s.id === mon.id)?.status).toBe("done");
  });

  it("getDayPlan marks Monday's session when opened on Wednesday", async () => {
    await db.insert(plannedSessions).values(days.map(swimRow));
    await logSwim("2026-10-19");
    await setup();
    await getDayPlan(db, TODAY, NOW, TZ);
    const [monRow] = await rowsBetween("2026-10-19", "2026-10-20");
    expect(monRow.status).toBe("done");
  });
});

describe("storedDaySessions", () => {
  it("returns a past day's stored rows in slot order and writes nothing", async () => {
    const day = addDays(TODAY, -2);
    await db.insert(plannedSessions).values(
      (["run", "strength"] as const).map((kind, i) => ({
        localDate: day,
        slot: 1 - i,
        kind,
        title: kind,
        durationMin: 30,
        intensity: kind === "strength" ? ("strength" as const) : ("z2" as const),
        details: {},
        ruleIds: [],
        weekStart: weekStart(day),
        status: kind === "run" ? ("done" as const) : ("planned" as const),
      })),
    );
    const before = {
      log: (await db.select().from(recommendationLog)).length,
      rows: await db.select().from(plannedSessions).orderBy(asc(plannedSessions.id)),
    };
    const sessions = await storedDaySessions(db, day);
    expect(sessions.map((s) => [s.kind, s.status, s.adjusted, s.reasons.length])).toEqual([
      ["strength", "planned", false, 0],
      ["run", "done", false, 0],
    ]);
    expect((await db.select().from(recommendationLog)).length).toBe(before.log);
    expect(await db.select().from(plannedSessions).orderBy(asc(plannedSessions.id))).toEqual(before.rows);
  });

  it("returns nothing for a day with no stored plan, without generating one", async () => {
    expect(await storedDaySessions(db, addDays(TODAY, -40))).toEqual([]);
    expect((await db.select().from(plannedSessions)).length).toBe(0);
  });
});

describe("dismissed WHOOP workouts", () => {
  it("never complete a planned session", async () => {
    const [row] = await db
      .insert(plannedSessions)
      .values({ localDate: TODAY, slot: 0, kind: "run", title: "Run", durationMin: 30, intensity: "z2", details: {}, ruleIds: [], weekStart: weekStart(TODAY) })
      .returning();
    await db.insert(workouts).values({
      id: "not-a-run",
      start: new Date("2026-10-21T14:00:00Z"),
      end: new Date("2026-10-21T14:30:00Z"),
      timezoneOffset: "-05:00",
      sportName: "running",
      scoreState: "SCORED",
    });
    await dismissWorkout(db, "not-a-run");
    expect(await markCompletion(db, TODAY, TZ)).toBe(0);
    expect((await db.select().from(plannedSessions).where(eq(plannedSessions.id, row.id)))[0].status).toBe("planned");
  });
});

describe("manual check-off", () => {
  const place = async (day: string, kind: "run" | "strength" = "run") => {
    const [row] = await db
      .insert(plannedSessions)
      .values({
        localDate: day,
        slot: 0,
        kind,
        title: kind,
        durationMin: 30,
        intensity: kind === "strength" ? ("strength" as const) : ("z2" as const),
        details: {},
        ruleIds: [],
        weekStart: weekStart(day),
      })
      .returning();
    return row;
  };
  const read = async (id: string) => (await db.select().from(plannedSessions).where(eq(plannedSessions.id, id)))[0];

  it("checks a planned session", async () => {
    const row = await place(TODAY);
    expect(await setManualDone(db, row.id, true, TODAY)).toBe("done");
    expect(await read(row.id)).toMatchObject({ status: "done", completedManual: true, completedRef: null });
  });

  it("unchecks only a manual completion", async () => {
    const manual = await place(TODAY);
    await setManualDone(db, manual.id, true, TODAY);
    expect(await setManualDone(db, manual.id, false, TODAY)).toBe("undone");
    expect(await read(manual.id)).toMatchObject({ status: "planned", completedManual: false, completedRef: null });

    const logged = await place(addDays(TODAY, -1));
    await db.update(plannedSessions).set({ status: "done", completedRef: "cardio:x" }).where(eq(plannedSessions.id, logged.id));
    expect(await setManualDone(db, logged.id, false, TODAY)).toBe("refused");
    expect(await read(logged.id)).toMatchObject({ status: "done", completedRef: "cardio:x", completedManual: false });
  });

  it("refuses a future date", async () => {
    const row = await place(addDays(TODAY, 1));
    expect(await setManualDone(db, row.id, true, TODAY)).toBe("refused");
    expect((await read(row.id)).status).toBe("planned");
  });

  it("allows a past date", async () => {
    const row = await place(addDays(TODAY, -3));
    expect(await setManualDone(db, row.id, true, TODAY)).toBe("done");
  });

  it("a later match upgrades a manual check", async () => {
    const row = await place(TODAY);
    await setManualDone(db, row.id, true, TODAY);
    const [entry] = await db
      .insert(cardioEntries)
      .values({ kind: "run", startedAt: new Date("2026-10-21T13:00:00Z"), localDate: TODAY, durationS: 1800 })
      .returning();
    await markCompletion(db, TODAY, TZ);
    expect(await read(row.id)).toMatchObject({ status: "done", completedRef: `cardio:${entry.id}`, completedManual: false });
  });

  it("a manual check survives regeneration", async () => {
    await setup();
    await ensureWeek(db, THIS_WEEK, NOW, TZ);
    const [todayRow] = (await db.select().from(plannedSessions).where(eq(plannedSessions.localDate, TODAY))).filter((r) => r.kind !== "rest");
    expect(todayRow).toBeDefined();
    await setManualDone(db, todayRow.id, true, TODAY);
    await updatePlanSettings(db, { longRideDow: 4 });
    await regenerateFuture(db, TODAY, NOW, TZ);
    expect(await read(todayRow.id)).toMatchObject({ status: "done", completedManual: true });
  });
});

describe("change snapshots", () => {
  it("getDayPlan stores the adapted snapshot on changed sessions", async () => {
    await setup();
    await seedRecovery(3000, TODAY, 45, 50); // yellow
    const plan = await getDayPlan(db, TODAY, NOW, TZ);
    const changed = plan.sessions.filter((s) => s.adjusted);
    expect(changed.length).toBeGreaterThan(0);
    const rows = await db.select().from(recommendationLog).where(eq(recommendationLog.localDate, TODAY));
    for (const s of changed) {
      const mine = rows.filter((r) => r.plannedSessionId === s.id);
      expect(mine.length).toBeGreaterThan(0);
      for (const r of mine) {
        expect(r.adapted).toEqual({ kind: s.kind, title: s.title, durationMin: s.durationMin, intensity: s.intensity });
      }
    }
    // An unchanged session's rows say so, so a past day can tell them from rows logged before snapshots.
    for (const s of plan.sessions.filter((x) => !x.adjusted)) {
      expect(rows.filter((r) => r.plannedSessionId === s.id).every((r) => (r.adapted as { unchanged?: boolean })?.unchanged === true)).toBe(true);
    }
    const stored = await rowsBetween(TODAY, addDays(TODAY, 1));
    for (const s of changed) {
      const row = stored.find((r) => r.id === s.id)!;
      expect(s.before).toEqual({ kind: row.kind, title: row.title, durationMin: row.durationMin, intensity: row.intensity });
    }
    for (const s of plan.sessions.filter((x) => !x.adjusted)) expect(s.before).toBeUndefined();
  });

  it("a pain-hold swap snapshots the new kind", async () => {
    await setup();
    await ensureWeek(db, THIS_WEEK, NOW, TZ);
    const run = (await db.select().from(plannedSessions).where(eq(plannedSessions.weekStart, THIS_WEEK)))
      .filter((r) => r.kind === "run" && r.localDate >= TODAY)
      .sort((a, b) => a.localDate.localeCompare(b.localDate))[0];
    expect(run).toBeDefined();
    // Invented pain above the hold threshold the day before.
    await db.insert(painEntries).values({ localDate: addDays(run.localDate, -1), area: "knee", side: "left", score: 6, context: "daily" });
    const at = new Date(zonedLocalToUtc(`${run.localDate}T12:00`, TZ));
    await getDayPlan(db, run.localDate, at, TZ);
    const rows = await db.select().from(recommendationLog).where(eq(recommendationLog.plannedSessionId, run.id));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => (r.adapted as { kind: string } | null)?.kind === "bike")).toBe(true);
    const [stored] = await db.select().from(plannedSessions).where(eq(plannedSessions.id, run.id));
    expect(stored.kind).toBe("run");
  });

  it("a note that changed nothing gives no logged change (no false dot later)", async () => {
    await setup();
    await ensureWeek(db, THIS_WEEK, NOW, TZ);
    const rows = await db.select().from(plannedSessions).where(eq(plannedSessions.weekStart, THIS_WEEK));
    const day = [...new Set(rows.map((r) => r.localDate))]
      .filter((d) => d >= TODAY)
      .sort()
      .find((d) => {
        const dayRows = rows.filter((r) => r.localDate === d);
        return (
          dayRows.some((r) => r.kind !== "rest") &&
          !dayRows.some((r) => r.kind === "run" || (r.details as { plyo?: boolean }).plyo === true)
        );
      });
    expect(day).toBeDefined();
    // Invented pain above the hold threshold: the hold is active, but the day has nothing to swap.
    await db.insert(painEntries).values({ localDate: addDays(day!, -1), area: "knee", side: "left", score: 6, context: "daily" });
    const plan = await getDayPlan(db, day!, new Date(zonedLocalToUtc(`${day}T12:00`, TZ)), TZ);
    expect(plan.sessions.every((s) => !s.adjusted)).toBe(true);
    const logged = await db.select().from(recommendationLog).where(eq(recommendationLog.localDate, day!));
    expect(logged.some((r) => r.plannedSessionId !== null && r.effect !== NOT_ENOUGH_DATA)).toBe(true);
    expect((await loggedChanges(db, day!)).size).toBe(0);
  });

  it("loggedChanges reads a past day without writing", async () => {
    const day = addDays(TODAY, -2);
    const ids: string[] = [];
    for (const slot of [0, 1, 2]) {
      const [r] = await db
        .insert(plannedSessions)
        .values({ localDate: day, slot, kind: "run", title: "Run 40 min", durationMin: 40, intensity: "z2", details: {}, ruleIds: [], weekStart: weekStart(day) })
        .returning();
      ids.push(r.id);
    }
    const snap = { kind: "run", title: "Easy run 32 min", durationMin: 32, intensity: "easy" };
    await db.insert(recommendationLog).values([
      { localDate: day, plannedSessionId: ids[0], ruleId: "recovery.yellowScale", inputs: {}, effect: "Recovery 50% (yellow) — shortened", adapted: snap },
      { localDate: day, plannedSessionId: ids[1], ruleId: "recovery.redSwap", inputs: {}, effect: "Recovery 20% (red) — swapped", adapted: null },
      { localDate: day, plannedSessionId: ids[2], ruleId: "recovery.color", inputs: {}, effect: NOT_ENOUGH_DATA },
      // A note that did not change the session (e.g. a sleep-debt bedtime note on an easy day).
      { localDate: day, plannedSessionId: ids[2], ruleId: "recovery.sleepDebt", inputs: {}, effect: "Short on sleep — earlier bedtime", adapted: { unchanged: true } },
    ]);
    const before = { log: (await db.select().from(recommendationLog)).length, rows: (await db.select().from(plannedSessions)).length };
    const changes = await loggedChanges(db, day);
    expect([...changes.keys()].sort()).toEqual([ids[0], ids[1]].sort());
    expect(changes.get(ids[0])).toEqual({ now: snap, reasons: [{ ruleId: "recovery.yellowScale", text: "Recovery 50% (yellow) — shortened" }] });
    expect(changes.get(ids[1])!.now).toBeNull();
    expect((await db.select().from(recommendationLog)).length).toBe(before.log);
    expect((await db.select().from(plannedSessions)).length).toBe(before.rows);
  });
});

describe("getStrainTarget", () => {
  const easyRun = { kind: "run", intensity: "z2", durationMin: 40, details: {} };
  /** A past day with one planned run and a cycle that started the evening before. */
  const pastDay = async (n: number, strain: number, opts: { skipped?: boolean; missed?: boolean; scored?: boolean } = {}) => {
    const day = addDays(TODAY, -n);
    await db.insert(plannedSessions).values({
      localDate: day, slot: 0, kind: "run", title: "Run", durationMin: 40, intensity: "z2", details: {}, ruleIds: [], weekStart: weekStart(day),
      status: opts.skipped ? ("skipped" as const) : opts.missed ? ("planned" as const) : ("done" as const),
    });
    await db.insert(cycles).values({
      id: 9000 + n,
      start: new Date(zonedLocalToUtc(`${addDays(day, -1)}T22:00`, TZ)),
      end: new Date(zonedLocalToUtc(`${day}T22:00`, TZ)),
      timezoneOffset: "-05:00",
      scoreState: opts.scored === false ? "PENDING_SCORE" : "SCORED",
      strain,
    });
  };

  it("learns the band from matching past days, skipping skipped, missed and unscored days", async () => {
    for (const [i, strain] of [8, 9, 10, 11, 12].entries()) await pastDay(i + 1, strain);
    await pastDay(6, 20, { skipped: true });
    await pastDay(7, 19, { scored: false });
    // A planned run that was never done: that day's low strain says nothing about a run day.
    await pastDay(8, 2, { missed: true });
    await pastDay(9, 3, { missed: true });
    const before = { rows: (await db.select().from(plannedSessions)).length, log: (await db.select().from(recommendationLog)).length };
    expect(await getStrainTarget(db, TODAY, [easyRun], TZ)).toEqual({ low: 9, high: 11, estimate: false, type: "easy", days: 5 });
    expect((await db.select().from(plannedSessions)).length).toBe(before.rows);
    expect((await db.select().from(recommendationLog)).length).toBe(before.log);
  });

  it("falls back to the starting range with no history", async () => {
    expect(await getStrainTarget(db, TODAY, [easyRun], TZ)).toEqual({ low: 8, high: 11, estimate: true, type: "easy", days: 0 });
  });
});

describe("todayPrescription", () => {
  const noon = (d: string) => new Date(zonedLocalToUtc(`${d}T12:00`, TZ));
  const liftDay = async (template: string) => {
    await ensureWeek(db, THIS_WEEK, NOW, TZ);
    const rows = await db.select().from(plannedSessions).where(eq(plannedSessions.weekStart, THIS_WEEK));
    return rows
      .filter((r) => r.kind === "strength" && (r.details as { template?: string }).template === template && r.localDate >= TODAY)
      .sort((a, b) => a.localDate.localeCompare(b.localDate))[0];
  };

  it("returns today's planned lifts in order", async () => {
    await setup();
    const day = await liftDay("upperA") ?? (await liftDay("upperB"));
    expect(day).toBeDefined();
    const rx = await todayPrescription(db, day.localDate, noon(day.localDate), TZ);
    // Every lifting session that day (the main lift plus any core or lower-leg block), in slot order.
    const stored = (await db.select().from(plannedSessions).where(eq(plannedSessions.localDate, day.localDate)))
      .filter((r) => ["strength", "lower_leg", "core"].includes(r.kind))
      .sort((x, y) => x.slot - y.slot)
      .flatMap((r) => ((r.details as { prescription?: { exercise: string }[] }).prescription ?? []).map((p) => p.exercise));
    expect(rx.map((p) => p.exercise)).toEqual(stored);
    expect(rx.map((p) => p.exercise)).toContain("Machine Chest Press");
  });

  it("is empty for a workout on another day", async () => {
    await setup();
    const day = await liftDay("upperA") ?? (await liftDay("upperB"));
    expect(await todayPrescription(db, addDays(day.localDate, -1), noon(day.localDate), TZ)).toEqual([]);
  });

  it("suggests from the latest session, not the one before the week was built", async () => {
    await setup();
    await ensureDefaultExercises(db);
    const day = await liftDay("upperA") ?? (await liftDay("upperB"));
    const [pulldown] = await db.select().from(exercises).where(eq(exercises.name, "Lat Pulldown"));
    // Invented: the day before, after the week was built, every set at the top of the range at 100 lb.
    const prev = addDays(day.localDate, -1);
    const [s] = await db
      .insert(strengthSessions)
      .values({ startedAt: noon(prev), endedAt: new Date(noon(prev).getTime() + 3_600_000), localDate: prev })
      .returning();
    await db.insert(strengthSets).values(
      [0, 1, 2].map((i) => ({ clientId: crypto.randomUUID(), sessionId: s.id, exerciseId: pulldown.id, setIndex: i, reps: 10, weightLb: 100, completedAt: noon(prev) })),
    );
    const rx = await todayPrescription(db, day.localDate, noon(day.localDate), TZ);
    expect(rx.find((p) => p.exercise === "Lat Pulldown")).toMatchObject({ targetWeightLb: 105, repRange: [6, 10] });
  });

  it("still serves a lift checked off by hand", async () => {
    await setup();
    const day = await liftDay("upperA") ?? (await liftDay("upperB"));
    expect(await setManualDone(db, day.id, true, day.localDate)).toBe("done");
    const rx = await todayPrescription(db, day.localDate, noon(day.localDate), TZ);
    expect(rx.map((p) => p.exercise)).toContain("Machine Chest Press");
  });

  it("degrades to no plan when the plan can't be read", async () => {
    const broken = {} as Db;
    expect(await todayPrescription(broken, TODAY, NOW, TZ)).toEqual([]);
  });

  it("leaves out plyometrics a pain hold removed", async () => {
    await setup({ jointStatus: "unrestricted" });
    const day = await liftDay("lower");
    expect(day).toBeDefined();
    expect((day.details as { prescription: { exercise: string }[] }).prescription.some((p) => p.exercise === "Box Jump")).toBe(true);
    await db.insert(painEntries).values({ localDate: addDays(day.localDate, -1), area: "knee", side: "left", score: 6, context: "daily" });
    const rx = await todayPrescription(db, day.localDate, noon(day.localDate), TZ);
    expect(rx.length).toBeGreaterThan(0);
    expect(rx.some((p) => p.exercise === "Box Jump")).toBe(false);
  });
});
