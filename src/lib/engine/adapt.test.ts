import { describe, it, expect } from "vitest";
import { RULES } from "@/lib/engine/rules/catalog";
import { adapt, applyPainHold } from "@/lib/engine/adapt";
import { readiness, type DayInputs } from "@/lib/engine/readiness";
import { buildWeek, type PlannedSessionDraft } from "@/lib/engine/week";
import type { PlanSettings } from "@/lib/plan/settings";

// Invented values only.
const RED = RULES["recovery.redSwap"].params;
const YELLOW = RULES["recovery.yellowScale"].params;
const LOW = RULES["recovery.lowStreak"].params;
const COLOR = RULES["recovery.color"].params;
const DOCTOR = "If this keeps up, consider talking to your doctor.";
const LOG_DAILY = "Log your pain daily to clear this hold.";
const PAIN = RULES["pain.monitoring"].params;
/** Clean-day progress for a hold triggered today with no clean days logged since. */
const PROGRESS = `0 of ${PAIN.holdUntilBelowDays} clean days logged`;
const HARD = new Set(["tempo", "threshold", "intervals"]);
const ENDURANCE = new Set(["swim", "bike", "run"]);
const DATE = "2026-11-18";

const BASE: DayInputs = {
  date: DATE,
  recoveryScore: 75,
  recoveryState: "SCORED",
  hrvLn7: 4.1,
  hrvBaseline: { mean: 4.1, sd: 0.2, days: 40 },
  rhr7: 52,
  rhrBaseline: 52,
  sleepDebtMin3d: 0,
  recentScores: [70, 72, 68, 75, 80, 71, 75],
  pain: [],
  jointStatus: "caution",
};
const day = (o: Partial<DayInputs>): DayInputs => ({ ...BASE, ...o });
const KNEE = [{ area: "knee", date: DATE, max: 5, context: "after_run" }];

function s(o: Partial<PlannedSessionDraft>): PlannedSessionDraft {
  return {
    localDate: DATE,
    slot: 0,
    kind: "run",
    title: "Easy run 45 min",
    durationMin: 45,
    intensity: "z2",
    details: {},
    ruleIds: [],
    ...o,
  };
}
const tempoRun = () =>
  s({
    title: "Tempo run 50 min",
    durationMin: 50,
    intensity: "tempo",
    details: {
      hardMin: 20,
      structure: { warmUpMin: 15, hardMin: 20, coolDownMin: 15 },
      note: "15 min warm-up · 20 min tempo · 15 min cool-down",
    },
  });
const hardMin = (x: PlannedSessionDraft) => Number(x.details.hardMin ?? 0);

describe("adapt: unknown data", () => {
  it("null recovery leaves the plan unchanged with the 'Not enough data' reason", () => {
    const plan = [
      tempoRun(),
      s({
        slot: 1,
        kind: "strength",
        title: "Upper A",
        durationMin: 60,
        intensity: "strength",
      }),
    ];
    const out = adapt(plan, readiness(day({ recoveryScore: null }))).sessions;
    out.forEach((o, i) => {
      const { adjusted, reasons, ...rest } = o;
      expect(rest).toEqual(plan[i]);
      expect(adjusted).toBe(false);
      expect(reasons).toEqual([
        {
          ruleId: "recovery.color",
          text: "Not enough data yet — following the plan",
        },
      ]);
    });
  });

  it("does not mutate its input", () => {
    const plan = [tempoRun()];
    const copy = structuredClone(plan);
    adapt(
      plan,
      readiness(day({ recoveryScore: 20, sleepDebtMin3d: 200, pain: KNEE })),
    );
    adapt(plan, readiness(day({ recoveryScore: 50 })));
    expect(plan).toEqual(copy);
  });
});

describe("adapt: green", () => {
  it("a calm green day changes nothing and adds no reasons", () => {
    const plan = [tempoRun()];
    const [o] = adapt(plan, readiness(BASE)).sessions;
    expect(o.adjusted).toBe(false);
    expect(o.reasons).toEqual([]);
    expect(o.durationMin).toBe(50);
  });
});

