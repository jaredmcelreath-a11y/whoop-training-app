import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/log/dates";
import { MAX_GAP_DAYS, MIN_TREND_POINTS, liftSeries, rollingAvg, scanDelta, splitAtGaps, trendRateLbPerWeek, weeklyAdherence, type Point, type ScanLite } from "./series";

// All values below are invented test data.
const D0 = "2026-09-01";
const run = (n: number, f: (i: number) => number): Point[] => Array.from({ length: n }, (_, i) => ({ date: addDays(D0, i), value: f(i) }));

describe("rollingAvg", () => {
  it("returns the value for a single point", () => {
    expect(rollingAvg([{ date: D0, value: 150.04 }])).toEqual([{ date: D0, value: 150 }]);
  });
  it("averages the points in the trailing window", () => {
    const out = rollingAvg(run(4, (i) => 150 + i));
    expect(out.map((p) => p.value)).toEqual([150, 150.5, 151, 151.5]);
  });
  it("drops points older than 6 days", () => {
    const out = rollingAvg(run(8, (i) => 100 + i * 10));
    // Day 7 averages days 1..7: 110..170 -> 140.
    expect(out[7]).toEqual({ date: addDays(D0, 7), value: 140 });
    expect(out[0].value).toBe(100);
  });
});

describe("splitAtGaps", () => {
  it("splits on a 9-day gap", () => {
    const pts = [{ date: D0, value: 1 }, { date: addDays(D0, 9), value: 2 }];
    expect(splitAtGaps(pts)).toHaveLength(2);
  });
  it("keeps a 7-day gap together", () => {
    const pts = [{ date: D0, value: 1 }, { date: addDays(D0, MAX_GAP_DAYS), value: 2 }];
    expect(splitAtGaps(pts)).toHaveLength(1);
  });
  it("returns no segments for no points", () => {
    expect(splitAtGaps([])).toEqual([]);
  });
});

describe("trendRateLbPerWeek", () => {
  it("is 0.7 for a steady 0.1 lb/day rise", () => {
    const pts = run(14, (i) => 150 + i * 0.1);
    expect(trendRateLbPerWeek(pts, addDays(D0, 13))).toBeCloseTo(0.7, 6);
  });
  it("is null under the minimum point count", () => {
    expect(MIN_TREND_POINTS).toBe(8);
    expect(trendRateLbPerWeek(run(7, (i) => 150 + i), addDays(D0, 6))).toBeNull();
  });
  it("ignores points outside the 28-day window", () => {
    const pts = run(40, (i) => (i < 12 ? 300 : 150 + (i - 12) * 0.1));
    expect(trendRateLbPerWeek(pts, addDays(D0, 39))).toBeCloseTo(0.7, 6);
  });
});

describe("scanDelta", () => {
  const scan = (scannedOn: string, weightLb: number | null, leanMassLb: number | null, fatMassLb: number | null): ScanLite => ({ scannedOn, weightLb, leanMassLb, fatMassLb });
  it("is null with fewer than 2 scans", () => {
    expect(scanDelta([scan("2026-01-01", 150, 120, 30)], null)).toBeNull();
  });
  it("computes the lean share of a gain", () => {
    const d = scanDelta([scan("2026-01-01", 150, 120, 30), scan("2026-04-01", 154, 123, 31)], null);
    expect(d).toMatchObject({ weightLb: 4, leanLb: 3, fatLb: 1, leanSharePct: 75 });
  });
  it("has no lean share when the sum is not a gain split", () => {
    const d = scanDelta([scan("2026-01-01", 150, 120, 30), scan("2026-04-01", 151, 122, 29)], null);
    expect(d?.leanLb).toBe(2);
    expect(d?.fatLb).toBe(-1);
    expect(d?.leanSharePct).toBeNull();
  });
  it("has null fat delta when fat mass is missing", () => {
    const d = scanDelta([scan("2026-01-01", 150, 120, null), scan("2026-04-01", 154, 123, 31)], null);
    expect(d?.fatLb).toBeNull();
    expect(d?.leanSharePct).toBeNull();
  });
  describe("baseline scan", () => {
    const S = "2026-06-01";
    const at = (days: number) => scan(addDays(S, days), 150, 120, 30);
    it("starts from the latest scan on or before the season start", () => {
      const d = scanDelta([at(90), at(-30), at(40)], S);
      expect(d?.from.scannedOn).toBe(addDays(S, -30));
      expect(d?.to.scannedOn).toBe(addDays(S, 90));
    });
    it("prefers the later of two pre-season scans", () => {
      expect(scanDelta([at(-60), at(-30), at(90)], S)?.from.scannedOn).toBe(addDays(S, -30));
    });
    it("uses the earliest scan when all are after the start", () => {
      expect(scanDelta([at(40), at(10), at(90)], S)?.from.scannedOn).toBe(addDays(S, 10));
    });
    it("uses the earliest scan when the start is null", () => {
      expect(scanDelta([at(40), at(-10)], null)?.from.scannedOn).toBe(addDays(S, -10));
    });
    it("is null when the baseline is also the latest scan", () => {
      expect(scanDelta([at(-30), at(-60)], S)).toBeNull();
    });
  });
});

