import { describe, it, expect } from "vitest";
import { RULES, RULE_IDS, getRule } from "@/lib/engine/rules/catalog";
import { MICRO_KEYS, NUTRIENTS } from "@/lib/engine/nutrients";
import { evidenceRank, type DeepReadonly, type Evidence, type Rule } from "@/lib/engine/rules/types";

type AnyRule = DeepReadonly<Rule<Record<string, unknown>>>;

const all = Object.values(RULES) as AnyRule[];

const EVIDENCE: Evidence[] = ["consensus", "meta-analysis", "trial", "expert", "n-of-1", "practice"];

// Fixed ids and param names (Tasks 3–6 depend on these).
const REQUIRED: Record<string, string[]> = {
  "season.phases": ["taperWeeks", "peakWeeks", "buildWeeks"],
  "season.gainPhase": ["maxWeeks"],
  "season.recoveryWeek": ["every", "volumeFactor"],
  "volume.endurance": ["startHours", "peakHours", "maxWeeklyIncreasePct"],
  "volume.run": ["startMinPerWeek", "maxWeeklyIncreasePct", "absoluteCapWeeklyIncreasePct", "longRunMaxIncreasePct"],
  "volume.split": ["swim", "bike", "run"],
  "volume.loadCheck": ["overPct", "weeks"],
  "intensity.distribution": ["lowShare"],
  "intensity.zones": ["z1", "z2", "z3", "z4", "z5"],
  "recovery.color": ["green", "yellow"],
  "recovery.yellowScale": ["durationFactor", "dropHighIntensity"],
  "recovery.redSwap": ["swapTo", "maxMin"],
  "recovery.hrvTrend": ["rollingDays", "baselineMinDays", "baselineMaxDays", "swcSd"],
  "recovery.rhrTrend": ["rollingDays", "elevatedBpm"],
  "recovery.lowStreak": ["days", "action", "volumeFactor"],
  "recovery.sleepDebt": ["windowDays", "debtMin"],
  "recovery.greenStreak": ["days"],
  "strength.volume": ["setsPerMusclePerWeek"],
  "strength.frequency": ["perMusclePerWeek"],
  "strength.repRange": ["compound", "isolation", "rirCompound", "rirIsolation"],
  "strength.progression": ["stepPct", "defaultIncrementLb", "whenAllSetsAtMax", "calibrationRir"],
  "strength.taper": ["volumeFactor"],
  "concurrent.spacing": ["minHoursBetweenHardCardioAndLift", "noLowerDayWithinHoursBeforeKeyRun"],
  "pain.monitoring": ["maxDuring", "risingSessions", "holdUntilBelowDays"],
  "pain.jointStatus": ["caution", "restricted"],
  "lower_leg.block": ["sessionsPerWeek", "tibialisSets", "soleusSets", "gastrocSets"],
  "week.template": ["sessionsPerWeek", "longShare", "coreSessionsPerWeek", "walkRun"],
  "strain.dailyTarget": ["minDays", "lookbackDays", "lowPercentile", "highPercentile", "fallback"],
  // Plan 4 (nutrition and hydration). Tasks 5–8 depend on these names.
  "nutrition.protein": ["gPerKg", "minGPerKg", "maxGPerKg"],
  "nutrition.proteinPerMeal": ["gPerKgPerMeal", "minMeals"],
  "nutrition.carbsByLoad": ["tiers"],
  "nutrition.fatMin": ["pctKcalMin"],
  "nutrition.energyAvailability": ["floorKcalPerKgFfm", "targetKcalPerKgFfm", "ffmFallbackFraction"],
  "nutrition.gainRate": ["pctBodyweightPerWeek", "minPct"],
  "nutrition.calibration": ["windowDays", "minDaysWithData", "kcalPerLbChange", "maxWeeklyStepKcal", "highConfidenceDays"],
  "nutrition.initialTdee": ["whoopDaysMin", "whoopWindowDays", "fallbackActivityFactor", "mifflin"],
  "nutrition.dayDistribution": ["maxDailySwingPct"],
  "nutrition.preWorkout": ["minSessionMin", "carbsGPerKg", "hoursBefore", "swimNoHeavyMealMin"],
  "nutrition.postWorkout": ["withinHours", "carbsGPerKg", "proteinGPerKg"],
  "nutrition.micros": ["profiles"],
  "nutrition.timeline": ["wakeBeforeWindowMin", "snackAfterWakeMin", "fallbackAwakeMin", "morningSupplementsAfterWakeMin", "firstMealAfterWakeMin", "eveningSupplementsBeforeBedMin", "morningLightAfterWakeMin"],
  "nutrition.exerciseKcal": ["defaultMet", "historyMinWorkouts", "historyLookbackDays"],
  "hydration.daily": ["totalWaterL", "beverageShare"],
  "hydration.exercise": ["maxBodyMassLossPct", "defaultLph", "minLph", "maxLph", "minSessionMin"],
  "hydration.sweatTest": ["minDurationMin", "maxGainLb", "litersPerKgLost"],
  "hydration.rehydrate": ["replacePctOfLoss"],
  "supplements.evidence": ["creatine", "caffeine", "vitaminD"],
};

