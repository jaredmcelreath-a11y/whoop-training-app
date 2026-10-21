import { describe, it, expect } from "vitest";
import { RULES } from "@/lib/engine/rules/catalog";
import { readiness, type DayInputs } from "@/lib/engine/readiness";

// Invented values only.
const COLOR = RULES["recovery.color"].params;
const HRV = RULES["recovery.hrvTrend"].params;
const RHR = RULES["recovery.rhrTrend"].params;
const LOW = RULES["recovery.lowStreak"].params;
const GREEN = RULES["recovery.greenStreak"].params;
const SLEEP = RULES["recovery.sleepDebt"].params;
const PAIN = RULES["pain.monitoring"].params;
const DOCTOR = "If this keeps up, consider talking to your doctor.";

const BASE: DayInputs = {
  date: "2026-11-10",
  recoveryScore: 70,
  recoveryState: "SCORED",
  hrvLn7: 4.1,
  hrvBaseline: { mean: 4.1, sd: 0.2, days: 40 },
  rhr7: 52,
  rhrBaseline: 52,
  sleepDebtMin3d: 10,
  recentScores: [60, 55, 70, 50, 62, 58, 70],
  pain: [],
  jointStatus: "caution",
};
const day = (o: Partial<DayInputs>): DayInputs => ({ ...BASE, ...o });

describe("readiness: recovery color", () => {
  it("70 is green, 50 yellow, 20 red", () => {
    expect(readiness(day({ recoveryScore: 70 })).color).toBe("green");
    expect(readiness(day({ recoveryScore: 50 })).color).toBe("yellow");
    expect(readiness(day({ recoveryScore: 20 })).color).toBe("red");
  });

  it("uses the catalog thresholds at the edges", () => {
    expect(readiness(day({ recoveryScore: COLOR.green })).color).toBe("green");
    expect(readiness(day({ recoveryScore: COLOR.green - 1 })).color).toBe("yellow");
    expect(readiness(day({ recoveryScore: COLOR.yellow })).color).toBe("yellow");
    expect(readiness(day({ recoveryScore: COLOR.yellow - 1 })).color).toBe("red");
  });

  it("null score or an unscored state is unknown", () => {
    expect(readiness(day({ recoveryScore: null })).color).toBe("unknown");
    expect(readiness(day({ recoveryState: "PENDING_SCORE" })).color).toBe("unknown");
    expect(readiness(day({ recoveryState: null })).color).toBe("unknown");
  });
});

describe("readiness: HRV and RHR trends", () => {
  it("20 baseline days gives unknown", () => {
    expect(readiness(day({ hrvBaseline: { mean: 4.1, sd: 0.2, days: 20 } })).hrvTrend).toBe("unknown");
  });

  it("40 days with the 7-day ln rMSSD 0.6 SD below the mean is low", () => {
    const mean = 4.1;
    const sd = 0.2;
    expect(readiness(day({ hrvBaseline: { mean, sd, days: 40 }, hrvLn7: mean - 0.6 * sd })).hrvTrend).toBe("low");
  });

  it("inside the SWC band is normal, above it is high", () => {
    const { mean, sd } = BASE.hrvBaseline!;
    expect(readiness(day({ hrvLn7: mean - 0.4 * sd })).hrvTrend).toBe("normal");
    expect(readiness(day({ hrvLn7: mean + (HRV.swcSd + 0.1) * sd })).hrvTrend).toBe("high");
  });

  it("missing baseline or missing 7-day mean is unknown", () => {
    expect(readiness(day({ hrvBaseline: null })).hrvTrend).toBe("unknown");
    expect(readiness(day({ hrvLn7: null })).hrvTrend).toBe("unknown");
    expect(readiness(day({ hrvBaseline: { mean: 4.1, sd: 0.2, days: HRV.baselineMinDays } })).hrvTrend).toBe("normal");
  });

  it("RHR elevated by elevatedBpm; null when data is missing", () => {
    expect(readiness(day({ rhr7: 52 + RHR.elevatedBpm, rhrBaseline: 52 })).rhrElevated).toBe(true);
    expect(readiness(day({ rhr7: 52 + RHR.elevatedBpm - 1, rhrBaseline: 52 })).rhrElevated).toBe(false);
    expect(readiness(day({ rhr7: null })).rhrElevated).toBeNull();
    expect(readiness(day({ rhrBaseline: null })).rhrElevated).toBeNull();
  });
});

