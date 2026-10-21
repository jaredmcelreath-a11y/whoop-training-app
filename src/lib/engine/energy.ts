/**
 * Energy and macro targets. Pure: every input is a parameter and every threshold is a rule
 * param. No DB, no clock.
 *
 * Rule application order (global constraint): energy-availability floor, then protein minimum,
 * then fat minimum, then distribution and calibration. dayTargets computes them in the reverse
 * order so the floor is applied last and can never be undercut.
 *
 * Planned exercise kcal (plannedExerciseKcal) is used ONLY for the energy-availability floor
 * and the caller's day-to-day picture. It is never added on top of a TDEE: a BMR × activity
 * factor TDEE already includes activity, and a WHOOP cycle TDEE already includes workouts.
 */
import { RULES, type MicroProfileName, type MicroTarget, type RuleId } from "@/lib/engine/rules/catalog";
import type { MicroKey } from "@/lib/engine/nutrients";
import type { Phase } from "@/lib/engine/season";

export type Reason = { ruleId: RuleId; text: string };

// Unit conversions, not tunable thresholds.
const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARB = 4;
const KCAL_PER_G_FAT = 9;
const DAYS_PER_WEEK = 7;
const MIN_PER_HOUR = 60;
const PERCENT = 100;

const r0 = (x: number) => Math.round(x);
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const isPos = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x) && x > 0;
const mean = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

// ---------------------------------------------------------------------------
// Initial TDEE
// ---------------------------------------------------------------------------

export type InitialTdeeInput = {
  /** WHOOP cycle kcal per day, oldest first. Zero, negative or non-finite days count as missing. */
  whoopKcalDaily: readonly number[];
  bmrKcal: number | null;
  weightKg: number | null;
  heightCm: number | null;
  ageYears: number | null;
  sex: "male" | "female" | null;
};

export type InitialTdeeResult = {
  tdee: number | null;
  method: "whoop" | "bmr" | "mifflin" | "none";
  ruleIds: RuleId[];
  reasons: Reason[];
};

/**
 * First burn estimate: WHOOP mean (≥ whoopDaysMin days in the last whoopWindowDays), else scan
 * BMR × activity factor, else Mifflin-St Jeor × activity factor, else null. Each step needs its
 * own inputs; nothing is invented.
 */
export function initialTdee(i: InitialTdeeInput): InitialTdeeResult {
  const id = "nutrition.initialTdee" as const;
  const p = RULES[id].params;
  const f = p.fallbackActivityFactor;
  const out = (tdee: number | null, method: InitialTdeeResult["method"], text: string): InitialTdeeResult => ({
    tdee,
    method,
    ruleIds: [id],
    reasons: [{ ruleId: id, text }],
  });

  const recent = i.whoopKcalDaily.slice(-p.whoopWindowDays).filter(isPos);
  if (recent.length >= p.whoopDaysMin) {
    const tdee = r0(mean(recent));
    return out(tdee, "whoop", `WHOOP average daily burn over ${recent.length} days of the last ${p.whoopWindowDays}: ${tdee} kcal.`);
  }
  const short = `${recent.length} WHOOP days (fewer than ${p.whoopDaysMin})`;
  if (isPos(i.bmrKcal)) {
    const tdee = r0(i.bmrKcal * f);
    return out(tdee, "bmr", `${short}, so scan BMR ${r0(i.bmrKcal)} kcal × ${f} activity factor = ${tdee} kcal.`);
  }
  if (isPos(i.weightKg) && isPos(i.heightCm) && isPos(i.ageYears) && i.sex) {
    const m = p.mifflin;
    const ree =
      m.kgCoef * i.weightKg + m.cmCoef * i.heightCm - m.ageCoef * i.ageYears + (i.sex === "male" ? m.maleConst : m.femaleConst);
    if (ree > 0) {
      const tdee = r0(ree * f);
      return out(tdee, "mifflin", `${short} and no scan BMR, so Mifflin-St Jeor resting ${r0(ree)} kcal × ${f} activity factor = ${tdee} kcal.`);
    }
  }
  return out(null, "none", `${short}, no scan BMR and no full weight, height, age and sex. Log a weight and scan to get targets.`);
}

// ---------------------------------------------------------------------------
// Calibration
// ---------------------------------------------------------------------------

