import { describe, it, expect } from "vitest";
import { RULES } from "@/lib/engine/rules/catalog";
import type { Phase, WeeklyTargets } from "@/lib/engine/season";
import { buildWeek, type BuildWeekInput, type PlannedSessionDraft } from "@/lib/engine/week";
import type { PlanSettings } from "@/lib/plan/settings";

// Invented settings and dates only.
const SETTINGS: PlanSettings = {
  raceDate: "2027-09-12",
  seasonStart: "2026-11-02",
  windows: [
    { start: "06:00", end: "08:00" },
    { start: "12:00", end: "13:00" },
  ],
  longRideDow: 5,
  longRunDow: 6,
  restDow: 0,
  jointStatus: "caution",
  poolLengthM: 25,
  wakeTime: null,
  painSide: null,
  poolUnit: "yd",
};

const WEEK = "2026-11-16"; // a Monday
const LOW_SHARE = RULES["intensity.distribution"].params.lowShare;
const RUN = RULES["volume.run"].params;
const WT = RULES["week.template"].params;
const HARD = new Set(["tempo", "threshold", "intervals"]);
const ENDURANCE = new Set(["swim", "bike", "run"]);
/** Days before a key run that the Lower day must avoid (concurrent.spacing, hours → days). */
const SPACING_DAYS = Math.ceil(RULES["concurrent.spacing"].params.noLowerDayWithinHoursBeforeKeyRun / 24);

type Scenario = { name: string; weekIndex: number; phase: Phase; recovery: boolean; targets: WeeklyTargets };

const SCENARIOS: Scenario[] = [
  { name: "walk-run base", weekIndex: 2, phase: "base", recovery: false, targets: { enduranceMin: 330, runMin: 50, swimMin: 93, bikeMin: 187 } },
  { name: "base", weekIndex: 12, phase: "base", recovery: false, targets: { enduranceMin: 420, runMin: 120, swimMin: 105, bikeMin: 195 } },
  { name: "build", weekIndex: 30, phase: "build", recovery: false, targets: { enduranceMin: 600, runMin: 180, swimMin: 150, bikeMin: 270 } },
  { name: "recovery", weekIndex: 31, phase: "build", recovery: true, targets: { enduranceMin: 420, runMin: 126, swimMin: 105, bikeMin: 189 } },
  { name: "peak", weekIndex: 40, phase: "peak", recovery: false, targets: { enduranceMin: 660, runMin: 198, swimMin: 165, bikeMin: 297 } },
  { name: "taper", weekIndex: 46, phase: "taper", recovery: false, targets: { enduranceMin: 330, runMin: 99, swimMin: 83, bikeMin: 148 } },
];

function input(s: Scenario, over: Partial<BuildWeekInput> = {}, settings: Partial<PlanSettings> = {}): BuildWeekInput {
  return {
    weekStart: WEEK,
    weekIndex: s.weekIndex,
    phase: s.phase,
    recovery: s.recovery,
    targets: s.targets,
    settings: { ...SETTINGS, ...settings },
    longestRunMinLastLookback: null,
    ...over,
  };
}

const byName = (n: string) => SCENARIOS.find((s) => s.name === n)!;
const dow = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
const adjacent = (a: number, b: number) => Math.abs(a - b) === 1 || Math.abs(a - b) === 6;
const sum = (xs: PlannedSessionDraft[]) => xs.reduce((t, x) => t + x.durationMin, 0);
const ofKind = (w: PlannedSessionDraft[], k: string) => w.filter((x) => x.kind === k);
const strength = (w: PlannedSessionDraft[]) => ofKind(w, "strength");
const templateOf = (x: PlannedSessionDraft) => x.details.template as string;

function keyRunDows(w: PlannedSessionDraft[]): Set<number> {
  return new Set(ofKind(w, "run").filter((r) => r.details.long || HARD.has(r.intensity)).map((r) => dow(r.localDate)));
}

/** True when the Lower day falls within SPACING_DAYS before any key run (weekly cycle). */
function lowerTooClose(w: PlannedSessionDraft[], lowerDow: number): boolean {
  return [...keyRunDows(w)].some((k) => {
    const ahead = (k - lowerDow + 7) % 7;
    return ahead >= 1 && ahead <= SPACING_DAYS;
  });
}