describe("weeklyAdherence", () => {
  // 2026-10-19 is a Monday; today is Thursday the 22nd.
  const TODAY = "2026-10-22";
  it("counts only past rows as planned", () => {
    const rows = [
      { localDate: "2026-10-19", kind: "run", status: "done" as const },
      { localDate: "2026-10-20", kind: "bike", status: "done" as const },
      { localDate: "2026-10-21", kind: "swim", status: "done" as const },
      { localDate: "2026-10-21", kind: "strength", status: "planned" as const },
      { localDate: "2026-10-22", kind: "run", status: "planned" as const },
      { localDate: "2026-10-23", kind: "bike", status: "planned" as const },
    ];
    expect(weeklyAdherence(rows, TODAY)).toEqual([{ weekStart: "2026-10-19", planned: 4, done: 3, skipped: 0, missed: 1, pct: 75 }]);
  });
  it("ignores rest rows", () => {
    const rows = [
      { localDate: "2026-10-19", kind: "rest", status: "planned" as const },
      { localDate: "2026-10-20", kind: "run", status: "skipped" as const },
    ];
    expect(weeklyAdherence(rows, TODAY)).toEqual([{ weekStart: "2026-10-19", planned: 1, done: 0, skipped: 1, missed: 0, pct: 0 }]);
  });
  it("gives a null pct for an all-future week and sorts ascending", () => {
    const rows = [
      { localDate: "2026-10-27", kind: "run", status: "planned" as const },
      { localDate: "2026-10-13", kind: "run", status: "done" as const },
    ];
    const out = weeklyAdherence(rows, TODAY);
    expect(out.map((w) => w.weekStart)).toEqual(["2026-10-12", "2026-10-26"]);
    expect(out[1]).toEqual({ weekStart: "2026-10-26", planned: 0, done: 0, skipped: 0, missed: 0, pct: null });
  });
});

describe("liftSeries", () => {
  const set = (localDate: string, reps: number, weightLb: number | null, exerciseId = "a", exerciseName = "Lift A") => ({ localDate, exerciseId, exerciseName, reps, weightLb });
  it("takes the heaviest weight and the most reps at it", () => {
    const out = liftSeries([set("2026-10-19", 10, 100), set("2026-10-20", 8, 110), set("2026-10-21", 9, 110)]);
    expect(out).toEqual([{ exerciseId: "a", name: "Lift A", weekly: [{ weekStart: "2026-10-19", topWeightLb: 110, topReps: 9, sets: 3 }] }]);
  });
  it("uses the max reps when every weight is null", () => {
    const out = liftSeries([set("2026-10-19", 12, null, "b", "Pull-up"), set("2026-10-20", 15, null, "b", "Pull-up")]);
    expect(out[0].weekly).toEqual([{ weekStart: "2026-10-19", topWeightLb: null, topReps: 15, sets: 2 }]);
  });
  it("sorts exercises by most recent set and weeks ascending", () => {
    const out = liftSeries([set("2026-10-21", 5, 50, "a"), set("2026-10-12", 5, 40, "a"), set("2026-10-22", 5, 60, "b", "Lift B")]);
    expect(out.map((l) => l.exerciseId)).toEqual(["b", "a"]);
    expect(out[1].weekly.map((w) => w.weekStart)).toEqual(["2026-10-12", "2026-10-19"]);
  });
});