export type CalibrateInput = {
  previousTdee: number;
  /** Daily intake kcal, oldest first; null = not logged. */
  intakeKcal: readonly (number | null)[];
  /** Smoothed daily weight trend in lb, same days as intakeKcal; null = no trend value. */
  weightLbTrend: readonly (number | null)[];
  /** The estimate uses the last windowDays days. Confidence counts paired days over everything passed. */
  windowDays: number;
};

export type CalibrateResult = {
  tdee: number;
  confidence: "low" | "medium" | "high";
  changed: boolean;
  ruleIds: RuleId[];
  reasons: Reason[];
};

const finite = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x);

/** Least-squares slope of value vs day index (lb/day). Needs ≥ 2 points. */
function slopePerDay(points: { x: number; y: number }[]): number {
  const mx = mean(points.map((q) => q.x));
  const my = mean(points.map((q) => q.y));
  let num = 0;
  let den = 0;
  for (const q of points) {
    num += (q.x - mx) * (q.y - my);
    den += (q.x - mx) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/**
 * Re-estimate burn from intake and weight trend: mean intake − (Δlb/day × kcalPerLbChange),
 * moved at most ±maxWeeklyStepKcal from previousTdee. Δlb/day is the least-squares slope of the
 * trend over the window (robust to a missing day). Too few paired days → previousTdee, "low".
 */
export function calibrateTdee(i: CalibrateInput): CalibrateResult {
  const id = "nutrition.calibration" as const;
  const p = RULES[id].params;
  const n = Math.min(i.intakeKcal.length, i.weightLbTrend.length);
  const pairedAll = Array.from({ length: n }, (_, k) => k).filter((k) => finite(i.intakeKcal[k]) && finite(i.weightLbTrend[k]));
  const start = Math.max(0, n - Math.max(1, Math.floor(i.windowDays)));
  const paired = pairedAll.filter((k) => k >= start);

  if (!finite(i.previousTdee) || paired.length < p.minDaysWithData) {
    return {
      tdee: i.previousTdee,
      confidence: "low",
      changed: false,
      ruleIds: [id],
      reasons: [
        {
          ruleId: id,
          text: `Only ${paired.length} days with both intake and weight in the last ${i.windowDays} (needs ${p.minDaysWithData}); the burn estimate stays at ${r0(i.previousTdee)} kcal.`,
        },
      ],
    };
  }

  const meanIntake = mean(paired.map((k) => i.intakeKcal[k] as number));
  const weightPts = Array.from({ length: n - start }, (_, j) => start + j)
    .filter((k) => finite(i.weightLbTrend[k]))
    .map((k) => ({ x: k, y: i.weightLbTrend[k] as number }));
  const lbPerDay = slopePerDay(weightPts);
  const estimate = meanIntake - lbPerDay * p.kcalPerLbChange;
  const step = p.maxWeeklyStepKcal;
  const tdee = clamp(estimate, i.previousTdee - step, i.previousTdee + step);
  const confidence = pairedAll.length >= p.highConfidenceDays ? "high" : "medium";
  const clamped = tdee !== estimate;
  return {
    tdee,
    confidence,
    changed: tdee !== i.previousTdee,
    ruleIds: [id],
    reasons: [
      {
        ruleId: id,
        text:
          `Mean intake ${r0(meanIntake)} kcal over ${paired.length} days minus weight trend ${lbPerDay.toFixed(2)} lb/day × ${p.kcalPerLbChange} kcal/lb = ${r0(estimate)} kcal` +
          (clamped ? `, capped at ±${step} kcal from ${r0(i.previousTdee)}: ${r0(tdee)} kcal.` : ".") +
          ` Confidence ${confidence} (${pairedAll.length} days of data; high from ${p.highConfidenceDays}).`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Weekly calorie target
// ---------------------------------------------------------------------------

export type WeeklyTargetInput = { tdee: number; weightLb: number; gainPhase: boolean; phase: Phase; remainingGoalLb: number };
export type WeeklyTargetResult = { kcal: number; surplusKcal: number; ruleIds: RuleId[]; reasons: Reason[] };

/**
 * Weekly average daily calories. Goal reached, or peak/taper/race week → TDEE (no surplus).
 * Gain phase → pctBodyweightPerWeek surplus; other base/build weeks → minPct.
 * Surplus kcal/day = weightLb × pct/100 × kcalPerLbChange / 7.
 */
export function weeklyCalorieTarget(i: WeeklyTargetInput): WeeklyTargetResult {
  const id = "nutrition.gainRate" as const;
  const p = RULES[id].params;
  const kcalPerLb = RULES["nutrition.calibration"].params.kcalPerLbChange;
  const none = (why: string): WeeklyTargetResult => ({
    kcal: i.tdee,
    surplusKcal: 0,
    ruleIds: [id],
    reasons: [{ ruleId: id, text: `${why}: no surplus, target is the burn estimate ${r0(i.tdee)} kcal.` }],
  });
  if (i.remainingGoalLb <= 0) return none("Gain goal reached");
  if (i.phase === "peak" || i.phase === "taper" || i.phase === "race") return none(`${i.phase[0].toUpperCase()}${i.phase.slice(1)} week`);
  const pct = i.gainPhase ? p.pctBodyweightPerWeek : p.minPct;
  const surplusKcal = (i.weightLb * pct * kcalPerLb) / PERCENT / DAYS_PER_WEEK;
  return {
    kcal: i.tdee + surplusKcal,
    surplusKcal,
    ruleIds: [id, "nutrition.calibration"],
    reasons: [
      {
        ruleId: id,
        text: `${i.gainPhase ? "Gain phase" : `${i.phase} week after the gain phase`}: gain ${pct}% of ${r0(i.weightLb)} lb a week × ${kcalPerLb} kcal/lb ÷ ${DAYS_PER_WEEK} = +${r0(surplusKcal)} kcal/day on ${r0(i.tdee)} kcal.`,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Planned exercise kcal
// ---------------------------------------------------------------------------

type ExerciseParams = (typeof RULES)["nutrition.exerciseKcal"]["params"];
export type ExerciseKind = keyof ExerciseParams["defaultMet"];
export type PlannedSessionLite = { kind: ExerciseKind | "rest"; durationMin: number; intensity: string };

/**
 * Planned exercise kcal for a day. Per session: durationMin × WHOOP kcal/min for that sport when
 * history has it (callers include a sport only with ≥ historyMinWorkouts workouts in the last
 * historyLookbackDays days), else MET × kcalPerMetKgHour × weightKg × hours. Intensity is
 * accepted but not used: the default METs are easy-to-moderate efforts.
 * Used only for the energy-availability floor; never added on top of a TDEE.
 */
export function plannedExerciseKcal(
  sessions: readonly PlannedSessionLite[],
  weightKg: number,
  history?: Partial<Record<ExerciseKind, number>>,
): { kcal: number; ruleIds: RuleId[]; reasons: Reason[] } {
  const id = "nutrition.exerciseKcal" as const;
  const p = RULES[id].params;
  let kcal = 0;
  const parts: string[] = [];
  for (const s of sessions) {
    if (s.kind === "rest" || !(s.durationMin > 0)) continue;
    const hist = history?.[s.kind];
    if (isPos(hist)) {
      const k = s.durationMin * hist;
      kcal += k;
      parts.push(`${s.kind} ${s.durationMin} min × ${hist.toFixed(1)} kcal/min (WHOOP) = ${r0(k)}`);
    } else {
      const met = p.defaultMet[s.kind];
      const k = met * p.kcalPerMetKgHour * weightKg * (s.durationMin / MIN_PER_HOUR);
      kcal += k;
      parts.push(`${s.kind} ${s.durationMin} min × MET ${met} × ${r0(weightKg)} kg = ${r0(k)}`);
    }
  }
  return {
    kcal,
    ruleIds: [id],
    reasons: [{ ruleId: id, text: parts.length ? `Planned exercise: ${parts.join("; ")} kcal.` : "No planned exercise." }],
  };
}

// ---------------------------------------------------------------------------
// Day targets
// ---------------------------------------------------------------------------

export type DayTargetsInput = {
  weeklyAvgKcal: number;
  /** This day's planned endurance minutes; should be one of weekEnduranceMin. */
  dayEnduranceMin: number;
  /** The 7 days' planned endurance minutes. */
  weekEnduranceMin: readonly number[];
  weightKg: number;
  ffmKg: number | null;
  /** Planned exercise kcal (plannedExerciseKcal); used only for the floor. */
  dayExerciseKcal: number;
};

export type DayTargetsResult = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** The energy-availability floor raised kcal. */
  floorApplied: boolean;
  /** The fat minimum raised kcal (carbs were already at the tier's lower bound). */
  fatRaisedKcal: boolean;
  reasons: Reason[];
};

/**
 * Clamped load swing for one day, normalised so the week's swings average exactly zero.
 * loadFactor = (min − meanWeek) / max(meanWeek, 1), clamped to ±maxDailySwingPct/100. Unclamped
 * factors already sum to zero; clamping breaks that, so the larger side (positive or negative)
 * is scaled down to match the other. Scaling down never exceeds the cap, and the week's kcal
 * then average exactly weeklyAvgKcal before rounding.
 */
function daySwing(dayMin: number, week: number[], cap: number): number {
  const m = week.length ? mean(week) : dayMin;
  const raw = (x: number) => clamp((x - m) / Math.max(m, 1), -cap, cap);
  let pos = 0;
  let neg = 0;
  for (const x of week) {
    const s = raw(x);
    if (s > 0) pos += s;
    else neg -= s;
  }
  const s = raw(dayMin);
  if (s > 0) return pos > neg ? (s * neg) / pos : s;
  if (s < 0) return neg > pos ? (s * pos) / neg : s;
  return 0;
}

/**
 * Daily kcal and macros. Computed in this order, the safety floor last:
 * 1. Protein = gPerKg × weightKg, kept inside minGPerKg..maxGPerKg.
 * 2. Carbs = midpoint of the day's load tier × weightKg.
 * 3. kcal = weeklyAvg × (1 + swing), swing linear in relative load and capped (daySwing).
 * 4. Fat = remainder; below pctKcalMin, carbs drop toward the tier's lower bound first, and only
 *    then is kcal raised. Protein is never cut.
 * 5. Floor = floorKcalPerKgFfm × FFM + exercise kcal (FFM falls back to ffmFallbackFraction ×
 *    weight). Below it, kcal rises to the floor; fat is topped up to pctKcalMin of the new kcal
 *    and the rest goes to carbs.
 */
export function dayTargets(i: DayTargetsInput): DayTargetsResult {
  if (!isPos(i.weightKg)) throw new RangeError(`weightKg must be positive: ${i.weightKg}`);
  const PR = RULES["nutrition.protein"].params;
  const CB = RULES["nutrition.carbsByLoad"].params;
  const FT = RULES["nutrition.fatMin"].params;
  const EA = RULES["nutrition.energyAvailability"].params;
  const DD = RULES["nutrition.dayDistribution"].params;
  const w = i.weightKg;
  const fatFrac = FT.pctKcalMin / PERCENT;
  const reasons: Reason[] = [];

  // 1. Protein.
  const gPerKg = clamp(PR.gPerKg, PR.minGPerKg, PR.maxGPerKg);
  const protein = gPerKg * w;
  reasons.push({ ruleId: "nutrition.protein", text: `Protein ${gPerKg} g/kg × ${r0(w)} kg = ${r0(protein)} g (never below ${PR.minGPerKg} g/kg).` });

  // 2. Carbs.
  const dayMin = Math.max(0, finite(i.dayEnduranceMin) ? i.dayEnduranceMin : 0);
  const tier = CB.tiers.find((t) => dayMin <= t.maxMin) ?? CB.tiers[CB.tiers.length - 1];
  const [lo, hi] = tier.gPerKg;
  const mid = (lo + hi) / 2;
  let carbs = mid * w;
  const carbsMin = lo * w;
  reasons.push({
    ruleId: "nutrition.carbsByLoad",
    text: `${r0(dayMin)} planned endurance min falls in the ${lo}-${hi} g/kg tier; midpoint ${mid} g/kg × ${r0(w)} kg = ${r0(carbs)} g.`,
  });

  // 3. kcal distribution.
  const avg = Math.max(0, finite(i.weeklyAvgKcal) ? i.weeklyAvgKcal : 0);
  const cap = DD.maxDailySwingPct / PERCENT;
  const week = i.weekEnduranceMin.filter(finite).map((x) => Math.max(0, x));
  const swing = daySwing(dayMin, week, cap);
  let kcal = avg * (1 + swing);
  reasons.push({
    ruleId: "nutrition.dayDistribution",
    text:
      `${swing >= 0 ? "+" : ""}${(swing * PERCENT).toFixed(1)}% vs the weekly average ${r0(avg)} kcal = ${r0(kcal)} kcal. ` +
      `The swing is linear in this day's minutes relative to the week's mean, capped at ±${DD.maxDailySwingPct}% and balanced so the week averages out (practice).`,
  });

  // 4. Fat minimum.
  let fatRaisedKcal = false;
  let fatText: string;
  const fatOf = (k: number, c: number) => (k - KCAL_PER_G_PROTEIN * protein - KCAL_PER_G_CARB * c) / KCAL_PER_G_FAT;
  if (fatOf(kcal, carbs) >= (fatFrac * kcal) / KCAL_PER_G_FAT) {
    fatText = `Fat is the remainder, ${r0(fatOf(kcal, carbs))} g (at least ${FT.pctKcalMin}% of kcal).`;
  } else {
    const carbsFit = (kcal * (1 - fatFrac) - KCAL_PER_G_PROTEIN * protein) / KCAL_PER_G_CARB;
    if (carbsFit >= carbsMin) {
      carbs = carbsFit;
      fatText = `Fat kept at ${FT.pctKcalMin}% of kcal by lowering carbs to ${r0(carbs)} g (tier floor ${lo} g/kg).`;
    } else {
      carbs = carbsMin;
      const raised = (KCAL_PER_G_PROTEIN * protein + KCAL_PER_G_CARB * carbs) / (1 - fatFrac);
      fatRaisedKcal = raised > kcal;
      kcal = Math.max(kcal, raised);
      fatText = `Carbs at the tier floor ${lo} g/kg still left fat under ${FT.pctKcalMin}% of kcal, so kcal rose to ${r0(kcal)}.`;
    }
  }
  reasons.push({ ruleId: "nutrition.fatMin", text: fatText });
  let fat = Math.max(fatOf(kcal, carbs), (fatFrac * kcal) / KCAL_PER_G_FAT);

  // 5. Energy-availability floor (last, never undercut).
  const scan = isPos(i.ffmKg);
  const ffm = scan ? (i.ffmKg as number) : EA.ffmFallbackFraction * w;
  const exKcal = isPos(i.dayExerciseKcal) ? i.dayExerciseKcal : 0;
  const floor = EA.floorKcalPerKgFfm * ffm + exKcal;
  const floorApplied = kcal < floor;
  if (floorApplied) {
    kcal = floor;
    fat = Math.max(fat, (fatFrac * kcal) / KCAL_PER_G_FAT);
    carbs = (kcal - KCAL_PER_G_PROTEIN * protein - KCAL_PER_G_FAT * fat) / KCAL_PER_G_CARB;
  }
  reasons.push({
    ruleId: "nutrition.energyAvailability",
    text:
      (scan
        ? `Fat-free mass ${r0(ffm)} kg from the scan. `
        : `No scan: fat-free mass assumed to be ${EA.ffmFallbackFraction * PERCENT}% of bodyweight, ${r0(ffm)} kg (an assumption until a scan replaces it). `) +
      `Floor ${EA.floorKcalPerKgFfm} kcal/kg FFM + ${r0(exKcal)} planned exercise kcal = ${r0(floor)} kcal` +
      (floorApplied ? `; kcal raised to the floor, extra energy to carbs.` : `; target is above it.`),
  });

  // Round, keeping every minimum intact.
  const K = Math.max(r0(kcal), Math.ceil(floor));
  const P = Math.max(r0(protein), Math.ceil(PR.minGPerKg * w));
  let C = r0(carbs);
  const fMin = Math.ceil((fatFrac * K) / KCAL_PER_G_FAT);
  let F = r0((K - KCAL_PER_G_PROTEIN * P - KCAL_PER_G_CARB * C) / KCAL_PER_G_FAT);
  if (F < fMin) {
    F = fMin;
    C = Math.max(0, Math.floor((K - KCAL_PER_G_PROTEIN * P - KCAL_PER_G_FAT * F) / KCAL_PER_G_CARB));
  }
  return { kcal: K, proteinG: P, carbsG: C, fatG: F, floorApplied, fatRaisedKcal, reasons };
}

// ---------------------------------------------------------------------------
// Micro targets
// ---------------------------------------------------------------------------

export type MicroTargets = Record<MicroKey | "fiber_g", MicroTarget>;

/** DRI targets for the reference-intake profile; null targets without a profile. */
export function microTargets(profile: MicroProfileName | null): {
  targets: MicroTargets | null;
  ruleIds: RuleId[];
  reasons: Reason[];
} {
  const id = "nutrition.micros" as const;
  if (!profile) {
    return { targets: null, ruleIds: [id], reasons: [{ ruleId: id, text: "Set a reference-intake profile to get micronutrient targets." }] };
  }
  const src = RULES[id].params.profiles[profile];
  const targets = Object.fromEntries(Object.entries(src).map(([k, v]) => [k, { ...v }])) as MicroTargets;
  return {
    targets,
    ruleIds: [id],
    reasons: [{ ruleId: id, text: `US Dietary Reference Intakes for ${profile.replace(/_/, " ").replace("_", "-")}.` }],
  };
}