describe("adapt: pain hold", () => {
  it("swaps a run for a z2 bike of the same duration, with a doctor note", () => {
    const [o] = adapt([tempoRun()], readiness(day({ pain: KNEE }))).sessions;
    expect(o.kind).toBe("bike");
    expect(o.intensity).toBe("z2");
    expect(o.durationMin).toBe(50);
    expect(o.details.hardMin).toBeUndefined();
    expect(o.details.structure).toBeUndefined();
    expect(o.adjusted).toBe(true);
    expect(o.reasons[0].ruleId).toBe("pain.monitoring");
    expect(o.reasons[0].text).toContain("swapped the run");
    expect(o.reasons[0].text).toContain(LOG_DAILY);
    expect(o.reasons[0].text).toContain(PROGRESS);
    expect(o.reasons[0].text.endsWith(DOCTOR)).toBe(true);
  });

  it("red plus a knee pain hold, on a day with a run: mobility, not a hard bike (Review Focus 4)", () => {
    const plan = [
      s({
        durationMin: 60,
        title: "Run intervals 60 min",
        intensity: "intervals",
        details: { hardMin: 20 },
      }),
    ];
    const [o] = adapt(
      plan,
      readiness(day({ recoveryScore: 20, pain: KNEE })),
    ).sessions;
    expect(o.kind).toBe("mobility");
    expect(o.kind).not.toBe("bike");
    expect(HARD.has(o.intensity)).toBe(false);
    expect(o.durationMin).toBeLessThanOrEqual(RED.maxMin);
    expect(hardMin(o)).toBe(0);
    expect(o.reasons.map((x) => x.ruleId)).toContain("pain.monitoring");
    for (const r of o.reasons.filter((x) => x.ruleId.startsWith("pain.")))
      expect(r.text.endsWith(DOCTOR)).toBe(true);
    expect(o.reasons.find((x) => x.ruleId === "pain.monitoring")!.text).toContain(LOG_DAILY);
  });

  it("joint status restricted: a stray run is treated as a hold", () => {
    const [o] = adapt(
      [s({})],
      readiness(day({ jointStatus: "restricted" })),
    ).sessions;
    expect(o.kind).toBe("bike");
    expect(o.reasons[0].ruleId).toBe("pain.jointStatus");
    // Logging pain does not lift a restricted joint status; the reason says where it is set.
    expect(o.reasons[0].text).toContain("Plan settings");
    expect(o.reasons[0].text.endsWith(DOCTOR)).toBe(true);
  });

  it("leaves non-run sessions alone, but still shows the hold on the first non-rest session", () => {
    const plan = [
      s({ kind: "rest", title: "Rest", durationMin: 0, intensity: "easy" }),
      s({ slot: 1, kind: "swim", title: "Easy swim 40 min", durationMin: 40 }),
    ];
    const [rest, o] = adapt(plan, readiness(day({ pain: KNEE }))).sessions;
    expect(o.kind).toBe("swim");
    expect(o.durationMin).toBe(40);
    expect(o.adjusted).toBe(false);
    expect(o.reasons.map((x) => x.ruleId)).toEqual(["pain.monitoring"]);
    expect(o.reasons[0].text.endsWith(DOCTOR)).toBe(true);
    expect(rest.reasons).toEqual([]);
  });

  it("removes plyometrics from strength during a hold, with a doctor note", () => {
    const plan = [s({ kind: "strength", title: "Lower", durationMin: 60, intensity: "strength", details: { template: "lower", plyo: true } })];
    const [o] = adapt(plan, readiness(day({ pain: KNEE }))).sessions;
    expect(o.kind).toBe("strength");
    expect(o.details.plyo).toBeUndefined();
    expect(o.adjusted).toBe(true);
    expect(o.reasons[0].ruleId).toBe("pain.monitoring");
    expect(o.reasons[0].text).toContain("plyometrics removed");
    expect(o.reasons[0].text).toContain(LOG_DAILY);
    expect(o.reasons[0].text).toContain(PROGRESS);
    expect(o.reasons[0].text.endsWith(DOCTOR)).toBe(true);
  });

  it("pain hold and joint restricted list both ruleIds", () => {
    const [o] = adapt([s({})], readiness(day({ pain: KNEE, jointStatus: "restricted" }))).sessions;
    expect(o.kind).toBe("bike");
    expect(o.reasons.map((x) => x.ruleId)).toEqual(["pain.monitoring", "pain.jointStatus"]);
    for (const x of o.reasons) expect(x.text.endsWith(DOCTOR)).toBe(true);
  });

  it("a z1 run swapped for the bike stays z1 (never raises intensity)", () => {
    const [o] = adapt([s({ intensity: "z1" })], readiness(day({ pain: KNEE }))).sessions;
    expect(o).toMatchObject({ kind: "bike", intensity: "z1", durationMin: 45 });
  });
});