const supporting = (r: AnyRule) => r.citations.filter((c) => (c.role ?? "supports") === "supports");

/** Every number reachable in a params object, plus the forms UI text derives from it. */
function paramNumbers(params: unknown): Set<number> {
  const out = new Set<number>();
  const add = (n: number) => out.add(Math.round(n * 1000) / 1000);
  const walk = (v: unknown) => {
    if (typeof v === "number") {
      add(v);
      if (v > 0 && v <= 1) {
        add(v * 100); // share/factor shown as a percent (0.8 → 80%)
        add((1 - v) * 100); // factor shown as a cut (0.6 → 40% cut)
      }
      if (v > 1) add(1 + v / 100); // pct shown as a ratio (20 → 1.2)
    } else if (v && typeof v === "object") for (const x of Object.values(v)) walk(x);
  };
  walk(params);
  return out;
}

/** Numbers in UI text, ignoring zone labels (Z1, zone 2) and the 0–10 pain scale ("/10"). */
function textNumbers(text: string): number[] {
  const cleaned = text.replace(/\b(?:z|zone\s*)[1-5]\b/gi, "").replace(/\/10\b/g, "");
  return (cleaned.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
}

// Numbers in UI text that are derived from params by rule, not stored directly.
const TEXT_NUMBER_ALLOWLIST: Record<string, number[]> = {
  // yellow is 34–66 and red ≤33: the band edges are green − 1 and yellow − 1.
  "recovery.color": [66, 33],
  // "Omega-3" is the nutrient's name, not a dose.
  "supplements.omega3": [3],
  // "K2" is the vitamin's form, not a number.
  "supplements.vitaminK2": [2],
  // "10,000-lux" is written with a thousands comma, which the number scan reads as 10 and 0.
  "recovery.morningLight": [0],
};

const isJohnson = (c: { authors: string; url: string }) =>
  /bryan johnson/i.test(c.authors) || /bryanjohnson\.com/i.test(c.url);

describe("rules catalog", () => {
  it("has every required id with the fixed param names", () => {
    for (const [id, names] of Object.entries(REQUIRED)) {
      const rule = (RULES as Record<string, AnyRule>)[id];
      expect(rule, id).toBeDefined();
      for (const n of names) expect(Object.keys(rule.params), `${id}.${n}`).toContain(n);
    }
  });

  it("keys match ids and no two rules share an id", () => {
    for (const [key, rule] of Object.entries(RULES)) expect(rule.id).toBe(key);
    const ids = all.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...RULE_IDS].sort()).toEqual([...ids].sort());
  });

  it("every rule has a statement, a short why and a valid evidence level", () => {
    for (const r of all) {
      expect(r.statement.trim().length, r.id).toBeGreaterThan(0);
      expect(r.why.trim().length, r.id).toBeGreaterThan(0);
      expect(r.why.length, `${r.id} why is ${r.why.length} chars`).toBeLessThanOrEqual(120);
      expect(EVIDENCE, r.id).toContain(r.evidence);
    }
  });

  it("every non-practice rule has at least one supporting https citation", () => {
    for (const r of all) {
      if (r.evidence !== "practice") expect(supporting(r).length, r.id).toBeGreaterThan(0);
      for (const c of r.citations) {
        expect(c.url, `${r.id}: ${c.title}`).toMatch(/^https:\/\//);
        expect(c.authors.length, r.id).toBeGreaterThan(0);
        expect(c.title.length, r.id).toBeGreaterThan(0);
        expect(c.venue.length, r.id).toBeGreaterThan(0);
        expect(Number.isInteger(c.year), r.id).toBe(true);
      }
    }
  });

  it("a rule's evidence is the level of its strongest supporting citation", () => {
    for (const r of all) {
      for (const c of r.citations) expect(c.evidence, `${r.id}: ${c.title}`).toBeDefined();
      const sup = supporting(r);
      if (sup.length === 0) {
        expect(r.evidence, `${r.id} has only context sources`).toBe("practice");
        continue;
      }
      const strongest = Math.max(...sup.map((c) => evidenceRank(c.evidence!)));
      expect(evidenceRank(r.evidence), r.id).toBe(strongest);
    }
  });

  it("every number in a rule's statement and why comes from its params", () => {
    for (const r of all) {
      const allowed = paramNumbers(r.params);
      for (const n of TEXT_NUMBER_ALLOWLIST[r.id] ?? []) allowed.add(n);
      for (const n of [...textNumbers(r.statement), ...textNumbers(r.why)]) {
        expect(allowed.has(n), `${r.id}: ${n} is not in params`).toBe(true);
      }
    }
  });

  it("the catalog is deeply frozen", () => {
    const check = (v: unknown, path: string) => {
      if (v && typeof v === "object") {
        expect(Object.isFrozen(v), path).toBe(true);
        for (const [k, x] of Object.entries(v)) check(x, `${path}.${k}`);
      }
    };
    check(RULES, "RULES");
    expect(() => {
      (RULES["volume.run"].params as { maxWeeklyIncreasePct: number }).maxWeeklyIncreasePct = 99;
    }).toThrow();
  });

  it("recovery green threshold is above yellow", () => {
    expect(RULES["recovery.color"].params.green).toBeGreaterThan(RULES["recovery.color"].params.yellow);
  });

  it("volume split shares sum to 1", () => {
    const { swim, bike, run } = RULES["volume.split"].params;
    expect(Math.abs(swim + bike + run - 1)).toBeLessThanOrEqual(0.001);
  });

  it("cites Andy Galpin at least once", () => {
    const galpin = all.flatMap((r) => r.citations).filter((c) => /galpin/i.test(c.authors));
    expect(galpin.length).toBeGreaterThan(0);
  });

  it("Bryan Johnson is never the only support for a rule", () => {
    for (const r of all) {
      const johnson = r.citations.filter(isJohnson);
      if (johnson.length === 0) continue;
      for (const c of johnson) {
        expect(c.evidence, r.id).toBe("n-of-1");
        expect(c.role, r.id).toBe("context");
      }
      expect(evidenceRank(r.evidence), r.id).toBeGreaterThan(evidenceRank("n-of-1"));
      expect(r.citations.some((c) => !isJohnson(c)), r.id).toBe(true);
    }
  });

  it("carb tiers ascend by maxMin and each range is low-to-high", () => {
    const tiers = RULES["nutrition.carbsByLoad"].params.tiers;
    expect(tiers.length).toBeGreaterThan(1);
    for (let i = 1; i < tiers.length; i++) expect(tiers[i].maxMin).toBeGreaterThan(tiers[i - 1].maxMin);
    for (const t of tiers) expect(t.gPerKg[0]).toBeLessThan(t.gPerKg[1]);
  });

  it("energy-availability floor is below the target, and the FFM fallback is a fraction", () => {
    const ea = RULES["nutrition.energyAvailability"].params;
    expect(ea.floorKcalPerKgFfm).toBeLessThan(ea.targetKcalPerKgFfm);
    expect(ea.ffmFallbackFraction).toBeGreaterThan(0);
    expect(ea.ffmFallbackFraction).toBeLessThan(1);
  });

  it("protein default sits inside its range", () => {
    const p = RULES["nutrition.protein"].params;
    expect(p.minGPerKg).toBeLessThanOrEqual(p.gPerKg);
    expect(p.gPerKg).toBeLessThanOrEqual(p.maxGPerKg);
  });

  it("hydration rates are ordered and the gain-phase rate is above the minimum", () => {
    const h = RULES["hydration.exercise"].params;
    expect(h.minLph).toBeLessThanOrEqual(h.defaultLph);
    expect(h.defaultLph).toBeLessThanOrEqual(h.maxLph);
    const g = RULES["nutrition.gainRate"].params;
    expect(g.minPct).toBeLessThan(g.pctBodyweightPerWeek);
  });

  it("every micro profile lists every micro nutrient with a positive value, its canonical unit and a kind", () => {
    const profiles = RULES["nutrition.micros"].params.profiles;
    expect(Object.keys(profiles).sort()).toEqual(["female_19_30", "female_31_50", "male_19_30", "male_31_50"]);
    const unitOf = new Map(NUTRIENTS.map((n) => [n.key, n.unit]));
    const required = [...MICRO_KEYS, "fiber_g"];
    for (const [name, profile] of Object.entries(profiles)) {
      expect(Object.keys(profile).sort(), name).toEqual([...required].sort());
      for (const [key, target] of Object.entries(profile)) {
        expect(target.value, `${name}.${key}`).toBeGreaterThan(0);
        expect(target.unit, `${name}.${key}`).toBe(unitOf.get(key as never));
        expect(["rda", "ai", "upper"], `${name}.${key}`).toContain(target.kind);
      }
      expect(profile.sodium_mg.kind, name).toBe("upper");
    }
  });

  it("every exercise kind has a default MET", () => {
    const met = RULES["nutrition.exerciseKcal"].params.defaultMet;
    for (const k of ["swim", "bike", "run", "strength", "lower_leg", "core", "mobility"] as const) {
      expect(met[k], k).toBeGreaterThan(0);
    }
  });

  it("getRule returns the typed rule", () => {
    expect(getRule("volume.run").params.maxWeeklyIncreasePct).toBe(RULES["volume.run"].params.maxWeeklyIncreasePct);
    expect(() => getRule("nope" as never)).toThrow();
  });
});