/** Hard minutes: only the hard block of a quality session counts; everything else is easy. */
function hardMinutes(xs: PlannedSessionDraft[]): number {
  return xs.filter((x) => HARD.has(x.intensity)).reduce((t, x) => t + Number(x.details.hardMin), 0);
}

const sportTarget = (t: WeeklyTargets, k: string) => (k === "swim" ? t.swimMin : k === "bike" ? t.bikeMin : t.runMin);

/** Invariants that must hold for any settings and any phase. */
function checkInvariants(w: PlannedSessionDraft[], inp: BuildWeekInput) {
  const s = inp.settings;
  const label = `${JSON.stringify({ r: s.restDow, ride: s.longRideDow, run: s.longRunDow, j: s.jointStatus, i: inp.weekIndex, p: inp.phase })}`;

  // Sorted by (localDate, slot), unique keys.
  const keys = w.map((x) => `${x.localDate}#${String(x.slot).padStart(2, "0")}`);
  expect([...keys].sort(), label).toEqual(keys);
  expect(new Set(keys).size, label).toBe(keys.length);

  // Rest day: exactly one rest session and nothing else.
  const onRest = w.filter((x) => dow(x.localDate) === s.restDow);
  expect(onRest.map((x) => x.kind), label).toEqual(["rest"]);
  expect(ofKind(w, "rest"), label).toHaveLength(1);

  // Strength: 3 sessions, chronological order Upper A, Lower, Upper B.
  expect(strength(w).map(templateOf), label).toEqual(["upperA", "lower", "upperB"]);

  // Lower is never within the spacing window before the long run or a hard run.
  const lower = strength(w).find((x) => templateOf(x) === "lower")!;
  expect(lowerTooClose(w, dow(lower.localDate)), label).toBe(false);

  // Each sport's long session is within round(target × max(longShare, 1/n)).
  for (const k of ["swim", "bike", "run"]) {
    const xs = ofKind(w, k);
    if (!xs.length) continue;
    const long = xs.find((x) => x.details.long)!;
    const bound = Math.round(sportTarget(inp.targets, k) * Math.max(WT.longShare, 1 / xs.length));
    expect(long.durationMin, `${label} ${k}`).toBeLessThanOrEqual(bound);
  }

  // Walk-run reps always fit the session.
  for (const r of ofKind(w, "run")) {
    const iv = r.details.intervals as { runMin: number; walkMin: number; reps: number } | undefined;
    if (iv) expect(iv.reps * (iv.runMin + iv.walkMin), label).toBeLessThanOrEqual(r.durationMin);
  }

  // Lower-leg blocks: sessionsPerWeek, never on consecutive days.
  const ll = ofKind(w, "lower_leg").map((x) => dow(x.localDate));
  expect(ll, label).toHaveLength(RULES["lower_leg.block"].params.sessionsPerWeek);
  for (let i = 0; i < ll.length; i++) for (let j = i + 1; j < ll.length; j++) expect(adjacent(ll[i], ll[j]), label).toBe(false);

  // Core on two strength days.
  const strengthDates = new Set(strength(w).map((x) => x.localDate));
  const core = ofKind(w, "core");
  expect(core, label).toHaveLength(WT.coreSessionsPerWeek);
  for (const c of core) expect(strengthDates.has(c.localDate), label).toBe(true);

  // Rule ids.
  for (const x of w) {
    expect(x.ruleIds.length, `${label} ${x.title}`).toBeGreaterThan(0);
    for (const id of x.ruleIds) expect(Object.keys(RULES), `${label} ${id}`).toContain(id);
  }

  // Intensity distribution: only hardMin counts as hard.
  const end = w.filter((x) => ENDURANCE.has(x.kind));
  expect(hardMinutes(end) / sum(end), label).toBeLessThanOrEqual(1 - LOW_SHARE);
  expect(1 - hardMinutes(end) / sum(end), label).toBeGreaterThanOrEqual(0.75);
  for (const x of end.filter((y) => HARD.has(y.intensity))) {
    const st = x.details.structure as { warmUpMin: number; hardMin: number; coolDownMin: number };
    expect(Number(x.details.hardMin), label).toBeGreaterThanOrEqual(WT.qualityMinMin);
    expect(st.hardMin, label).toBe(x.details.hardMin);
    expect(st.hardMin, label).toBeLessThanOrEqual(x.durationMin * WT.maxHardShareOfSession);
    expect(st.warmUpMin, label).toBeGreaterThanOrEqual(WT.minWarmUpMin);
    expect(st.coolDownMin, label).toBeGreaterThanOrEqual(WT.minCoolDownMin);
    expect(st.warmUpMin, label).toBeGreaterThanOrEqual(st.coolDownMin);
    expect(st.warmUpMin + st.hardMin + st.coolDownMin, label).toBe(x.durationMin);
  }
  if (s.jointStatus === "restricted") expect(end.filter((x) => HARD.has(x.intensity)), label).toHaveLength(0);

  // Walk-run weeks: never back-to-back run days (circular, so the next week's pattern holds too).
  if (inp.weekIndex < RUN.walkRunWeeks) {
    const runDays = ofKind(w, "run").map((x) => dow(x.localDate));
    for (let i = 0; i < runDays.length; i++)
      for (let j = i + 1; j < runDays.length; j++) expect(adjacent(runDays[i], runDays[j]), label).toBe(false);
  }

  // Plyo flag only on the Lower day, and only when unrestricted.
  for (const x of w) if (x !== lower) expect(x.details.plyo, label).toBeUndefined();
  expect(lower.details.plyo === true, label).toBe(s.jointStatus === "unrestricted");
}