describe("applyPainHold (step 1 only, for future days on the Plan tab)", () => {
  const lower = () =>
    s({ slot: 1, kind: "strength", title: "Lower", durationMin: 60, intensity: "strength", details: { template: "lower", plyo: true } });
  const swim = () => s({ slot: 2, kind: "swim", title: "Easy swim 40 min", durationMin: 40 });

  it("swaps runs and removes plyometrics under a pain hold, saying how it clears", () => {
    const [run, lift, sw] = applyPainHold([tempoRun(), lower(), swim()], readiness(day({ pain: KNEE }))).sessions;
    expect(run).toMatchObject({ kind: "bike", intensity: "z2", durationMin: 50, adjusted: true });
    expect(run.details.swappedFrom).toBe("run");
    expect(lift.details.plyo).toBeUndefined();
    for (const o of [run, lift]) {
      expect(o.reasons.map((x) => x.ruleId)).toEqual(["pain.monitoring"]);
      expect(o.reasons[0].text).toContain(LOG_DAILY);
      expect(o.reasons[0].text.endsWith(DOCTOR)).toBe(true);
    }
    // Untouched sessions carry no reasons: the week banner shows the hold once.
    expect(sw).toMatchObject({ kind: "swim", durationMin: 40, adjusted: false, reasons: [] });
  });

  it("ignores today's recovery color: a future run becomes a ride, not mobility", () => {
    const r = readiness(day({ recoveryScore: 20, pain: KNEE }));
    expect(r.color).toBe("red");
    const [o] = applyPainHold([tempoRun()], r).sessions;
    expect(o.kind).toBe("bike");
    expect(o.durationMin).toBe(50);
  });

  it("applies a restricted joint status the same way", () => {
    const [o] = applyPainHold([s({})], readiness(day({ jointStatus: "restricted" }))).sessions;
    expect(o.kind).toBe("bike");
    expect(o.reasons.map((x) => x.ruleId)).toEqual(["pain.jointStatus"]);
  });

  it("changes nothing without a hold, and never applies the other steps", () => {
    const plan = [tempoRun(), lower(), swim()];
    // Yellow, a low streak and sleep debt would all change a tempo run in adapt().
    const r = readiness(day({ recoveryScore: 50, sleepDebtMin3d: 400 }));
    const out = applyPainHold(plan, r).sessions;
    expect(out.map((o) => ({ ...o, adjusted: undefined, reasons: undefined }))).toEqual(
      plan.map((p) => ({ ...p, adjusted: undefined, reasons: undefined })),
    );
    expect(out.every((o) => !o.adjusted && o.reasons.length === 0)).toBe(true);
  });
});

