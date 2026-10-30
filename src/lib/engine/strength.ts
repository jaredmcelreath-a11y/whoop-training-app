/**
 * Strength templates and prescriptions: the owner's approved Upper A / Lower / Upper B split
 * (spec §8), the lower-leg block and core, plus double progression from last-time history.
 * Pure: history and settings are parameters, every threshold is a rule param.
 *
 * Muscle mapping: sets count fully toward an exercise's primary muscles and at strength.template.indirectSetCredit
 * toward its secondary muscles (rows/pulldowns: biceps, rear delts; presses: triceps, front delts). Primary below:
 *   Machine Chest Press -> chest            Close-Grip Dumbbell Press -> chest + triceps (a true dual press)
 *   Lat Pulldown, Seated Row -> back        Seated Dumbbell Shoulder Press -> front_delts
 *   Dumbbell Lateral Raise -> side_delts    Bent-Over Dumbbell Reverse Fly -> rear_delts
 *   Machine Bicep Curl, Cable Bicep Curl -> biceps      Rope Triceps Pulldown -> triceps
 *   Leg Press, Seated Leg Extension -> quads            Seated Leg Curl -> hamstrings
 *   Barbell Deadlift -> hamstrings + glutes             Glute Abductor Machine -> glutes
 *   Groin Adductor Machine -> adductors                 Machine Calf Press -> calves
 *   Tibialis Raise -> tibialis, Straight-Knee Calf Raise -> gastrocnemius, Bent-Knee Calf Raise -> soleus
 * Upper A + Upper B give every upper muscle 10-14 effective sets a week, trained in both sessions
 * (strength.volume, strength.frequency). The Lower day is the one main lower session a week.
 */
import { RULES, type RuleId } from "@/lib/engine/rules/catalog";
import { classifyExercise, DEFAULT_EXERCISES } from "@/lib/log/exercise-catalog";
import type { PlanSettings } from "@/lib/plan/settings";

/** `muscles` are the primary muscles (full set credit); `secondary` helper muscles get strength.template.indirectSetCredit. */
export type TemplateItem = {
  exercise: string;
  sets: number;
  muscles: string[];
  secondary?: string[];
  unit?: "reps" | "seconds";
};
export type TemplateName = "upperA" | "lower" | "upperB" | "lowerLeg" | "core";
export type History = { sets: { reps: number; weightLb: number | null }[] } | null;
export type PrescribeOpts = { recoveryWeek: boolean; taper: boolean; jointStatus: PlanSettings["jointStatus"] };
export type Prescription = {
  exercise: string;
  sets: number;
  repRange: [number, number];
  targetWeightLb: number | null;
  note: string;
  ruleIds: string[];
};

const LL = RULES["lower_leg.block"].params;
const ST = RULES["strength.template"].params;

const item = (
  exercise: string,
  sets: number,
  muscles: string[],
  secondary?: string[],
  unit?: "reps" | "seconds",
): TemplateItem => ({ exercise, sets, muscles, ...(secondary ? { secondary } : {}), ...(unit ? { unit } : {}) });