describe("readiness: streaks and sleep", () => {
  it("three scores ≤ 33 in a row give lowStreak", () => {
    expect(LOW.days).toBe(3);
    const r = readiness(day({ recoveryScore: 20, recentScores: [70, 60, 50, 30, 33, 20] }));
    expect(r.lowStreak).toBe(true);
  });

  it("a null or non-red score breaks the low streak", () => {
    expect(readiness(day({ recentScores: [30, null, 20, 20] })).lowStreak).toBe(false);
    expect(readiness(day({ recentScores: [30, 20, 40, 20] })).lowStreak).toBe(false);
    expect(readiness(day({ recentScores: [20, 20] })).lowStreak).toBe(false);
    expect(readiness(day({ recentScores: [30, 20, null] })).lowStreak).toBe(false);
  });

  it("green streak needs the last `days` scores all green", () => {
    expect(readiness(day({ recentScores: Array(GREEN.days).fill(COLOR.green) })).greenStreak).toBe(true);
    expect(readiness(day({ recentScores: [80, 80, COLOR.green - 1] })).greenStreak).toBe(false);
  });

  it("sleep debt at debtMin", () => {
    expect(readiness(day({ sleepDebtMin3d: SLEEP.debtMin })).sleepDebt).toBe(true);
    expect(readiness(day({ sleepDebtMin3d: SLEEP.debtMin - 1 })).sleepDebt).toBe(false);
    expect(readiness(day({ sleepDebtMin3d: null })).sleepDebt).toBe(false);
  });
});

describe("readiness: pain hold", () => {
  it("pain 5 after a run, then 2, 2, 2: the hold clears only after holdUntilBelowDays", () => {
    expect(PAIN.holdUntilBelowDays).toBe(3);
    const pain = [
      { area: "knee", date: "2026-11-10", max: 5, context: "after_run" },
      { area: "knee", date: "2026-11-11", max: 2, context: "after_run" },
      { area: "knee", date: "2026-11-12", max: 2, context: "after_run" },
      { area: "knee", date: "2026-11-13", max: 2, context: "after_run" },
    ];
    for (const date of ["2026-11-10", "2026-11-11", "2026-11-12"]) {
      const r = readiness(day({ date, pain }));
      expect(r.painHold, date).not.toBeNull();
      expect(r.painHold!.area).toBe("knee");
      expect(r.painHold!.reason.endsWith(DOCTOR)).toBe(true);
    }
    expect(readiness(day({ date: "2026-11-13", pain })).painHold).toBeNull();
  });

  it("pain 6 followed by 3 days of no logs → still held, asking for daily logs", () => {
    const pain = [{ area: "knee", date: "2026-11-07", max: 6, context: "daily" }];
    const r = readiness(day({ date: "2026-11-10", pain }));
    expect(r.painHold?.area).toBe("knee");
    expect(r.painHold!.reason).toContain("Log your pain daily to clear this hold.");
    expect(r.painHold!.reason.endsWith(DOCTOR)).toBe(true);
  });

  it("pain 6, then 2/2/2 on 3 distinct days → cleared", () => {
    const pain = [
      { area: "knee", date: "2026-11-05", max: 6, context: "daily" },
      { area: "knee", date: "2026-11-06", max: 2, context: "daily" },
      { area: "knee", date: "2026-11-08", max: 2, context: "daily" },
      { area: "knee", date: "2026-11-09", max: 2, context: "daily" },
    ];
    expect(readiness(day({ date: "2026-11-10", pain })).painHold).toBeNull();
  });

  it("several clean entries on one date count as one day", () => {
    const pain = [
      { area: "knee", date: "2026-11-07", max: 6, context: "daily" },
      { area: "knee", date: "2026-11-08", max: 2, context: "daily" },
      { area: "knee", date: "2026-11-08", max: 1, context: "after_run" },
      { area: "knee", date: "2026-11-09", max: 2, context: "daily" },
    ];
    expect(readiness(day({ date: "2026-11-10", pain })).painHold).not.toBeNull();
  });

  it("entries after d.date are ignored", () => {
    const pain = [{ area: "shin", date: "2026-11-11", max: 6, context: "daily" }];
    expect(readiness(day({ date: "2026-11-10", pain })).painHold).toBeNull();
  });

  it("rising after-run pain across risingSessions holds even under maxDuring", () => {
    expect(PAIN.risingSessions).toBe(2);
    const pain = [
      { area: "shin", date: "2026-11-06", max: 1, context: "after_run" },
      { area: "shin", date: "2026-11-09", max: 2, context: "after_run" },
    ];
    const r = readiness(day({ pain }));
    expect(r.painHold?.area).toBe("shin");
    expect(r.painHold!.reason).toMatch(/rising/i);
    expect(r.painHold!.reason.endsWith(DOCTOR)).toBe(true);
    // A flat later session alone does not clear it; holdUntilBelowDays clean logged days do.
    const flat = (date: string) => ({ area: "shin", date, max: 2, context: "after_run" });
    expect(readiness(day({ pain: [...pain, flat("2026-11-10")] })).painHold).not.toBeNull();
    expect(readiness(day({ date: "2026-11-12", pain: [...pain, flat("2026-11-10"), flat("2026-11-11"), flat("2026-11-12")] })).painHold).toBeNull();
    // Rising from 0 to 0 is not rising.
    expect(readiness(day({ pain: [{ area: "shin", date: "2026-11-09", max: 0, context: "after_run" }, { area: "shin", date: "2026-11-10", max: 0, context: "after_run" }] })).painHold).toBeNull();
  });

  it("daily entries don't count toward the rising pattern", () => {
    const pain = [
      { area: "hip", date: "2026-11-08", max: 1, context: "daily" },
      { area: "hip", date: "2026-11-09", max: 2, context: "daily" },
    ];
    expect(readiness(day({ pain })).painHold).toBeNull();
  });
});