describe("adapt: red", () => {
  it("swaps endurance to z1 capped at maxMin, strength to mobility, keeps lower-leg and core as optional", () => {
    const plan = [
      tempoRun(),
      s({
        slot: 1,
        kind: "bike",
        title: "Long ride 3h",
        durationMin: 180,
        details: { long: true },
      }),
      s({
        slot: 2,
        kind: "strength",
        title: "Lower",
        durationMin: 60,
        intensity: "strength",
        details: { template: "lower" },
      }),
      s({
        slot: 3,
        kind: "lower_leg",
        title: "Lower-leg block",
        durationMin: 15,
        intensity: "easy",
      }),
      s({
        slot: 4,
        kind: "core",
        title: "Core",
        durationMin: 15,
        intensity: "easy",
      }),
    ];
    const out = adapt(
      plan,
      readiness(day({ recoveryScore: 28, recentScores: [70, 70, 28] })),
    ).sessions;
    const [run, ride, str, ll, core] = out;
    expect(run).toMatchObject({
      kind: "run",
      intensity: "z1",
      durationMin: Math.min(50, RED.maxMin),
      adjusted: true,
    });
    expect(run.details.hardMin).toBeUndefined();
    expect(run.reasons[0]).toEqual({
      ruleId: "recovery.redSwap",
      text: `Recovery 28% (red) — swapped to easy ${Math.min(50, RED.maxMin)} min`,
    });
    expect(ride).toMatchObject({
      kind: "bike",
      intensity: "z1",
      durationMin: RED.maxMin,
    });
    expect(str).toMatchObject({
      kind: "mobility",
      title: "Mobility + optional light technique",
      durationMin: RED.maxMin,
    });
    expect(str.durationMin).toBeLessThanOrEqual(60);
    expect(ll).toMatchObject({
      kind: "lower_leg",
      durationMin: 15,
      adjusted: true,
    });
    expect(ll.details.optional).toBe(true);
    expect(core.details.optional).toBe(true);
  });

  it("a walk-run on a red day keeps a valid interval layout inside the new duration", () => {
    const plan = [
      s({
        title: "Walk-run 6×(5 run/2 walk)",
        durationMin: 45,
        details: {
          intervals: { runMin: 5, walkMin: 2, reps: 6 },
          extraWalkMin: 3,
        },
      }),
    ];
    const [o] = adapt(plan, readiness(day({ recoveryScore: 20 }))).sessions;
    const iv = o.details.intervals as {
      runMin: number;
      walkMin: number;
      reps: number;
    };
    expect(o.durationMin).toBe(RED.maxMin);
    expect(
      iv.reps * (iv.runMin + iv.walkMin) + Number(o.details.extraWalkMin ?? 0),
    ).toBe(o.durationMin);
    expect(iv.runMin).toBeLessThanOrEqual(5);
  });
});

describe("adapt: low streak", () => {
  it("applies volumeFactor to endurance sessions", () => {
    const plan = [
      s({ kind: "swim", title: "Easy swim 40 min", durationMin: 40 }),
      s({
        slot: 1,
        kind: "strength",
        title: "Upper A",
        durationMin: 60,
        intensity: "strength",
      }),
    ];
    // Today itself is yellow so the red swap stays out of the way.
    const r = readiness(day({ recoveryScore: 50, recentScores: [20, 25, 30] }));
    expect(r.lowStreak).toBe(true);
    const [swim, str] = adapt(plan, r).sessions;
    expect(swim.durationMin).toBe(
      Math.round(Math.round(40 * LOW.volumeFactor) * YELLOW.durationFactor),
    );
    expect(swim.reasons.map((x) => x.ruleId)).toEqual([
      "recovery.lowStreak",
      "recovery.yellowScale",
    ]);
    expect(str.durationMin).toBe(60);
  });
});

describe("adapt: yellow", () => {
  it("a yellow tempo run becomes a shorter z2 run", () => {
    const [o] = adapt(
      [tempoRun()],
      readiness(day({ recoveryScore: 50 })),
    ).sessions;
    expect(o.kind).toBe("run");
    expect(o.intensity).toBe("z2");
    expect(o.durationMin).toBe(Math.round(50 * YELLOW.durationFactor));
    expect(o.durationMin).toBeLessThan(50);
    expect(o.details.hardMin).toBeUndefined();
    expect(o.details.structure).toBeUndefined();
    expect(o.title).not.toMatch(/tempo/i);
    expect(o.reasons[0].ruleId).toBe("recovery.yellowScale");
  });
});

describe("adapt: sleep debt", () => {
  it("marks hard sessions to move later and adds a bedtime note", () => {
    const plan = [
      tempoRun(),
      s({ slot: 1, kind: "swim", title: "Easy swim 40 min", durationMin: 40 }),
    ];
    const [run, swim] = adapt(
      plan,
      readiness(day({ sleepDebtMin3d: 120 })),
    ).sessions;
    expect(run.details.moveLater).toBe(true);
    expect(run.durationMin).toBe(50);
    expect(run.reasons[0].ruleId).toBe("recovery.sleepDebt");
    expect(run.reasons[0].text).toMatch(/bedtime/i);
    expect(swim.details.moveLater).toBeUndefined();
  });

  it("with no hard session still leaves a bedtime note on the first session", () => {
    const [o] = adapt(
      [s({})],
      readiness(day({ sleepDebtMin3d: 120 })),
    ).sessions;
    expect(o.reasons[0].ruleId).toBe("recovery.sleepDebt");
    expect(o.reasons[0].text).toMatch(/bedtime/i);
    expect(o.durationMin).toBe(45);
  });
});

