import { describe, it, expect } from "vitest";
import { TEMPLATES, PLYO, prescribe, weeklySetsPerMuscle, type History } from "@/lib/engine/strength";
import { RULES } from "@/lib/engine/rules/catalog";
import { DEFAULT_EXERCISES } from "@/lib/log/exercise-catalog";

const UPPER = ["chest", "back", "front_delts", "side_delts", "rear_delts", "biceps", "triceps"];
const base = { recoveryWeek: false, taper: false, jointStatus: "unrestricted" } as const;
const hist = (name: string, h: History) => new Map<string, History>([[name, h]]);
const sets = (reps: number[], w: number | null) => ({ sets: reps.map((r) => ({ reps: r, weightLb: w })) });
const [MIN, MAX] = RULES["strength.volume"].params.setsPerMusclePerWeek;

describe("templates", () => {
  it("gives every upper muscle 10-14 effective weekly sets, trained in both sessions", () => {
    const week = weeklySetsPerMuscle({ upperA: TEMPLATES.upperA, upperB: TEMPLATES.upperB });
    const freq = RULES["strength.frequency"].params.perMusclePerWeek;
    for (const m of UPPER) {
      const primarySessions = [TEMPLATES.upperA, TEMPLATES.upperB].filter((t) => t.some((i) => i.muscles.includes(m)));
      expect(primarySessions.length, m).toBeGreaterThanOrEqual(freq);
      expect(week[m], m).toBeGreaterThanOrEqual(MIN);
      expect(week[m], m).toBeLessThanOrEqual(MAX);
      for (const t of [TEMPLATES.upperA, TEMPLATES.upperB]) {
        expect(t.some((i) => i.muscles.includes(m) || i.secondary?.includes(m)), m).toBe(true);
      }
    }
  });

  it("no session exceeds maxSetsPerSession", () => {
    const cap = RULES["strength.template"].params.maxSetsPerSession;
    for (const t of [TEMPLATES.upperA, TEMPLATES.upperB, TEMPLATES.lower, [...TEMPLATES.lower, ...PLYO]])
      expect(t.reduce((a, i) => a + i.sets, 0)).toBeLessThanOrEqual(cap);
  });

  it("counts helper muscles at the indirect credit", () => {
    const w = weeklySetsPerMuscle({ x: [{ exercise: "Seated Row", sets: 4, muscles: ["back"], secondary: ["biceps"] }] });
    expect(w).toEqual({ back: 4, biceps: 4 * RULES["strength.template"].params.indirectSetCredit });
  });

  it("lower covers quads, hamstrings, glutes, adductors and calves", () => {
    const w = weeklySetsPerMuscle({ lower: TEMPLATES.lower });
    for (const m of ["quads", "hamstrings", "glutes", "adductors", "calves"]) expect(w[m], m).toBeGreaterThan(0);
  });

  it("lower-leg sets come from lower_leg.block", () => {
    const p = RULES["lower_leg.block"].params;
    expect(TEMPLATES.lowerLeg.map((i) => i.sets)).toEqual([p.tibialisSets, p.gastrocSets, p.soleusSets]);
  });

  it("every exercise name exists in DEFAULT_EXERCISES", () => {
    const names = new Set(DEFAULT_EXERCISES.map((e) => e.name));
    for (const i of [...Object.values(TEMPLATES).flat(), ...PLYO]) expect(names.has(i.exercise), i.exercise).toBe(true);
  });
});

describe("prescribe", () => {
  it("adds the upper step when every set hit the top of the range", () => {
    const [r] = prescribe(TEMPLATES.upperA.slice(0, 1), hist("Machine Chest Press", sets([12, 12, 12], 100)), base);
    expect(r.targetWeightLb).toBe(105);
    expect(r.repRange).toEqual([10, 12]);
    expect(r.ruleIds).toContain("strength.progression");
  });

  it("does not progress when the sets used different weights", () => {
    const h = { sets: [{ reps: 12, weightLb: 100 }, { reps: 12, weightLb: 100 }, { reps: 12, weightLb: 80 }] };
    const [r] = prescribe(TEMPLATES.upperA.slice(0, 1), hist("Machine Chest Press", h), base);
    expect(r.targetWeightLb).toBe(100);
  });

  it("keeps the weight and asks for more reps otherwise", () => {
    const [r] = prescribe(TEMPLATES.upperA.slice(0, 1), hist("Machine Chest Press", sets([12, 11, 10], 100)), base);
    expect(r.targetWeightLb).toBe(100);
    expect(r.note).toMatch(/more reps/);
  });

  it("uses the lower step for leg lifts", () => {
    const [r] = prescribe(TEMPLATES.lower.slice(0, 1), hist("Leg Press", sets([12, 12, 12], 200)), base);
    expect(r.targetWeightLb).toBe(210);
  });

  it("uses the upper step for calf work", () => {
    const calf = TEMPLATES.lower.find((i) => i.exercise === "Machine Calf Press")!;
    const [r] = prescribe([calf], hist("Machine Calf Press", sets([12, 12, 12], 100)), base);
    expect(r.targetWeightLb).toBe(105);
  });

  it("has null weight and the pick-a-weight note with no history", () => {
    const [r] = prescribe(TEMPLATES.upperA.slice(0, 1), new Map(), base);
    expect(r.targetWeightLb).toBeNull();
    expect(r.note).toBe("Pick a weight you can do for 10–12 with 1–3 reps left");
  });

  it("treats a null last weight as no weight history", () => {
    const [r] = prescribe(TEMPLATES.upperA.slice(0, 1), hist("Machine Chest Press", sets([12, 12], null)), base);
    expect(r.targetWeightLb).toBeNull();
  });

  it("reduces sets in recovery and taper weeks, never below 1, rounding half up", () => {
    const one = [{ exercise: "Plank", sets: 1, muscles: ["core"] }];
    expect(prescribe(one, new Map(), { ...base, taper: true })[0].sets).toBe(1);
    const five = [{ exercise: "Lat Pulldown", sets: 5, muscles: ["back"] }];
    expect(prescribe(five, new Map(), { ...base, recoveryWeek: true })[0].sets).toBe(4); // 3.5 -> 4
    expect(prescribe(five, new Map(), { ...base, taper: true })[0].sets).toBe(3);
    expect(prescribe(five, new Map(), { ...base, taper: true })[0].ruleIds).toContain("strength.taper");
    expect(prescribe(five, new Map(), { ...base, recoveryWeek: true })[0].ruleIds).toContain("season.recoveryWeek");
  });

  it("drops plyo for caution and restricted, keeps it when unrestricted", () => {
    const lower = [...TEMPLATES.lower, ...PLYO];
    const has = (js: "unrestricted" | "caution" | "restricted") =>
      prescribe(lower, new Map(), { ...base, jointStatus: js }).some((r) => r.exercise === "Box Jump");
    expect(has("unrestricted")).toBe(true);
    expect(has("caution")).toBe(false);
    expect(has("restricted")).toBe(false);
  });

  it("every line carries strength rule ids", () => {
    const all = Object.values(TEMPLATES).flat();
    for (const r of prescribe([...all, ...PLYO], new Map(), base)) {
      expect(r.ruleIds.length, r.exercise).toBeGreaterThan(0);
      for (const id of r.ruleIds) expect(id in RULES, id).toBe(true);
    }
  });

  it("core has no weight and uses time for planks", () => {
    const out = prescribe(TEMPLATES.core, new Map(), base);
    expect(out.every((r) => r.targetWeightLb === null)).toBe(true);
    expect(out[0].note).toMatch(/seconds/);
  });
});
