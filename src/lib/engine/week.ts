/**
 * Weekly session template: turns one week's phase and minute targets into concrete sessions
 * on specific days (swim, bike, run, strength, lower-leg blocks, core, rest), each tagged with
 * the rules that placed it. Pure: dates and data are parameters, every threshold is a rule param.
 */
import { RULES, type RuleId } from "@/lib/engine/rules/catalog";
import type { Phase, WeeklyTargets } from "@/lib/engine/season";
import { addDays } from "@/lib/log/dates";
import type { PlanSettings } from "@/lib/plan/settings";

// Mirrors the planned_sessions enums in src/db/schema.ts (the engine never imports @/db).
export type DraftKind = "swim" | "bike" | "run" | "strength" | "lower_leg" | "core" | "mobility" | "rest";
export type DraftIntensity = "z1" | "z2" | "tempo" | "threshold" | "intervals" | "strength" | "easy";
export type StrengthTemplate = "upperA" | "lower" | "upperB";

export type PlannedSessionDraft = {
  localDate: string;
  slot: number;
  kind: DraftKind;
  title: string;
  durationMin: number;
  intensity: DraftIntensity;
  details: Record<string, unknown>;
  ruleIds: string[];
};

export type BuildWeekInput = {
  /** Monday of the week (YYYY-MM-DD, owner-local). */
  weekStart: string;
  /** Season week index (0 = first week); walk-run applies while < volume.run.walkRunWeeks. */
  weekIndex: number;
  phase: Phase;
  recovery: boolean;
  targets: WeeklyTargets;
  settings: PlanSettings;
  /** Longest single run in the last volume.run.longRunLookbackDays days; null = no extra cap. */
  longestRunMinLastLookback: number | null;
  /** Strength templates to place, in chronological order. Defaults to Upper A, Lower, Upper B. */
  strengthDays?: StrengthTemplate[];
};

type Sport = "swim" | "bike" | "run";
type Hard = "tempo" | "threshold" | "intervals";

type Cardio = {
  sport: Sport;
  dow: number;
  durationMin: number;
  long: boolean;
  intensity: DraftIntensity;
  details: Record<string, unknown>;
  ruleIds: RuleId[];
};

// Calendar and unit constants, not tunable thresholds.
const DAYS_PER_WEEK = 7;
const MIN_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
/** Easy minutes beyond the warm-up and cool-down minimums are split evenly between them. */
const WARMUP_COOLDOWN_PARTS = 2;
const PERCENT = 100;
const MONDAY = 1;

/** Placement order: the most constrained sport first. */
const SPORTS: Sport[] = ["run", "bike", "swim"];
const DEFAULT_STRENGTH: StrengthTemplate[] = ["upperA", "lower", "upperB"];
const HARD: ReadonlySet<DraftIntensity> = new Set<DraftIntensity>(["tempo", "threshold", "intervals"]);
/** Quality types rotate by week index so consecutive build weeks differ. */
const RUN_QUALITY: Hard[] = ["tempo", "intervals"];
const BIKE_QUALITY: Hard[] = ["tempo", "threshold"];
const STRENGTH_TITLE: Record<StrengthTemplate, string> = { upperA: "Upper A", lower: "Lower", upperB: "Upper B" };
const KIND_ORDER: DraftKind[] = ["run", "bike", "swim", "strength", "lower_leg", "core", "mobility", "rest"];

/** Days apart on a weekly cycle, so Sunday and the next Monday count as adjacent. */
function circularGap(a: number, b: number): number {
  const g = Math.abs(a - b) % DAYS_PER_WEEK;
  return Math.min(g, DAYS_PER_WEEK - g);
}
const adjacent = (a: number, b: number) => circularGap(a, b) === 1;

function pushRule(ids: RuleId[], ...add: RuleId[]) {
  for (const id of add) if (!ids.includes(id)) ids.push(id);
}