describe("adapt: fired matches the reasons", () => {
  it("every rule readiness fires appears as a reason, and vice versa", () => {
    const plan = [
      tempoRun(),
      s({ slot: 1, kind: "swim", title: "Easy swim 40 min", durationMin: 40 }),
      s({
        slot: 2,
        kind: "strength",
        title: "Upper A",
        durationMin: 60,
        intensity: "strength",
      }),
    ];
    const r = readiness(
      day({
        recoveryScore: 20,
        recentScores: [20, 20, 20],
        sleepDebtMin3d: 150,
        pain: KNEE,
      }),
    );
    const out = adapt(plan, r).sessions;
    const reasonIds = new Set(
      out.flatMap((o) => o.reasons.map((x) => x.ruleId)),
    );
    const actionIds = new Set(
      r.fired.map((f) => f.ruleId).filter((id) => id !== "recovery.color"),
    );
    expect(reasonIds).toEqual(actionIds);
  });
});

describe("adapt: multi-day trend (Ruling 12)", () => {
  const LOW_HRV: Partial<DayInputs> = { hrvLn7: 4.1 - 0.6 * 0.2 };
  const HIGH_RHR: Partial<DayInputs> = {
    rhr7: 52 + RULES["recovery.rhrTrend"].params.elevatedBpm,
  };

  it("green + low HRV trend → yellow-scaled with an hrvTrend reason", () => {
    const r = readiness(day(LOW_HRV));
    expect(r.color).toBe("green");
    expect(r.fired.map((f) => f.ruleId)).toContain("recovery.hrvTrend");
    expect(
      r.fired.find((f) => f.ruleId === "recovery.hrvTrend")!.inputs,
    ).toMatchObject({ hrvLn7: LOW_HRV.hrvLn7, mean: 4.1, sd: 0.2 });
    const [o] = adapt([tempoRun()], r).sessions;
    expect(o).toMatchObject({
      kind: "run",
      intensity: "z2",
      durationMin: Math.round(50 * YELLOW.durationFactor),
      adjusted: true,
    });
    expect(o.details.hardMin).toBeUndefined();
    expect(o.reasons.map((x) => x.ruleId)).toEqual(["recovery.hrvTrend"]);
    expect(o.reasons[0].text).toMatch(
      /HRV 7-day avg below your baseline — easier day/,
    );
  });

  it("unknown color + RHR elevated → yellow-scaled", () => {
    const r = readiness(day({ ...HIGH_RHR, recoveryScore: null }));
    expect(r.fired.map((f) => f.ruleId)).toContain("recovery.rhrTrend");
    const [o, str] = adapt(
      [
        tempoRun(),
        s({
          slot: 1,
          kind: "strength",
          title: "Upper A",
          durationMin: 60,
          intensity: "strength",
        }),
      ],
      r,
    ).sessions;
    expect(o).toMatchObject({
      intensity: "z2",
      durationMin: Math.round(50 * YELLOW.durationFactor),
    });
    expect(o.reasons.map((x) => x.ruleId)).toEqual(["recovery.rhrTrend"]);
    expect(str.reasons).toEqual([
      {
        ruleId: "recovery.color",
        text: "Not enough data yet — following the plan",
      },
    ]);
  });

  it("yellow + low trend (both trends) → scaled once, reasons list every cause", () => {
    const [o] = adapt(
      [tempoRun()],
      readiness(day({ ...LOW_HRV, ...HIGH_RHR, recoveryScore: 50 })),
    ).sessions;
    expect(o.durationMin).toBe(Math.round(50 * YELLOW.durationFactor));
    expect(o.reasons.map((x) => x.ruleId)).toEqual([
      "recovery.yellowScale",
      "recovery.hrvTrend",
      "recovery.rhrTrend",
    ]);
  });

  it("red + low trend → red behaviour", () => {
    const plan = [tempoRun()];
    const red = adapt(plan, readiness(day({ recoveryScore: 20 }))).sessions[0];
    const both = adapt(plan, readiness(day({ ...LOW_HRV, recoveryScore: 20 })))
      .sessions[0];
    const strip = (x: typeof red) => ({ ...x, reasons: [] });
    const { reasons } = both;
    expect(strip(both)).toEqual(strip(red));
    expect(both.durationMin).toBe(Math.min(50, RED.maxMin));
    expect(reasons[0].ruleId).toBe("recovery.redSwap");
    expect(reasons.map((x) => x.ruleId)).toContain("recovery.hrvTrend");
  });

  it("a normal or high trend changes nothing", () => {
    for (const hrvLn7 of [4.1, 4.1 + 0.6 * 0.2]) {
      const r = readiness(day({ hrvLn7 }));
      expect(r.fired).toEqual([]);
      const [o] = adapt([tempoRun()], r).sessions;
      expect(o.adjusted).toBe(false);
      expect(o.reasons).toEqual([]);
      expect(o.durationMin).toBe(50);
    }
  });
});

