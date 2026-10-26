import { describe, it, expect } from "vitest";
import { RULES } from "@/lib/engine/rules/catalog";
import {
  calibrateTdee,
  dayTargets,
  initialTdee,
  microTargets,
  plannedExerciseKcal,
  weeklyCalorieTarget,
  type DayTargetsInput,
} from "@/lib/engine/energy";

const PROT = RULES["nutrition.protein"].params;
const CARB = RULES["nutrition.carbsByLoad"].params;
const FAT = RULES["nutrition.fatMin"].params;
const EA = RULES["nutrition.energyAvailability"].params;
const CAL = RULES["nutrition.calibration"].params;
const INIT = RULES["nutrition.initialTdee"].params;
const DIST = RULES["nutrition.dayDistribution"].params;
const EX = RULES["nutrition.exerciseKcal"].params;

/** Seeded PRNG (mulberry32), test-only, so property runs are reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (r: () => number, lo: number, hi: number) => lo + r() * (hi - lo);

const noData = { whoopKcalDaily: [], bmrKcal: null, weightKg: null, heightCm: null, ageYears: null, sex: null } as const;

describe("initialTdee fallback chain (Review Focus 2)", () => {
  it("uses the WHOOP mean when enough days exist", () => {
    const r = initialTdee({ ...noData, whoopKcalDaily: Array(10).fill(2800), bmrKcal: 1800 });
    expect(r.method).toBe("whoop");
    expect(r.tdee).toBe(2800);
    expect(r.ruleIds).toContain("nutrition.initialTdee");
  });

  it("only averages the last whoopWindowDays days and ignores empty days", () => {
    const old = Array(20).fill(9000);
    const recent = [...Array(INIT.whoopWindowDays - 2).fill(2500), 0, Number.NaN];
    const r = initialTdee({ ...noData, whoopKcalDaily: [...old, ...recent] });
    expect(r.method).toBe("whoop");
    expect(r.tdee).toBe(2500);
  });

  it("falls back to scan BMR x activity factor with fewer than whoopDaysMin days", () => {
    const r = initialTdee({ ...noData, whoopKcalDaily: Array(INIT.whoopDaysMin - 1).fill(2800), bmrKcal: 1800 });
    expect(r.method).toBe("bmr");
    expect(r.tdee).toBe(Math.round(1800 * INIT.fallbackActivityFactor));
  });

  it("falls back to Mifflin-St Jeor without a scan", () => {
    const r = initialTdee({ ...noData, whoopKcalDaily: [2800, 2900], weightKg: 75, heightCm: 180, ageYears: 30, sex: "male" });
    const m = INIT.mifflin;
    const ree = m.kgCoef * 75 + m.cmCoef * 180 - m.ageCoef * 30 + m.maleConst;
    expect(r.method).toBe("mifflin");
    expect(r.tdee).toBe(Math.round(ree * INIT.fallbackActivityFactor));
  });

  it("uses the female constant for female", () => {
    const r = initialTdee({ ...noData, weightKg: 60, heightCm: 165, ageYears: 30, sex: "female" });
    const m = INIT.mifflin;
    expect(r.tdee).toBe(Math.round((m.kgCoef * 60 + m.cmCoef * 165 - m.ageCoef * 30 + m.femaleConst) * INIT.fallbackActivityFactor));
  });

  it("returns null with nothing to go on", () => {
    const r = initialTdee(noData);
    expect(r).toMatchObject({ tdee: null, method: "none" });
    expect(r.reasons[0].text).toMatch(/Log a weight and scan/);
  });

  it("needs every Mifflin input (no sex → none)", () => {
    const r = initialTdee({ ...noData, weightKg: 75, heightCm: 180, ageYears: 30 });
    expect(r).toMatchObject({ tdee: null, method: "none" });
  });
});

describe("calibrateTdee", () => {
  const flat = (n: number, v: number) => Array<number>(n).fill(v);

  it("intake 3000, flat weight over 14 days, previous 2700 → +150 (clamped), medium", () => {
    const r = calibrateTdee({ previousTdee: 2700, intakeKcal: flat(14, 3000), weightLbTrend: flat(14, 165), windowDays: 14 });
    expect(r.tdee).toBe(2700 + CAL.maxWeeklyStepKcal);
    expect(r.confidence).toBe("medium");
    expect(r.changed).toBe(true);
    expect(r.ruleIds).toContain("nutrition.calibration");
  });

  it("only 6 days of data → unchanged, low", () => {
    const intake: (number | null)[] = [...flat(6, 3000), ...Array(8).fill(null)];
    const r = calibrateTdee({ previousTdee: 2700, intakeKcal: intake, weightLbTrend: flat(14, 165), windowDays: 14 });
    expect(r).toMatchObject({ tdee: 2700, confidence: "low", changed: false });
  });

  it("no intake and no weight data → unchanged, low, no crash", () => {
    const r = calibrateTdee({ previousTdee: 2700, intakeKcal: [], weightLbTrend: [], windowDays: 14 });
    expect(r).toMatchObject({ tdee: 2700, confidence: "low", changed: false });
  });

  it("subtracts the weight trend: gaining 0.1 lb/day at 3000 intake → estimate 2650", () => {
    const w = Array.from({ length: 14 }, (_, i) => 160 + 0.1 * i);
    const r = calibrateTdee({ previousTdee: 2700, intakeKcal: flat(14, 3000), weightLbTrend: w, windowDays: 14 });
    // 3000 − 0.1 × 3500 = 2650, within the step cap.
    expect(r.tdee).toBeCloseTo(3000 - 0.1 * CAL.kcalPerLbChange, 6);
  });

  it("is high confidence with highConfidenceDays of paired data", () => {
    const n = CAL.highConfidenceDays;
    const r = calibrateTdee({ previousTdee: 2900, intakeKcal: flat(n, 3000), weightLbTrend: flat(n, 165), windowDays: CAL.windowDays });
    expect(r.confidence).toBe("high");
  });

  it("property (Review Focus 3): never moves more than the step cap per call", () => {
    const r = rng(42);
    for (let k = 0; k < 2000; k++) {
      const n = Math.floor(between(r, 0, 40));
      const slope = between(r, -1, 1); // up to 1 lb/day either way: absurd on purpose
      const intake = Array.from({ length: n }, () => (r() < 0.2 ? null : between(r, 0, 9000)));
      const weight = Array.from({ length: n }, (_, i) => (r() < 0.2 ? null : 150 + slope * i));
      const prev = between(r, 1500, 5000);
      const out = calibrateTdee({ previousTdee: prev, intakeKcal: intake, weightLbTrend: weight, windowDays: CAL.windowDays });
      expect(Math.abs(out.tdee - prev)).toBeLessThanOrEqual(CAL.maxWeeklyStepKcal + 1e-9);
    }
  });
});

describe("calibrateTdee hardening (Plan 5 Task 7)", () => {
  const flat = (n: number, v: number) => Array<number>(n).fill(v);

  it("treats intake ≤ 0 as not logged", () => {
    // 14 days of weight, but only 6 real intake days: the zeros and negatives are missing, not 0 kcal.
    const intake = [...flat(6, 3000), 0, 0, -50, 0, 0, 0, 0, 0];
    const r = calibrateTdee({ previousTdee: 2700, intakeKcal: intake, weightLbTrend: flat(14, 165), windowDays: 14 });
    expect(r).toMatchObject({ tdee: 2700, confidence: "low", changed: false });
  });

  it("treats weight ≤ 0 as no trend value", () => {
    const weight = [...flat(6, 165), ...flat(8, 0)];
    const r = calibrateTdee({ previousTdee: 2700, intakeKcal: flat(14, 3000), weightLbTrend: weight, windowDays: 14 });
    expect(r).toMatchObject({ tdee: 2700, confidence: "low", changed: false });
  });

  it("ignores zero weights in the slope (a 0 lb day is not a 165 lb jump)", () => {
    // Counted, the 0 lb first day is a steep "gain" and drags the estimate down to the −150 cap.
    const weight = [0, ...flat(13, 165)];
    const r = calibrateTdee({ previousTdee: 2900, intakeKcal: flat(14, 3000), weightLbTrend: weight, windowDays: 14 });
    expect(r.tdee).toBe(3000);
  });

  it("a non-finite previousTdee falls back to the given initial TDEE", () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 0, -100]) {
      const low = calibrateTdee({ previousTdee: bad, fallbackTdee: 2600, intakeKcal: [], weightLbTrend: [], windowDays: 14 });
      expect(low).toMatchObject({ tdee: 2600, confidence: "low" });
      expect(Number.isFinite(low.tdee)).toBe(true);
      expect(low.reasons[0].text).not.toMatch(/NaN|Infinity/);
      const cal = calibrateTdee({ previousTdee: bad, fallbackTdee: 2600, intakeKcal: flat(14, 3000), weightLbTrend: flat(14, 165), windowDays: 14 });
      expect(cal.tdee).toBe(2600 + CAL.maxWeeklyStepKcal);
    }
  });

  it("throws a RangeError with neither a usable previous nor a fallback TDEE", () => {
    expect(() => calibrateTdee({ previousTdee: Number.NaN, intakeKcal: [], weightLbTrend: [], windowDays: 14 })).toThrow(RangeError);
    expect(() =>
      calibrateTdee({ previousTdee: Number.NaN, fallbackTdee: Number.NaN, intakeKcal: [], weightLbTrend: [], windowDays: 14 }),
    ).toThrow(RangeError);
  });
});

describe("non-finite input guards", () => {
  const base = { tdee: 2800, weightLb: 160, remainingGoalLb: 10, gainPhase: true, phase: "base" as const };

  it("weeklyCalorieTarget throws a RangeError on a non-finite tdee, weight or remaining goal", () => {
    expect(() => weeklyCalorieTarget({ ...base, tdee: Number.NaN })).toThrow(RangeError);
    expect(() => weeklyCalorieTarget({ ...base, weightLb: Number.POSITIVE_INFINITY })).toThrow(RangeError);
    expect(() => weeklyCalorieTarget({ ...base, weightLb: 0 })).toThrow(RangeError);
    expect(() => weeklyCalorieTarget({ ...base, remainingGoalLb: Number.NaN })).toThrow(RangeError);
  });

  it("plannedExerciseKcal throws a RangeError on a non-finite or non-positive weight", () => {
    const s = [{ kind: "run" as const, durationMin: 60, intensity: "z2" }];
    expect(() => plannedExerciseKcal(s, Number.NaN)).toThrow(RangeError);
    expect(() => plannedExerciseKcal(s, 0)).toThrow(RangeError);
  });

  it("plannedExerciseKcal skips a session with a non-finite duration", () => {
    const r = plannedExerciseKcal([{ kind: "run", durationMin: Number.POSITIVE_INFINITY, intensity: "z2" }], 70);
    expect(r.kcal).toBe(0);
  });
});

describe("weeklyCalorieTarget (surplus by phase)", () => {
  const base = { tdee: 2800, weightLb: 160, remainingGoalLb: 10 };
  const surplus = (pct: number) => (160 * pct * CAL.kcalPerLbChange) / 100 / 7;
  const GR = RULES["nutrition.gainRate"].params;

  it("gain phase → 0.5% of bodyweight a week", () => {
    const r = weeklyCalorieTarget({ ...base, gainPhase: true, phase: "base" });
    expect(r.kcal).toBeCloseTo(2800 + surplus(GR.pctBodyweightPerWeek), 6);
    expect(r.ruleIds).toContain("nutrition.gainRate");
  });

  it("build after the gain phase with goal remaining → 0.25%", () => {
    const r = weeklyCalorieTarget({ ...base, gainPhase: false, phase: "build" });
    expect(r.kcal).toBeCloseTo(2800 + surplus(GR.minPct), 6);
  });

  it("peak or taper → none", () => {
    for (const phase of ["peak", "taper", "race"] as const) {
      expect(weeklyCalorieTarget({ ...base, gainPhase: false, phase }).kcal).toBe(2800);
    }
  });

  it("a base or build week after the gain phase names the minPct rate in its reason", () => {
    for (const phase of ["base", "build"] as const) {
      const text = weeklyCalorieTarget({ ...base, gainPhase: false, phase }).reasons[0].text;
      expect(text).toMatch(new RegExp(`^${phase[0].toUpperCase()}${phase.slice(1)} week after the gain phase`));
      expect(text).toContain(`the ${GR.minPct}% rate`);
    }
    expect(weeklyCalorieTarget({ ...base, gainPhase: true, phase: "base" }).reasons[0].text).toContain(`${GR.pctBodyweightPerWeek}%`);
  });

  it("goal reached → none", () => {
    expect(weeklyCalorieTarget({ ...base, remainingGoalLb: 0, gainPhase: true, phase: "base" }).kcal).toBe(2800);
  });
});

describe("plannedExerciseKcal", () => {
  it("uses MET x kg x hours without history", () => {
    const r = plannedExerciseKcal([{ kind: "run", durationMin: 60, intensity: "z2" }], 70);
    expect(r.kcal).toBeCloseTo(EX.defaultMet.run * EX.kcalPerMetKgHour * 70, 6);
  });

  it("prefers WHOOP kcal/min history for that sport", () => {
    const r = plannedExerciseKcal(
      [
        { kind: "bike", durationMin: 90, intensity: "z2" },
        { kind: "swim", durationMin: 30, intensity: "easy" },
      ],
      70,
      { bike: 10 },
    );
    expect(r.kcal).toBeCloseTo(900 + EX.defaultMet.swim * 70 * 0.5, 6);
  });

  it("counts rest as zero", () => {
    expect(plannedExerciseKcal([{ kind: "rest", durationMin: 0, intensity: "easy" }], 70).kcal).toBe(0);
  });
});

const WEEK = [0, 60, 45, 90, 0, 150, 240];
const day = (i: number, over: Partial<DayTargetsInput> = {}): DayTargetsInput => ({
  weeklyAvgKcal: 3200,
  dayEnduranceMin: WEEK[i],
  weekEnduranceMin: WEEK,
  weightKg: 75,
  ffmKg: 64,
  dayExerciseKcal: 0,
  ...over,
});

describe("dayTargets", () => {
  it("protein = gPerKg x weightKg", () => {
    expect(dayTargets(day(1)).proteinG).toBe(Math.round(PROT.gPerKg * 75));
  });

  it("carb tiers: rest day → low tier, 150-min day → tier 3 (cut-off 240 per catalog)", () => {
    const mid = (i: number) => ((CARB.tiers[i].gPerKg[0] + CARB.tiers[i].gPerKg[1]) / 2) * 75;
    expect(dayTargets(day(0)).carbsG).toBe(Math.round(mid(0)));
    expect(dayTargets(day(5)).carbsG).toBe(Math.round(mid(2)));
    expect(dayTargets(day(6, { dayEnduranceMin: 240 })).carbsG).toBe(Math.round(mid(2)));
    expect(dayTargets(day(6, { dayEnduranceMin: 241, weeklyAvgKcal: 5000 })).carbsG).toBe(Math.round(mid(3)));
  });

  it("big days get more kcal than rest days, capped at maxDailySwingPct", () => {
    const rest = dayTargets(day(0)).kcal;
    const big = dayTargets(day(6)).kcal;
    expect(big).toBeGreaterThan(rest);
    expect(big).toBeLessThanOrEqual(3200 * (1 + DIST.maxDailySwingPct / 100) + 1);
    expect(rest).toBeGreaterThanOrEqual(3200 * (1 - DIST.maxDailySwingPct / 100) - 1);
  });

  it("never cuts a training day more than maxTrainingDayCutPct, and the week still averages out", () => {
    // A light Monday (27 min) in a week averaging about 42 min a day, with a full rest day.
    const week = [27, 50, 55, 63, 35, 65, 0];
    const kcal = week.map((m) => dayTargets(day(0, { dayEnduranceMin: m, weekEnduranceMin: week })).kcal);
    for (const [i, m] of week.entries()) {
      if (m > 0) expect(kcal[i], `day ${i}`).toBeGreaterThanOrEqual(Math.floor(3200 * (1 - DIST.maxTrainingDayCutPct / 100)));
    }
    expect(kcal[6]).toBeLessThan(kcal[0]);
    expect(Math.abs(kcal.reduce((a, b) => a + b, 0) - 7 * 3200)).toBeLessThanOrEqual(7);
  });

  it("counts strength minutes in the day's load when given", () => {
    const week = [27, 50, 55, 63, 35, 65, 0];
    const withLift = [27, 100, 55, 113, 35, 115, 0];
    const endurance = dayTargets(day(0, { dayEnduranceMin: 50, weekEnduranceMin: week })).kcal;
    const lifted = dayTargets(day(0, { dayEnduranceMin: 50, weekEnduranceMin: week, dayLoadMin: 100, weekLoadMin: withLift })).kcal;
    expect(lifted).toBeGreaterThan(endurance);
    // Carbs still follow endurance minutes only.
    expect(dayTargets(day(0, { dayEnduranceMin: 50, weekEnduranceMin: week, dayLoadMin: 100, weekLoadMin: withLift })).carbsG).toBe(
      dayTargets(day(0, { dayEnduranceMin: 50, weekEnduranceMin: week })).carbsG,
    );
  });

  it("a flat week gives every day the weekly average", () => {
    const flat = [60, 60, 60, 60, 60, 60, 60];
    expect(dayTargets(day(0, { dayEnduranceMin: 60, weekEnduranceMin: flat })).kcal).toBe(3200);
  });

  it("fat: reduces carbs toward the tier floor before raising kcal", () => {
    // 2000 kcal, 75 kg: protein 540 + mid carbs 1200 = 1740; fat min 400 → carbs must drop.
    const r = dayTargets(day(0, { weeklyAvgKcal: 2000, weekEnduranceMin: Array(7).fill(0), ffmKg: 40 }));
    expect(r.kcal).toBe(2000);
    expect(r.carbsG).toBeLessThan(Math.round(((CARB.tiers[0].gPerKg[0] + CARB.tiers[0].gPerKg[1]) / 2) * 75));
    expect(r.carbsG).toBeGreaterThanOrEqual(Math.floor(CARB.tiers[0].gPerKg[0] * 75));
    expect(r.fatG * 9).toBeGreaterThanOrEqual((FAT.pctKcalMin / 100) * r.kcal);
  });

  it("fat: raises kcal only when carbs are already at the tier floor", () => {
    const r = dayTargets(day(0, { weeklyAvgKcal: 1500, weekEnduranceMin: Array(7).fill(0), ffmKg: 30 }));
    expect(r.fatRaisedKcal).toBe(true);
    expect(r.kcal).toBeGreaterThan(1500);
    expect(r.carbsG).toBe(Math.round(CARB.tiers[0].gPerKg[0] * 75));
    expect(r.fatG * 9).toBeGreaterThanOrEqual((FAT.pctKcalMin / 100) * r.kcal);
  });

  it("floor: kcal ≥ floorKcalPerKgFfm x ffm + exercise; extra goes to carbs", () => {
    const normal = dayTargets(day(6));
    const r = dayTargets(day(6, { dayExerciseKcal: 3000 }));
    const floor = EA.floorKcalPerKgFfm * 64 + 3000;
    expect(r.floorApplied).toBe(true);
    expect(r.kcal).toBeGreaterThanOrEqual(floor);
    expect(r.carbsG).toBeGreaterThan(normal.carbsG);
    expect(r.reasons.some((x) => x.ruleId === "nutrition.energyAvailability")).toBe(true);
  });

  it("floor: without a scan uses the FFM fallback fraction, labelled as an assumption", () => {
    const r = dayTargets(day(6, { ffmKg: null, dayExerciseKcal: 3000 }));
    expect(r.kcal).toBeGreaterThanOrEqual(EA.floorKcalPerKgFfm * EA.ffmFallbackFraction * 75 + 3000);
    const text = r.reasons.find((x) => x.ruleId === "nutrition.energyAvailability")!.text;
    expect(text).toMatch(/assum/i);
    expect(text).toContain(`${EA.ffmFallbackFraction * 100}%`);
  });

  it("fat is never below pctKcalMin of kcal; protein never below min", () => {
    const r = rng(7);
    for (let k = 0; k < 2000; k++) {
      const week = Array.from({ length: 7 }, () => Math.round(between(r, 0, 400)));
      const out = dayTargets({
        weeklyAvgKcal: between(r, 500, 7000),
        dayEnduranceMin: week[Math.floor(r() * 7)],
        weekEnduranceMin: week,
        weightKg: between(r, 45, 120),
        ffmKg: r() < 0.3 ? null : between(r, 35, 95),
        dayExerciseKcal: between(r, 0, 4000),
      });
      expect(out.fatG * 9).toBeGreaterThanOrEqual((FAT.pctKcalMin / 100) * out.kcal);
    }
  });

  it("property (Review Focus 3): kcal ≥ floor over random inputs, even with tiny or huge targets", () => {
    const r = rng(1234);
    for (let k = 0; k < 5000; k++) {
      const week = Array.from({ length: 7 }, () => Math.round(between(r, 0, 400)));
      const weightKg = between(r, 45, 120);
      const ffmKg = r() < 0.3 ? null : between(r, 35, Math.min(95, weightKg));
      const dayExerciseKcal = between(r, 0, 4000);
      const out = dayTargets({
        weeklyAvgKcal: between(r, 0, 9000),
        dayEnduranceMin: week[Math.floor(r() * 7)],
        weekEnduranceMin: week,
        weightKg,
        ffmKg,
        dayExerciseKcal,
      });
      const floor = EA.floorKcalPerKgFfm * (ffmKg ?? EA.ffmFallbackFraction * weightKg) + dayExerciseKcal;
      expect(out.kcal).toBeGreaterThanOrEqual(floor);
      expect(out.proteinG).toBeGreaterThanOrEqual(PROT.minGPerKg * weightKg);
    }
  });

  it("weekly average: 7-day pattern equals weeklyAvgKcal within ±1%", () => {
    const days = WEEK.map((_, i) => dayTargets(day(i)));
    expect(days.some((d) => d.floorApplied || d.fatRaisedKcal)).toBe(false);
    const avg = days.reduce((s, d) => s + d.kcal, 0) / 7;
    expect(Math.abs(avg - 3200) / 3200).toBeLessThanOrEqual(0.01);
  });

  it("weekly average property: holds for every random week with no raised days", () => {
    const r = rng(99);
    let checked = 0;
    for (let k = 0; k < 2000; k++) {
      const week = Array.from({ length: 7 }, () => (r() < 0.3 ? 0 : Math.round(between(r, 20, 300))));
      const weeklyAvgKcal = between(r, 2500, 4500);
      const days = week.map((m) =>
        dayTargets({ weeklyAvgKcal, dayEnduranceMin: m, weekEnduranceMin: week, weightKg: 75, ffmKg: 62, dayExerciseKcal: m * 5 }),
      );
      if (days.some((d) => d.floorApplied || d.fatRaisedKcal)) continue;
      checked++;
      const avg = days.reduce((s, d) => s + d.kcal, 0) / 7;
      expect(Math.abs(avg - weeklyAvgKcal) / weeklyAvgKcal).toBeLessThanOrEqual(0.01);
    }
    expect(checked).toBeGreaterThan(500);
  });

  it("returns a top-level ruleIds listing every reason's rule once", () => {
    const r = dayTargets(day(3));
    expect(r.ruleIds).toEqual([...new Set(r.reasons.map((x) => x.ruleId))]);
    expect(r.ruleIds).toContain("nutrition.energyAvailability");
  });

  it("returns reasons with rule ids", () => {
    const ids = dayTargets(day(3)).reasons.map((x) => x.ruleId);
    for (const id of ["nutrition.protein", "nutrition.carbsByLoad", "nutrition.dayDistribution", "nutrition.fatMin", "nutrition.energyAvailability"]) {
      expect(ids).toContain(id);
    }
  });
});

describe("microTargets", () => {
  it("returns the profile's targets", () => {
    const r = microTargets("male_19_30");
    expect(r.targets?.iron_mg).toEqual({ value: 8, unit: "mg", kind: "rda" });
    expect(r.ruleIds).toEqual(["nutrition.micros"]);
  });

  it("returns null targets without a profile", () => {
    const r = microTargets(null);
    expect(r.targets).toBeNull();
    expect(r.reasons[0].text).toMatch(/profile/i);
  });
});