/** All k-element subsets of xs, in lexicographic order. */
function combinations<T>(xs: T[], k: number): T[][] {
  if (k === 0) return [[]];
  const out: T[][] = [];
  xs.forEach((x, i) => {
    for (const rest of combinations(xs.slice(i + 1), k - 1)) out.push([x, ...rest]);
  });
  return out;
}

/** Lexicographic compare of score tuples (lower is better). */
function compareScores(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

function fmtDuration(min: number): string {
  if (min < MIN_PER_HOUR) return `${min} min`;
  const h = Math.floor(min / MIN_PER_HOUR);
  const m = min % MIN_PER_HOUR;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Add `extra` minutes to `targets` in order, each up to `maxEach`. Returns what did not fit.
 */
function spread(extra: number, targets: Cardio[], maxEach: number): number {
  let left = extra;
  for (const t of targets) {
    if (left <= 0) break;
    const room = Math.max(0, maxEach - t.durationMin);
    const add = Math.min(room, left);
    t.durationMin += add;
    left -= add;
  }
  return left;
}

function assertMonday(weekStart: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(weekStart);
  if (!m) throw new RangeError(`not a YYYY-MM-DD date: ${weekStart}`);
  const [y, mo, d] = m.slice(1).map(Number);
  const ms = Date.UTC(y, mo - 1, d);
  if (new Date(ms).toISOString().slice(0, 10) !== weekStart) throw new RangeError(`invalid date: ${weekStart}`);
  if (new Date(ms).getUTCDay() !== MONDAY) throw new RangeError(`weekStart must be a Monday: ${weekStart}`);
}

export function buildWeek(input: BuildWeekInput): PlannedSessionDraft[] {
  const { weekStart, weekIndex, phase, recovery, targets, settings } = input;
  assertMonday(weekStart);
  const { restDow, longRideDow, longRunDow } = settings;
  if (new Set([restDow, longRideDow, longRunDow]).size !== 3) {
    throw new RangeError("long ride, long run and rest day must be three different days");
  }

  const WT = RULES["week.template"].params;
  const RUN = RULES["volume.run"].params;
  const { lowShare } = RULES["intensity.distribution"].params;
  const SPACING = RULES["concurrent.spacing"].params;
  const JOINT = RULES["pain.jointStatus"].params;
  const LL = RULES["lower_leg.block"].params;

  const status = settings.jointStatus;
  const runAllowed = status === "restricted" ? JOINT.restricted.run : true;
  const plyoAllowed = status === "unrestricted" ? true : JOINT[status].plyo;
  const walkRun = weekIndex < RUN.walkRunWeeks;
  const taperLike = phase === "taper" || phase === "race";
  const buildLike = phase === "build" || phase === "peak";

  const days = Array.from({ length: DAYS_PER_WEEK }, (_, d) => d).filter((d) => d !== restDow);
  const longDow: Record<Sport, number> = { run: longRunDow, bike: longRideDow, swim: longRunDow };
  const minutes: Record<Sport, number> = {
    run: runAllowed ? targets.runMin : 0,
    bike: targets.bikeMin,
    swim: targets.swimMin,
  };

  // ---- 1. Split each sport's minutes into sessions -----------------------------------------
  const cardio: Cardio[] = [];
  const baseRules = (sport: Sport): RuleId[] => {
    const ids: RuleId[] = ["volume.split", "intensity.distribution", "week.template"];
    if (recovery) ids.push("season.recoveryWeek");
    if (taperLike) ids.push("season.phases");
    if (sport === "run" && walkRun) ids.push("volume.run");
    return ids;
  };

  for (const sport of SPORTS) {
    const total = minutes[sport];
    if (total <= 0) continue;
    const [lo, hi] = WT.sessionsPerWeek[sport];
    const n = Math.min(hi, Math.max(lo, Math.round(total / WT.typicalSessionMin[sport])));
    const longMin = n === 1 ? total : Math.round(total * Math.max(WT.longShare, 1 / n));
    const long: Cardio = {
      sport,
      dow: longDow[sport],
      durationMin: longMin,
      long: true,
      intensity: "z2",
      details: { long: true },
      ruleIds: baseRules(sport),
    };
    cardio.push(long);

    // Place the other sessions on the days farthest from this sport's days, then the quietest.
    const placed: Cardio[] = [];
    const others = n - 1;
    for (let i = 0; i < others; i++) {
      const used = [long, ...placed].map((c) => c.dow);
      const runDays = cardio.filter((c) => c.sport === "run").map((c) => c.dow);
      let best: { d: number; score: number[] } | null = null;
      for (const d of days) {
        if (used.includes(d)) continue;
        if (sport === "run" && walkRun && runDays.some((r) => adjacent(r, d))) continue;
        const gap = Math.min(...used.map((u) => circularGap(u, d)));
        const load = cardio.filter((c) => c.dow === d).length;
        const score = [-gap, load, d];
        if (!best || compareScores(score, best.score) < 0) best = { d, score };
      }
      if (!best) break; // no legal day left (walk-run spacing): its minutes merge below
      const c: Cardio = { sport, dow: best.d, durationMin: 0, long: false, intensity: "z2", details: {}, ruleIds: baseRules(sport) };
      placed.push(c);
      cardio.push(c);
    }
    // Share the rest evenly, earliest days first for the remainder; never above the long session.
    const rest = total - longMin;
    placed.sort((a, b) => a.dow - b.dow);
    if (placed.length === 0) long.durationMin += rest;
    else {
      const each = Math.floor(rest / placed.length);
      placed.forEach((c, i) => (c.durationMin = each + (i < rest - each * placed.length ? 1 : 0)));
      const over = placed.reduce((t, c) => t + Math.max(0, c.durationMin - long.durationMin), 0);
      for (const c of placed) c.durationMin = Math.min(c.durationMin, long.durationMin);
      long.durationMin += over;
    }
  }

  const ofSport = (s: Sport) => cardio.filter((c) => c.sport === s);
  const longOf = (s: Sport) => cardio.find((c) => c.sport === s && c.long);

  // ---- 2. Single-run cap (Ruling 6, volume.run) ---------------------------------------------
  let runCap = Number.POSITIVE_INFINITY;
  const longRun = longOf("run");
  const lookback = input.longestRunMinLastLookback;
  if (longRun && lookback !== null && lookback > 0) {
    runCap = Math.floor(lookback * (1 + RUN.longRunMaxIncreasePct / PERCENT));
    const runs = ofSport("run");
    let trimmed = 0;
    for (const r of runs) {
      if (r.durationMin > runCap) {
        trimmed += r.durationMin - runCap;
        r.durationMin = runCap;
        pushRule(r.ruleIds, "volume.run");
      }
    }
    if (trimmed > 0) {
      // Move trimmed minutes to the other runs only while each stays within the cap.
      const dropped = spread(trimmed, runs.filter((r) => !r.long).sort((a, b) => a.dow - b.dow), runCap);
      longRun.details.longRunCap = {
        capMin: runCap,
        lookbackLongestMin: lookback,
        lookbackDays: RUN.longRunLookbackDays,
        trimmedMin: trimmed,
        movedMin: trimmed - dropped,
        droppedMin: dropped,
      };
      pushRule(longRun.ruleIds, "volume.run");
    }
  }

  // ---- 3. Long-session bound: never more than round(sport total × max(longShare, 1/n)) -----
  for (const sport of SPORTS) {
    const lg = longOf(sport);
    if (!lg) continue;
    const n = ofSport(sport).length;
    const bound = Math.round(minutes[sport] * Math.max(WT.longShare, 1 / n));
    if (lg.durationMin > bound) {
      lg.details.longBound = { boundMin: bound, droppedMin: lg.durationMin - bound };
      lg.durationMin = bound;
      pushRule(lg.ruleIds, "week.template");
    }
  }

  // ---- 4. Intensity -------------------------------------------------------------------------
  // A quality session keeps its full planned duration; only its hard block (details.hardMin)
  // counts against the (1 − lowShare) budget, and the rest is easy warm-up and cool-down.
  const totalEndurance = () => cardio.reduce((t, c) => t + c.durationMin, 0);
  const hardBudget = Math.floor((1 - lowShare) * totalEndurance());
  /** The sport's non-long session farthest from its long day; ties go to the earliest day. */
  const pickEasy = (s: Sport): Cardio | undefined => {
    const lg = longOf(s);
    return ofSport(s)
      .filter((c) => !c.long)
      .sort((a, b) => (lg ? circularGap(b.dow, lg.dow) - circularGap(a.dow, lg.dow) : 0) || a.dow - b.dow)[0];
  };

  const quality: { sport: Sport; type: Hard }[] = [];
  // pain.jointStatus "restricted": no quality at all, so a tightening status never adds hard minutes.
  if (!recovery && status !== "restricted") {
    const pick = <T>(xs: T[]) => xs[weekIndex % xs.length];
    if (buildLike) {
      if (!walkRun) quality.push({ sport: "run", type: pick(RUN_QUALITY) });
      quality.push({ sport: "bike", type: pick(BIKE_QUALITY) });
    } else if (taperLike) {
      if (!walkRun) quality.push({ sport: "run", type: "intervals" });
      quality.push({ sport: "bike", type: pick(BIKE_QUALITY) }, { sport: "swim", type: "intervals" });
    } else if (phase === "base" && !walkRun) {
      const r = pickEasy("run");
      if (r) {
        r.details.strides = { reps: WT.strides.reps, seconds: WT.strides.seconds, note: "Strides at the end, easy jog between" };
        pushRule(r.ruleIds, "intensity.distribution");
      }
    }
  }

  let budgetLeft = hardBudget;
  // Taper shares the budget so every sport keeps a short quality block.
  const perSession = taperLike && quality.length ? Math.floor(hardBudget / quality.length) : hardBudget;
  for (const q of quality) {
    const c = pickEasy(q.sport);
    if (!c) continue;
    // The hard block never exceeds maxHardShareOfSession and always leaves room for the minimum
    // warm-up and cool-down.
    const hardMin = Math.min(
      budgetLeft,
      perSession,
      Math.floor(c.durationMin * WT.maxHardShareOfSession),
      c.durationMin - WT.minWarmUpMin - WT.minCoolDownMin,
    );
    if (hardMin < WT.qualityMinMin) continue;
    budgetLeft -= hardMin;
    c.intensity = q.type;
    // Easy minutes beyond the minimums are split evenly; the warm-up takes the odd minute.
    const spare = c.durationMin - hardMin - WT.minWarmUpMin - WT.minCoolDownMin;
    const coolDown = WT.minCoolDownMin + Math.floor(spare / WARMUP_COOLDOWN_PARTS);
    const warmUp = c.durationMin - hardMin - coolDown;
    const parts = [`${warmUp} min warm-up`, `${hardMin} min ${q.type}`, `${coolDown} min cool-down`];
    c.details.hardMin = hardMin;
    c.details.structure = { warmUpMin: warmUp, hardMin, coolDownMin: coolDown };
    c.details.note = parts.join(" · ");
    pushRule(c.ruleIds, "intensity.distribution");
  }

  // Walk-run intervals, from the final durations.
  if (walkRun) {
    const w = WT.walkRun;
    const planRun = w.startRunMin + Math.floor(weekIndex / w.everyWeeks) * w.stepRunMin;
    for (const r of ofSport("run")) {
      let runMin = planRun;
      let walkMin = w.walkMin;
      if (runMin + walkMin > r.durationMin) {
        // Not even one full cycle fits: shorten the cycle to the session, walking first.
        walkMin = Math.min(w.walkMin, r.durationMin);
        runMin = r.durationMin - walkMin;
      }
      const reps = Math.floor(r.durationMin / (runMin + walkMin));
      r.details.intervals = { runMin, walkMin, reps };
      const extraWalk = r.durationMin - reps * (runMin + walkMin);
      if (extraWalk > 0) r.details.extraWalkMin = extraWalk;
    }
  }

  // Drop anything trimmed to nothing.
  const sessions = cardio.filter((c) => c.durationMin > 0);

  if (!runAllowed && targets.runMin > 0) {
    // pain.jointStatus "restricted": running is paused and its minutes are not reallocated.
    const first = [...sessions].sort(
      (a, b) => a.dow - b.dow || KIND_ORDER.indexOf(a.sport) - KIND_ORDER.indexOf(b.sport),
    )[0];
    if (first) {
      const paused = `Running paused (joint status: ${status})`;
      first.details.note = first.details.note ? `${paused} · ${String(first.details.note)}` : paused;
      pushRule(first.ruleIds, "pain.jointStatus");
    }
  }

  // ---- 5. Strength days ---------------------------------------------------------------------
  const keyRunDays = new Set(sessions.filter((c) => c.sport === "run" && (c.long || HARD.has(c.intensity))).map((c) => c.dow));
  const hardCardioDays = new Set(sessions.filter((c) => c.long || HARD.has(c.intensity)).map((c) => c.dow));
  // concurrent.spacing: no Lower day within noLowerDayWithinHoursBeforeKeyRun before a key run.
  const spacingDays = Math.ceil(SPACING.noLowerDayWithinHoursBeforeKeyRun / HOURS_PER_DAY);
  const tooCloseBeforeKeyRun = (d: number) =>
    [...keyRunDays].some((k) => {
      const ahead = (k - d + DAYS_PER_WEEK) % DAYS_PER_WEEK;
      return ahead >= 1 && ahead <= spacingDays;
    });
  const templates = input.strengthDays ?? DEFAULT_STRENGTH;
  let strengthPlan: { dow: number; template: StrengthTemplate }[] = [];
  if (templates.length) {
    let best: { combo: number[]; score: number[] } | null = null;
    for (const combo of combinations(days, templates.length)) {
      if (combo.some((d, i) => templates[i] === "lower" && tooCloseBeforeKeyRun(d))) continue;
      const pairs = combinations(combo, 2).filter(([a, b]) => adjacent(a, b)).length;
      const onLongRun = combo.filter((d) => d === longRunDow).length;
      const onLongRide = combo.filter((d) => d === longRideDow).length;
      const onHard = combo.filter((d) => hardCardioDays.has(d)).length;
      const score = [pairs, onLongRun, onLongRide, onHard];
      if (!best || compareScores(score, best.score) < 0) best = { combo, score };
    }
    if (!best) throw new Error("no strength layout keeps the Lower day away from key runs");
    strengthPlan = best.combo.map((dow, i) => ({ dow, template: templates[i] }));
  }
  const strengthDows = new Set(strengthPlan.map((s) => s.dow));

  // ---- 6. Core on strength days (upper days first) ------------------------------------------
  const coreDows = new Set(
    [...strengthPlan]
      .sort((a, b) => Number(a.template === "lower") - Number(b.template === "lower") || a.dow - b.dow)
      .slice(0, WT.coreSessionsPerWeek)
      .map((s) => s.dow),
  );

  // ---- 7. Lower-leg blocks: non-consecutive, away from the day before a key run -------------
  const upperDows = new Set(strengthPlan.filter((s) => s.template !== "lower").map((s) => s.dow));
  let llBest: { combo: number[]; score: number[] } | null = null;
  for (const combo of combinations(days, LL.sessionsPerWeek)) {
    if (combinations(combo, 2).some(([a, b]) => adjacent(a, b))) continue;
    const beforeKey = combo.filter(tooCloseBeforeKeyRun).length;
    const offUpper = combo.filter((d) => !upperDows.has(d)).length;
    const score = [beforeKey, offUpper];
    if (!llBest || compareScores(score, llBest.score) < 0) llBest = { combo, score };
  }
  if (!llBest) throw new Error("no non-consecutive days left for the lower-leg blocks");
  const lowerLegDows = new Set(llBest.combo);

  // ---- 8. Assemble per day ------------------------------------------------------------------
  const twoWindows = settings.windows.length > 1;
  const out: PlannedSessionDraft[] = [];
  for (let dow = 0; dow < DAYS_PER_WEEK; dow++) {
    const localDate = addDays(weekStart, dow);
    if (dow === restDow) {
      out.push({ localDate, slot: 0, kind: "rest", title: "Rest", durationMin: 0, intensity: "easy", details: {}, ruleIds: ["week.template"] });
      continue;
    }
    const day: Omit<PlannedSessionDraft, "localDate" | "slot">[] = [];
    const dayCardio = sessions
      .filter((c) => c.dow === dow)
      .sort((a, b) => KIND_ORDER.indexOf(a.sport) - KIND_ORDER.indexOf(b.sport));
    for (const c of dayCardio) {
      day.push({
        kind: c.sport,
        title: cardioTitle(c),
        durationMin: c.durationMin,
        intensity: c.intensity,
        details: { ...c.details, window: c.sport === "swim" && c.long && twoWindows ? 1 : 0 },
        ruleIds: [...c.ruleIds],
      });
    }
    const st = strengthPlan.find((s) => s.dow === dow);
    let liftWindow = 0;
    if (st) {
      const ids: RuleId[] = ["strength.frequency", "week.template"];
      const details: Record<string, unknown> = { template: st.template };
      if (st.template === "lower") {
        pushRule(ids, "concurrent.spacing", "pain.jointStatus");
        if (plyoAllowed) details.plyo = true;
      }
      if (dayCardio.length) {
        pushRule(ids, "concurrent.spacing");
        if (twoWindows) liftWindow = 1;
        else details.note = `Separate cardio and lifting by at least ${SPACING.minHoursBetweenHardCardioAndLift} h`;
      }
      details.window = liftWindow;
      day.push({ kind: "strength", title: STRENGTH_TITLE[st.template], durationMin: WT.strengthMin, intensity: "strength", details, ruleIds: ids });
    }
    if (lowerLegDows.has(dow)) {
      day.push({ kind: "lower_leg", title: "Lower-leg block", durationMin: WT.lowerLegMin, intensity: "easy", details: { window: liftWindow }, ruleIds: ["lower_leg.block"] });
    }
    if (coreDows.has(dow) && strengthDows.has(dow)) {
      day.push({ kind: "core", title: "Core", durationMin: WT.coreMin, intensity: "easy", details: { window: liftWindow }, ruleIds: ["week.template"] });
    }
    day.forEach((x, slot) => out.push({ localDate, slot, ...x }));
  }
  return out;
}

function cardioTitle(c: Cardio): string {
  const dur = fmtDuration(c.durationMin);
  const iv = c.details.intervals as { runMin: number; walkMin: number; reps: number } | undefined;
  if (c.sport === "run" && iv) {
    return `${c.long ? "Long walk-run" : "Walk-run"} ${iv.reps}×(${iv.runMin} run/${iv.walkMin} walk)`;
  }
  const noun = { swim: "swim", bike: "ride", run: "run" }[c.sport];
  switch (c.intensity) {
    case "tempo":
      return `Tempo ${noun} ${dur}`;
    case "threshold":
      return `Threshold ${noun} ${dur}`;
    case "intervals":
      return `${noun[0].toUpperCase()}${noun.slice(1)} intervals ${dur}`;
    default:
      if (c.long) return `Long ${noun} ${dur}`;
      return `Easy ${noun} ${dur}${c.details.strides ? " + strides" : ""}`;
  }
}