// ---- Monotonic over a matrix of readiness states (Review Focus 3) ---------------------------

const SETTINGS: PlanSettings = {
  raceDate: "2027-09-12",
  seasonStart: "2026-11-02",
  windows: [{ start: "06:00", end: "08:00" }],
  longRideDow: 5,
  longRunDow: 6,
  restDow: 0,
  secondRestDow: null,
  jointStatus: "unrestricted",
  poolLengthM: 25,
  wakeTime: null,
  painSide: null,
  poolUnit: "yd", startSwimSecPer100Yd: null, startRunSecPerMi: null, startBikeMph: null, goalSec: null, painMonitoring: true,
};
const WEEKS: PlannedSessionDraft[][] = [
  buildWeek({
    weekStart: "2026-11-16",
    weekIndex: 2,
    phase: "base",
    recovery: false,
    targets: { enduranceMin: 330, runMin: 50, swimMin: 93, bikeMin: 187 },
    settings: SETTINGS,
    longestRunMinLastLookback: null,
  }),
  buildWeek({
    weekStart: "2026-11-16",
    weekIndex: 30,
    phase: "build",
    recovery: false,
    targets: { enduranceMin: 600, runMin: 180, swimMin: 150, bikeMin: 270 },
    settings: SETTINGS,
    longestRunMinLastLookback: null,
  }),
  buildWeek({
    weekStart: "2026-11-16",
    weekIndex: 40,
    phase: "peak",
    recovery: false,
    targets: { enduranceMin: 660, runMin: 198, swimMin: 165, bikeMin: 297 },
    settings: SETTINGS,
    longestRunMinLastLookback: null,
  }),
];
const DAYS = WEEKS.flatMap((w) =>
  [...new Set(w.map((x) => x.localDate))].map((d) =>
    w.filter((x) => x.localDate === d),
  ),
);

const SCORES: (number | null)[] = [95, COLOR.green, 50, 20, null];
const STATES: { name: string; inputs: Partial<DayInputs> }[] = [];
for (const score of SCORES)
  for (const streak of ["none", "low", "green"] as const)
    for (const sleep of [false, true])
      for (const pain of [false, true])
        for (const joint of ["unrestricted", "restricted"] as const)
          for (const trend of ["none", "hrv", "rhr"] as const)
            STATES.push({
              name: `score=${score} streak=${streak} sleep=${sleep} pain=${pain} joint=${joint} trend=${trend}`,
              inputs: {
                hrvLn7: trend === "hrv" ? 3.9 : 4.1,
                rhr7: trend === "rhr" ? 60 : 52,
                recoveryScore: score,
                recentScores:
                  streak === "low"
                    ? [20, 20, 20, score]
                    : streak === "green"
                      ? [90, 90, 90, score]
                      : [50, 70, 40, score],
                sleepDebtMin3d: sleep ? 200 : 0,
                pain: pain ? KNEE : [],
                jointStatus: joint,
              },
            });