describe("buildWeek", () => {
  it("minutes per sport sum to the targets within 5 minutes", () => {
    for (const sc of SCENARIOS) {
      const w = buildWeek(input(sc));
      expect(Math.abs(sum(ofKind(w, "swim")) - sc.targets.swimMin), sc.name).toBeLessThanOrEqual(5);
      expect(Math.abs(sum(ofKind(w, "bike")) - sc.targets.bikeMin), sc.name).toBeLessThanOrEqual(5);
      expect(Math.abs(sum(ofKind(w, "run")) - sc.targets.runMin), sc.name).toBeLessThanOrEqual(5);
    }
  });

  it("keeps at least 75% (and lowShare) of endurance minutes in z1/z2", () => {
    // Easy = every endurance minute outside a quality session's hard block (details.hardMin).
    for (const sc of SCENARIOS) {
      const end = buildWeek(input(sc)).filter((x) => ENDURANCE.has(x.kind));
      const easyShare = 1 - hardMinutes(end) / sum(end);
      expect(easyShare, sc.name).toBeGreaterThanOrEqual(0.75);
      expect(easyShare, sc.name).toBeGreaterThanOrEqual(LOW_SHARE);
    }
  });

  it("places exactly 3 strength sessions in the order Upper A, Lower, Upper B", () => {
    for (const sc of SCENARIOS) {
      const w = buildWeek(input(sc));
      expect(strength(w).map(templateOf), sc.name).toEqual(["upperA", "lower", "upperB"]);
      expect(strength(w).map((x) => x.title), sc.name).toEqual(["Upper A", "Lower", "Upper B"]);
      expect(new Set(strength(w).map((x) => x.localDate)).size, sc.name).toBe(3);
    }
  });

  it("never puts the Lower day the day before the long run or a hard run", () => {
    for (const sc of SCENARIOS) {
      const w = buildWeek(input(sc));
      const lower = strength(w).find((x) => templateOf(x) === "lower")!;
      expect(lowerTooClose(w, dow(lower.localDate)), sc.name).toBe(false);
      expect(lower.ruleIds).toContain("concurrent.spacing");
    }
  });

  it("puts only a rest session on the rest day", () => {
    for (const sc of SCENARIOS) {
      const w = buildWeek(input(sc));
      const onRest = w.filter((x) => dow(x.localDate) === SETTINGS.restDow);
      expect(onRest.map((x) => x.kind), sc.name).toEqual(["rest"]);
    }
  });

  it("places 2 lower-leg blocks on non-consecutive days", () => {
    for (const sc of SCENARIOS) {
      const ll = ofKind(buildWeek(input(sc)), "lower_leg");
      expect(ll, sc.name).toHaveLength(2);
      expect(adjacent(dow(ll[0].localDate), dow(ll[1].localDate)), sc.name).toBe(false);
      for (const x of ll) expect(x.ruleIds).toContain("lower_leg.block");
    }
  });

  it("joint status caution gives no plyo; unrestricted allows it on the Lower day", () => {
    const caution = buildWeek(input(byName("build")));
    expect(caution.some((x) => x.details.plyo)).toBe(false);
    const free = buildWeek(input(byName("build"), {}, { jointStatus: "unrestricted" }));
    const plyo = free.filter((x) => x.details.plyo === true);
    expect(plyo).toHaveLength(1);
    expect(plyo[0].details.template).toBe("lower");
    expect(plyo[0].ruleIds).toContain("pain.jointStatus");
  });

  it("a recovery week has no tempo, threshold or intervals sessions", () => {
    const w = buildWeek(input(byName("recovery")));
    expect(w.filter((x) => HARD.has(x.intensity))).toEqual([]);
    for (const x of w.filter((y) => ENDURANCE.has(y.kind))) expect(x.ruleIds).toContain("season.recoveryWeek");
  });

  it("every draft has at least one rule id and every id exists in RULES", () => {
    for (const sc of SCENARIOS) {
      for (const x of buildWeek(input(sc))) {
        expect(x.ruleIds.length, x.title).toBeGreaterThan(0);
        for (const id of x.ruleIds) expect(Object.keys(RULES)).toContain(id);
      }
    }
  });

  it("long ride on longRideDow, long run on longRunDow", () => {
    const w = buildWeek(input(byName("build")));
    const longRide = ofKind(w, "bike").filter((x) => x.details.long);
    const longRun = ofKind(w, "run").filter((x) => x.details.long);
    expect(longRide.map((x) => dow(x.localDate))).toEqual([SETTINGS.longRideDow]);
    expect(longRun.map((x) => dow(x.localDate))).toEqual([SETTINGS.longRunDow]);
    // The long session is the sport's longest.
    for (const k of ["bike", "run", "swim"]) {
      const xs = ofKind(w, k);
      const long = xs.find((x) => x.details.long)!;
      expect(Math.max(...xs.map((x) => x.durationMin))).toBe(long.durationMin);
    }
  });

  it("sessions per sport stay inside the template's ranges", () => {
    for (const sc of SCENARIOS) {
      const w = buildWeek(input(sc));
      for (const k of ["swim", "bike", "run"] as const) {
        const [lo, hi] = WT.sessionsPerWeek[k];
        expect(ofKind(w, k).length, `${sc.name} ${k}`).toBeGreaterThanOrEqual(lo);
        expect(ofKind(w, k).length, `${sc.name} ${k}`).toBeLessThanOrEqual(hi);
      }
    }
  });

  it("walk-run weeks use progressing intervals and continuous runs after", () => {
    const at = (weekIndex: number) =>
      ofKind(buildWeek(input({ ...byName("walk-run base"), weekIndex })), "run");
    const expectedRun = (i: number) => WT.walkRun.startRunMin + Math.floor(i / WT.walkRun.everyWeeks) * WT.walkRun.stepRunMin;

    const first = at(0);
    for (const r of first) {
      const iv = r.details.intervals as { runMin: number; walkMin: number; reps: number };
      expect(iv.runMin).toBe(expectedRun(0));
      expect(iv.walkMin).toBe(WT.walkRun.walkMin);
      expect(iv.reps * (iv.runMin + iv.walkMin)).toBeLessThanOrEqual(r.durationMin);
      expect(r.title).toMatch(/^(Long walk-run|Walk-run) \d+×\(\d+ run\/\d+ walk\)$/);
      expect(r.ruleIds).toContain("volume.run");
    }
    const last = at(RUN.walkRunWeeks - 1);
    const lastIv = last[0].details.intervals as { runMin: number };
    expect(lastIv.runMin).toBe(expectedRun(RUN.walkRunWeeks - 1));
    expect(lastIv.runMin).toBeGreaterThan((first[0].details.intervals as { runMin: number }).runMin);

    for (const r of at(RUN.walkRunWeeks)) expect(r.details.intervals).toBeUndefined();
  });

  it("base weeks are z2 only, with strides as a note on one easy run after walk-run", () => {
    const w = buildWeek(input(byName("base")));
    for (const x of w.filter((y) => ENDURANCE.has(y.kind))) expect(x.intensity).toBe("z2");
    const strides = w.filter((x) => x.details.strides);
    expect(strides).toHaveLength(1);
    expect(strides[0].kind).toBe("run");
    expect(strides[0].details.long).toBeFalsy();

    const walk = buildWeek(input(byName("walk-run base")));
    expect(walk.some((x) => x.details.strides)).toBe(false);
  });

  it("build weeks have at most one quality bike and one quality run", () => {
    for (const name of ["build", "peak"]) {
      const w = buildWeek(input(byName(name)));
      const hardBike = ofKind(w, "bike").filter((x) => HARD.has(x.intensity));
      const hardRun = ofKind(w, "run").filter((x) => HARD.has(x.intensity));
      expect(hardBike, name).toHaveLength(1);
      expect(hardRun, name).toHaveLength(1);
      expect(["tempo", "threshold"]).toContain(hardBike[0].intensity);
      expect(ofKind(w, "swim").filter((x) => HARD.has(x.intensity)), name).toHaveLength(0);
      expect(hardRun[0].details.long).toBeFalsy();
    }
  });

  it("taper keeps one short quality session per sport", () => {
    const w = buildWeek(input(byName("taper")));
    for (const k of ["swim", "bike", "run"]) {
      const hard = ofKind(w, k).filter((x) => HARD.has(x.intensity));
      expect(hard, k).toHaveLength(1);
      expect(hard[0].ruleIds).toContain("season.phases");
    }
  });

  it("caps the long run at the lookback longest × (1 + longRunMaxIncreasePct) (Ruling 6)", () => {
    const sc = byName("build");
    const longest = 40;
    const cap = Math.floor(longest * (1 + RUN.longRunMaxIncreasePct / 100));
    const uncapped = buildWeek(input(sc));
    expect(ofKind(uncapped, "run").find((x) => x.details.long)!.durationMin).toBeGreaterThan(cap);

    const w = buildWeek(input(sc, { longestRunMinLastLookback: longest }));
    const runs = ofKind(w, "run");
    const long = runs.find((x) => x.details.long)!;
    expect(long.durationMin).toBe(cap);
    expect(long.ruleIds).toContain("volume.run");
    expect(long.details.longRunCap).toMatchObject({ capMin: cap, lookbackLongestMin: longest });
    for (const r of runs) expect(r.durationMin).toBeLessThanOrEqual(cap);
    expect(sum(runs)).toBeLessThanOrEqual(sc.targets.runMin);

    // A tight cap drops what the other runs cannot absorb, and says so.
    const tight = buildWeek(input(sc, { longestRunMinLastLookback: 20 }));
    const tRuns = ofKind(tight, "run");
    const tLong = tRuns.find((x) => x.details.long)!;
    const tCap = Math.floor(20 * (1 + RUN.longRunMaxIncreasePct / 100));
    expect(tLong.durationMin).toBe(tCap);
    for (const r of tRuns) expect(r.durationMin).toBeLessThanOrEqual(tCap);
    expect((tLong.details.longRunCap as { droppedMin: number }).droppedMin).toBeGreaterThan(0);
    expect(sum(tRuns)).toBeLessThan(sc.targets.runMin);

    // No cap when the input is null.
    expect(ofKind(uncapped, "run").every((x) => !x.details.longRunCap)).toBe(true);
  });

  it("same-day cardio goes in window 0 and strength in window 1 when two windows exist", () => {
    const w = buildWeek(input(byName("build")));
    const shared = strength(w).filter((s) => w.some((x) => x.localDate === s.localDate && ENDURANCE.has(x.kind)));
    expect(shared.length).toBeGreaterThan(0);
    for (const s of shared) {
      const day = w.filter((x) => x.localDate === s.localDate);
      expect(day[0].slot).toBe(0);
      expect(ENDURANCE.has(day[0].kind)).toBe(true);
      expect(day[0].details.window).toBe(0);
      expect(s.details.window).toBe(1);
      expect(s.slot).toBeGreaterThan(0);
      expect(s.details.note).toBeUndefined();
    }
  });

  it("with one window, strength shares window 0 with a spacing note", () => {
    const w = buildWeek(input(byName("build"), {}, { windows: [{ start: "06:00", end: "09:00" }] }));
    const hours = RULES["concurrent.spacing"].params.minHoursBetweenHardCardioAndLift;
    const shared = strength(w).filter((s) => w.some((x) => x.localDate === s.localDate && ENDURANCE.has(x.kind)));
    expect(shared.length).toBeGreaterThan(0);
    for (const s of shared) {
      expect(s.details.window).toBe(0);
      expect(String(s.details.note)).toContain(`${hours} h`);
      expect(s.ruleIds).toContain("concurrent.spacing");
    }
  });

  it("restricted joint status drops running without moving its minutes elsewhere", () => {
    const sc = byName("build");
    const w = buildWeek(input(sc, {}, { jointStatus: "restricted" }));
    expect(ofKind(w, "run")).toHaveLength(0);
    expect(sum(ofKind(w, "bike"))).toBeLessThanOrEqual(sc.targets.bikeMin);
    expect(sum(ofKind(w, "swim"))).toBeLessThanOrEqual(sc.targets.swimMin);
    const noted = w.filter((x) => String(x.details.note ?? "").startsWith("Running paused (joint status: restricted)"));
    expect(noted).toHaveLength(1);
    expect(["bike", "swim"]).toContain(noted[0].kind);
    expect(noted[0].ruleIds).toContain("pain.jointStatus");
    // It is the week's first bike or swim session.
    const firstCardio = w.find((x) => x.kind === "bike" || x.kind === "swim")!;
    expect(noted[0]).toBe(firstCardio);
    // No quality at all under restricted: every endurance session is z2.
    for (const x of w.filter((y) => ENDURANCE.has(y.kind))) expect(x.intensity, x.title).toBe("z2");
  });

  it("quality sessions keep their full duration: hard block plus easy warm-up and cool-down", () => {
    for (const sc of SCENARIOS) {
      const w = buildWeek(input(sc));
      for (const x of w.filter((y) => HARD.has(y.intensity))) {
        const st = x.details.structure as { warmUpMin: number; hardMin: number; coolDownMin: number };
        expect(st.warmUpMin + st.hardMin + st.coolDownMin, `${sc.name} ${x.title}`).toBe(x.durationMin);
        expect(st.hardMin).toBe(x.details.hardMin);
        expect(st.warmUpMin).toBeGreaterThanOrEqual(WT.minWarmUpMin);
        expect(st.coolDownMin).toBeGreaterThanOrEqual(WT.minCoolDownMin);
        expect(st.hardMin).toBeLessThanOrEqual(x.durationMin * WT.maxHardShareOfSession);
        expect(String(x.details.note)).toBe(
          `${st.warmUpMin} min warm-up · ${st.hardMin} min ${x.intensity} · ${st.coolDownMin} min cool-down`,
        );
        expect(x.details.droppedMin).toBeUndefined();
      }
    }
  });

  it("taper keeps intensity: hardMin ≥ qualityMinMin per sport, and the week total ≈ target", () => {
    const sc = byName("taper");
    const w = buildWeek(input(sc));
    for (const k of ["swim", "bike", "run"]) {
      const hard = ofKind(w, k).filter((x) => HARD.has(x.intensity));
      expect(hard, k).toHaveLength(1);
      expect(Number(hard[0].details.hardMin), k).toBeGreaterThanOrEqual(WT.qualityMinMin);
    }
    const end = w.filter((x) => ENDURANCE.has(x.kind));
    expect(Math.abs(sum(end) - sc.targets.enduranceMin)).toBeLessThanOrEqual(5);
  });

  it("puts the long swim in window 1 when two windows exist", () => {
    const w = buildWeek(input(byName("build")));
    const longSwim = ofKind(w, "swim").find((x) => x.details.long)!;
    expect(longSwim.details.window).toBe(1);
    const longRun = ofKind(w, "run").find((x) => x.details.long)!;
    expect(longRun.details.window).toBe(0);
    const one = buildWeek(input(byName("build"), {}, { windows: [{ start: "06:00", end: "09:00" }] }));
    expect(ofKind(one, "swim").find((x) => x.details.long)!.details.window).toBe(0);
  });

  it("walk-run reps never overrun a short session; the cycle shrinks when one cycle does not fit", () => {
    // Week 7: planned cycle is 4 run + 1 walk; 6 run minutes over 2 runs gives 3-minute sessions.
    const sc: Scenario = { name: "tiny", weekIndex: RUN.walkRunWeeks - 1, phase: "base", recovery: false, targets: { enduranceMin: 306, runMin: 6, swimMin: 100, bikeMin: 200 } };
    const runs = ofKind(buildWeek(input(sc)), "run");
    expect(runs.length).toBeGreaterThan(0);
    for (const r of runs) {
      const iv = r.details.intervals as { runMin: number; walkMin: number; reps: number };
      expect(Object.keys(iv).sort()).toEqual(["reps", "runMin", "walkMin"]);
      expect(iv.reps * (iv.runMin + iv.walkMin)).toBeLessThanOrEqual(r.durationMin);
      expect(iv.reps).toBeGreaterThanOrEqual(1);
      expect(iv.runMin + iv.walkMin).toBeLessThanOrEqual(r.durationMin);
    }
  });

  it("is deterministic and uses short human titles", () => {
    const a = buildWeek(input(byName("build")));
    const b = buildWeek(input(byName("build")));
    expect(a).toEqual(b);
    const titles = a.map((x) => x.title);
    expect(titles).toContain("Lower-leg block");
    expect(titles).toContain("Core");
    expect(titles).toContain("Rest");
    expect(titles.some((t) => /^Long ride \d+h( \d+m)?$/.test(t))).toBe(true);
    expect(titles.some((t) => /^Easy swim \d+ min$/.test(t))).toBe(true);
    // Every date is inside the week.
    for (const x of a) expect(x.localDate >= WEEK && x.localDate <= "2026-11-22").toBe(true);
  });

  it("rejects a weekStart that is not a Monday", () => {
    expect(() => buildWeek(input(byName("build"), { weekStart: "2026-11-17" }))).toThrow(RangeError);
  });

  it("holds every invariant for every valid day layout, phase and joint status", () => {
    const statuses: PlanSettings["jointStatus"][] = ["unrestricted", "caution", "restricted"];
    for (let rest = 0; rest < 7; rest++)
      for (let ride = 0; ride < 7; ride++)
        for (let run = 0; run < 7; run++) {
          if (new Set([rest, ride, run]).size !== 3) continue;
          for (const jointStatus of statuses)
            for (const sc of SCENARIOS) {
              const inp = input(sc, {}, { restDow: rest, longRideDow: ride, longRunDow: run, jointStatus });
              const w = buildWeek(inp);
              checkInvariants(w, inp);
              if (jointStatus === "restricted") {
                const caution = buildWeek({ ...inp, settings: { ...inp.settings, jointStatus: "caution" } });
                expect(ofKind(w, "run")).toHaveLength(0);
                expect(sum(ofKind(w, "bike"))).toBeLessThanOrEqual(sum(ofKind(caution, "bike")));
                expect(sum(ofKind(w, "swim"))).toBeLessThanOrEqual(sum(ofKind(caution, "swim")));
                // A tightening status never raises hard minutes on any sport.
                for (const k of ["swim", "bike", "run"]) {
                  expect(hardMinutes(ofKind(w, k))).toBeLessThanOrEqual(hardMinutes(ofKind(caution, k)));
                }
              }
            }
        }
  }, 120_000); // exhaustive sweep; slow when the full suite runs in parallel
});