// Set counts are the template design itself (checked against strength.volume in tests).
export const TEMPLATES: Record<TemplateName, TemplateItem[]> = {
  upperA: [
    item("Machine Chest Press", 3, ["chest"], ["triceps", "front_delts"]),
    item("Lat Pulldown", 3, ["back"], ["biceps", "rear_delts"]),
    item("Seated Dumbbell Shoulder Press", 3, ["front_delts"], ["triceps", "side_delts"]),
    item("Seated Row", 2, ["back"], ["biceps", "rear_delts"]),
    item("Dumbbell Lateral Raise", 4, ["side_delts"]),
    item("Bent-Over Dumbbell Reverse Fly", 3, ["rear_delts"]),
    item("Machine Bicep Curl", 3, ["biceps"]),
    item("Rope Triceps Pulldown", 1, ["triceps"]),
  ],
  upperB: [
    item("Machine Chest Press", 4, ["chest"], ["triceps", "front_delts"]),
    item("Close-Grip Dumbbell Press", 3, ["chest", "triceps"], ["front_delts"]),
    item("Lat Pulldown", 3, ["back"], ["biceps", "rear_delts"]),
    item("Seated Row", 2, ["back"], ["biceps", "rear_delts"]),
    item("Seated Dumbbell Shoulder Press", 3, ["front_delts"], ["triceps", "side_delts"]),
    item("Dumbbell Lateral Raise", 3, ["side_delts"]),
    item("Bent-Over Dumbbell Reverse Fly", 2, ["rear_delts"]),
    item("Cable Bicep Curl", 2, ["biceps"]),
  ],
  lower: [
    item("Leg Press", 3, ["quads"]),
    item("Seated Leg Extension", 2, ["quads"]),
    item("Seated Leg Curl", 3, ["hamstrings"]),
    item("Barbell Deadlift", 3, ["hamstrings", "glutes"]),
    item("Glute Abductor Machine", 3, ["glutes"]),
    item("Groin Adductor Machine", 2, ["adductors"]),
    item("Machine Calf Press", 3, ["calves"]),
  ],
  lowerLeg: [
    item("Tibialis Raise", LL.tibialisSets, ["tibialis"]),
    item("Straight-Knee Calf Raise", LL.gastrocSets, ["gastrocnemius"]),
    item("Bent-Knee Calf Raise", LL.soleusSets, ["soleus"]),
  ],
  core: [item("Plank", ST.core.sets, ["core"], undefined, "seconds"), item("Dead Bug", ST.core.sets, ["core"])],
};

/** Plyometrics for the Lower day; prescribe() drops them unless the joint status allows plyo. */
export const PLYO: TemplateItem[] = [item("Box Jump", ST.plyo.sets, ["plyo"])];

const PLYO_NAMES = new Set(DEFAULT_EXERCISES.filter((e) => e.category === "plyo").map((e) => e.name));
const CORE_MUSCLE = "core";
const LOWER_LEG_MUSCLES = new Set(["tibialis", "gastrocnemius", "soleus"]);

/** Effective weekly sets per muscle: full credit for primary muscles, half-credit for helpers. */
export function weeklySetsPerMuscle(templates: Record<string, TemplateItem[]>): Record<string, number> {
  const credit = ST.indirectSetCredit;
  const out: Record<string, number> = {};
  for (const items of Object.values(templates))
    for (const it of items) {
      for (const m of it.muscles) out[m] = (out[m] ?? 0) + it.sets;
      for (const m of it.secondary ?? []) out[m] = (out[m] ?? 0) + it.sets * credit;
    }
  return out;
}

const roundHalfUp = (x: number) => Math.floor(x + 0.5);
const PERCENT = 100;

/** About stepPct of the weight, in whole increments, never less than one increment. */
export function progressionStep(weightLb: number, incrementLb: number, stepPct: number): number {
  return incrementLb * Math.max(1, Math.round((weightLb * stepPct) / PERCENT / incrementLb));
}
const dash = (r: readonly [number, number]) => `${r[0]}–${r[1]}`;

function plyoAllowed(status: PlanSettings["jointStatus"]): boolean {
  if (status === "unrestricted") return true;
  return RULES["pain.jointStatus"].params[status].plyo;
}

/**
 * Double progression (strength.progression) from the last session of a lift: one step up when
 * every set reached the top of the range at one weight, else keep the weight. With no history,
 * the calibration note; with history but no weights (bodyweight), aim for the top of the range.
 */