/** Intensity order for "never raises": rest < mobility < easy/z1 < z2 < tempo < threshold < intervals. Strength ranks top. */
const INTENSITY_RANK: Record<string, number> = { easy: 2, z1: 2, z2: 3, tempo: 4, threshold: 5, intervals: 6, strength: 7 };
const rank = (x: PlannedSessionDraft) => (x.kind === "rest" ? 0 : x.kind === "mobility" ? 1 : INTENSITY_RANK[x.intensity]);
const RED_TARGETS: ReadonlySet<string> = new Set(["swim", "bike", "run", "strength", "lower_leg", "core"]);

describe("adapt: monotonic", () => {
  it("never increases any session's duration or hard minutes, and keeps safety invariants", () => {
    let checked = 0;
    for (const st of STATES) {
      const r = readiness(day(st.inputs));
      for (const plan of DAYS) {
        const out = adapt(plan, r).sessions;
        expect(out.length).toBe(plan.length);
        out.forEach((o, i) => {
          const p = plan[i];
          const ctx = `${st.name} ${p.localDate} ${p.title}`;
          expect(o.localDate, ctx).toBe(p.localDate);
          expect(o.slot, ctx).toBe(p.slot);
          expect(o.durationMin, ctx).toBeLessThanOrEqual(p.durationMin);
          expect(hardMin(o), ctx).toBeLessThanOrEqual(hardMin(p));
          if (r.color === "red") {
            expect(HARD.has(o.intensity), ctx).toBe(false);
            if (ENDURANCE.has(o.kind) || o.kind === "mobility")
              expect(o.durationMin, ctx).toBeLessThanOrEqual(RED.maxMin);
          }
          const easier =
            r.color === "yellow" ||
            r.hrvTrend === "low" ||
            r.rhrElevated === true;
          if (easier && YELLOW.dropHighIntensity)
            expect(HARD.has(o.intensity), ctx).toBe(false);
          if (r.painHold || r.jointRestricted) {
            expect(o.kind, ctx).not.toBe("run");
            expect(o.details.plyo, ctx).toBeUndefined();
          }
          expect(rank(o), ctx).toBeLessThanOrEqual(rank(p));
          if (r.painHold && r.color === "red" && p.kind === "run")
            expect(o.kind, ctx).toBe("mobility");
          for (const x of o.reasons.filter((y) => y.ruleId.startsWith("pain.")))
            expect(x.text.endsWith(DOCTOR), ctx).toBe(true);
          checked++;
        });
        // Every rule that fired and acted on (or flagged) this day shows up as a reason, and
        // every reason comes from a fired rule.
        const reasonIds = new Set(out.flatMap((o) => o.reasons.map((x) => x.ruleId)));
        // The later rules see the day after the pain step: under a pain hold or restricted joints a
        // run is already mobility on a red day (its reason names the red) or an easy ride otherwise.
        const held = r.painHold || r.jointRestricted;
        const kinds = plan.map((p) => (p.kind === "run" && held ? (r.color === "red" ? "mobility" : "bike") : p.kind));
        const has = (want: ReadonlySet<string>) => kinds.some((k) => want.has(k));
        const expected = new Set<string>();
        for (const f of r.fired) {
          const id = f.ruleId;
          if (id === "recovery.color") continue;
          if (id.startsWith("pain.") || id === "recovery.sleepDebt") expected.add(id);
          else if (id === "recovery.redSwap") {
            if (has(RED_TARGETS)) expected.add(id);
          } else if (has(ENDURANCE)) expected.add(id);
        }
        for (const id of expected) expect(reasonIds.has(id), `${st.name} ${plan[0].localDate} missing ${id}`).toBe(true);
        const firedIds = new Set<string>(r.fired.map((f) => f.ruleId));
        for (const id of reasonIds) expect(firedIds.has(id), `${st.name} ${plan[0].localDate} stray ${id}`).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it("a green streak never raises durations above the draft", () => {
    const r = readiness(
      day({ recoveryScore: 95, recentScores: [90, 92, 95, 95] }),
    );
    expect(r.greenStreak).toBe(true);
    for (const plan of DAYS) {
      const out = adapt(plan, r).sessions;
      out.forEach((o, i) => {
        expect(o.durationMin).toBe(plan[i].durationMin);
        expect(hardMin(o)).toBe(hardMin(plan[i]));
        expect(o.adjusted).toBe(false);
      });
    }
  });
});