describe("readiness: fired", () => {
  it("a calm green day fires nothing", () => {
    expect(readiness(BASE).fired).toEqual([]);
  });

  it("lists every rule that changes something, with its inputs", () => {
    const r = readiness(
      day({
        recoveryScore: 20,
        recentScores: [50, 20, 25, 20],
        sleepDebtMin3d: 120,
        pain: [{ area: "knee", date: "2026-11-10", max: 5, context: "after_run" }],
        jointStatus: "restricted",
      }),
    );
    const ids = r.fired.map((f) => f.ruleId);
    expect(ids).toEqual([
      "pain.monitoring",
      "pain.jointStatus",
      "recovery.color",
      "recovery.redSwap",
      "recovery.lowStreak",
      "recovery.sleepDebt",
    ]);
    expect(r.fired.find((f) => f.ruleId === "recovery.color")!.inputs).toMatchObject({ recoveryScore: 20, recoveryState: "SCORED" });
    expect(r.fired.find((f) => f.ruleId === "recovery.sleepDebt")!.inputs).toMatchObject({ sleepDebtMin3d: 120 });
    expect(r.fired.find((f) => f.ruleId === "recovery.lowStreak")!.inputs).toMatchObject({ recentScores: [20, 25, 20] });
    expect(r.fired.find((f) => f.ruleId === "pain.monitoring")!.inputs).toMatchObject({ area: "knee" });
    expect(r.fired.find((f) => f.ruleId === "pain.jointStatus")!.inputs).toMatchObject({ jointStatus: "restricted" });
  });

  it("unknown recovery fires recovery.color only; yellow fires color + yellowScale", () => {
    expect(readiness(day({ recoveryScore: null })).fired.map((f) => f.ruleId)).toEqual(["recovery.color"]);
    expect(readiness(day({ recoveryScore: 50 })).fired.map((f) => f.ruleId)).toEqual(["recovery.color", "recovery.yellowScale"]);
  });

  it("never invents a value from missing data", () => {
    const r = readiness({
      date: "2026-11-10",
      recoveryScore: null,
      recoveryState: null,
      hrvLn7: null,
      hrvBaseline: null,
      rhr7: null,
      rhrBaseline: null,
      sleepDebtMin3d: null,
      recentScores: [],
      pain: [],
      jointStatus: "unrestricted",
    });
    expect(r).toMatchObject({ color: "unknown", hrvTrend: "unknown", rhrElevated: null, lowStreak: false, greenStreak: false, sleepDebt: false, painHold: null });
  });
});