export function suggestLoad(
  range: readonly [number, number],
  h: History,
  incrementLb: number,
): { targetWeightLb: number | null; note: string } {
  const PROG = RULES["strength.progression"].params;
  if (!h || h.sets.length === 0) {
    return { targetWeightLb: null, note: `First time: start light and stop with about ${PROG.calibrationRir} reps left (${dash(range)} reps).` };
  }
  const weights = h.sets.map((s) => s.weightLb).filter((w): w is number => w !== null);
  if (!weights.length) return { targetWeightLb: null, note: `Aim for ${range[1]} reps on every set.` };
  const lastWeight = Math.max(...weights);
  if (PROG.whenAllSetsAtMax && h.sets.every((s) => s.reps >= range[1] && s.weightLb === lastWeight)) {
    const step = progressionStep(lastWeight, incrementLb, PROG.stepPct);
    return { targetWeightLb: lastWeight + step, note: `Hit ${range[1]} reps on every set: add ${step} lb.` };
  }
  return { targetWeightLb: lastWeight, note: `Keep ${lastWeight} lb and aim for more reps on every set (target ${range[1]}).` };
}

/** `increments` maps an exercise name to its load step in lb (default strength.progression.defaultIncrementLb). */
export function prescribe(
  template: TemplateItem[],
  history: Map<string, History>,
  opts: PrescribeOpts,
  increments: Map<string, number> = new Map(),
): Prescription[] {
  const REP = RULES["strength.repRange"].params;
  const PROG = RULES["strength.progression"].params;
  const allowPlyo = plyoAllowed(opts.jointStatus);
  const factor = opts.taper
    ? RULES["strength.taper"].params.volumeFactor
    : opts.recoveryWeek
      ? RULES["season.recoveryWeek"].params.volumeFactor
      : 1;
  const out: Prescription[] = [];

  for (const it of template) {
    const isPlyo = PLYO_NAMES.has(it.exercise);
    if (isPlyo && !allowPlyo) continue;
    const isCore = it.muscles.includes(CORE_MUSCLE);
    const ruleIds: RuleId[] = ["strength.volume"];
    if (opts.taper) ruleIds.push("strength.taper");
    else if (opts.recoveryWeek) ruleIds.push("season.recoveryWeek");
    const sets = factor === 1 ? it.sets : Math.max(1, roundHalfUp(it.sets * factor));

    if (isPlyo) {
      ruleIds.push("strength.template", "pain.jointStatus");
      out.push({
        exercise: it.exercise,
        sets,
        repRange: [ST.plyo.reps, ST.plyo.reps],
        targetWeightLb: null,
        note: "Bodyweight; stop while every rep is still crisp.",
        ruleIds,
      });
      continue;
    }
    if (isCore) {
      ruleIds.push("strength.template");
      const seconds = it.unit === "seconds";
      const range = seconds ? ST.core.holdSeconds : ST.core.reps;
      out.push({
        exercise: it.exercise,
        sets,
        repRange: [range[0], range[1]],
        targetWeightLb: null,
        note: seconds
          ? `Hold ${dash(range)} seconds; add time when it feels easy.`
          : `${dash(range)} slow reps; add reps when it feels easy.`,
        ruleIds,
      });
      continue;
    }

    const isLowerLeg = it.muscles.some((m) => LOWER_LEG_MUSCLES.has(m));
    const compound = classifyExercise(it.exercise).pattern === "compound";
    const range: [number, number] = isLowerLeg
      ? [ST.lowerLegRepRange[0], ST.lowerLegRepRange[1]]
      : compound
        ? [REP.compound[0], REP.compound[1]]
        : [REP.isolation[0], REP.isolation[1]];
    ruleIds.push("strength.repRange", "strength.progression");
    if (isLowerLeg) ruleIds.push("lower_leg.block", "strength.template");
    const increment = increments.get(it.exercise) ?? PROG.defaultIncrementLb;

    const { targetWeightLb, note } = suggestLoad(range, history.get(it.exercise) ?? null, increment);
    out.push({ exercise: it.exercise, sets, repRange: range, targetWeightLb, note, ruleIds });
  }
  return out;
}
