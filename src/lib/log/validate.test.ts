import { describe, expect, it } from "vitest";
import {
  CardioInput, LabInput, PAIN_AREAS, PainInput, ScanInput, SetInput,
  WeeklyInput, WeightInput, formError,
} from "./validate";
import { parseNumber } from "./units";

const uuid = "123e4567-e89b-42d3-a456-426614174000";
const cardio = {
  kind: "run", startedAt: "2026-10-20T12:00:00Z", durationMin: 30, distance: 3,
  unit: "mi", avgWatts: null, inclinePct: null, poolLength: null, indoor: false, notes: "",
};

describe("WeightInput", () => {
  it("accepts 165.4", () => expect(WeightInput.safeParse({ weightLb: 165.4 }).success).toBe(true));
  it("rejects bad values", () => {
    expect(WeightInput.safeParse({ weightLb: -5 }).success).toBe(false);
    expect(WeightInput.safeParse({ weightLb: parseNumber("") }).success).toBe(false);
    expect(WeightInput.safeParse({ weightLb: 2000 }).success).toBe(false);
    expect(WeightInput.safeParse({ weightLb: parseNumber("1,5") }).success).toBe(false);
  });
});

describe("SetInput", () => {
  const ok = { clientId: uuid, exerciseId: uuid, setIndex: 0, reps: 5, weightLb: 135 };
  it("accepts valid and null weight", () => {
    expect(SetInput.safeParse(ok).success).toBe(true);
    expect(SetInput.safeParse({ ...ok, weightLb: null }).success).toBe(true);
  });
  it("rejects reps 0", () => expect(SetInput.safeParse({ ...ok, reps: 0 }).success).toBe(false));
});

describe("CardioInput", () => {
  it("accepts a normal run", () => expect(CardioInput.safeParse(cardio).success).toBe(true));
  it("rejects a 500 km run", () =>
    expect(CardioInput.safeParse({ ...cardio, distance: 500, unit: "km" }).success).toBe(false));
  it("accepts a 1500 yd swim with a 25 yd pool", () =>
    expect(CardioInput.safeParse({ ...cardio, kind: "swim", distance: 1500, unit: "yd", poolLength: 25 }).success).toBe(true));
  it("rejects wrong unit for kind", () => {
    expect(CardioInput.safeParse({ ...cardio, unit: "yd" }).success).toBe(false);
    expect(CardioInput.safeParse({ ...cardio, kind: "swim", distance: 500, unit: "mi" }).success).toBe(false);
  });
  it("rejects swim over 10000 m and bad pool", () => {
    expect(CardioInput.safeParse({ ...cardio, kind: "swim", distance: 11000, unit: "m" }).success).toBe(false);
    expect(CardioInput.safeParse({ ...cardio, kind: "swim", distance: 500, unit: "m", poolLength: 5 }).success).toBe(false);
  });
  it("rejects bike over 400 km", () =>
    expect(CardioInput.safeParse({ ...cardio, kind: "bike", distance: 300, unit: "mi" }).success).toBe(false));
  it("rejects zero distance and long notes", () => {
    expect(CardioInput.safeParse({ ...cardio, distance: 0 }).success).toBe(false);
    expect(CardioInput.safeParse({ ...cardio, notes: "x".repeat(501) }).success).toBe(false);
  });
});

describe("PainInput", () => {
  it("validates", () => {
    const ok = { area: "knee", side: "left", score: 3, context: "daily" };
    expect(PAIN_AREAS).toEqual(["knee", "ankle", "shin"]);
    expect(PainInput.safeParse(ok).success).toBe(true);
    expect(PainInput.safeParse({ ...ok, score: 11 }).success).toBe(false);
    expect(PainInput.safeParse({ ...ok, score: 2.5 }).success).toBe(false);
    expect(PainInput.safeParse({ ...ok, area: "hip" }).success).toBe(false);
  });
});

describe("WeeklyInput", () => {
  it("needs at least one", () => {
    expect(WeeklyInput.safeParse({ vo2max: null, whoopAge: null }).success).toBe(false);
    expect(WeeklyInput.safeParse({ vo2max: 50, whoopAge: null }).success).toBe(true);
    expect(WeeklyInput.safeParse({ vo2max: 10, whoopAge: null }).success).toBe(false);
  });
});

describe("ScanInput", () => {
  it("needs a date and a weight or mass", () => {
    expect(ScanInput.safeParse({ scannedOn: "2026-10-20" }).success).toBe(false);
    expect(ScanInput.safeParse({ scannedOn: "2026-10-20", weightLb: 170 }).success).toBe(true);
    expect(
      ScanInput.safeParse({
        scannedOn: "2026-10-20", leanMassLb: 140, skeletalMuscleLb: 70, fatMassLb: 25,
        bodyFatPct: 15, bmrKcal: 1800, teeKcal: 2800, visceralFatLevel: 5,
        extras: { a: 1 }, source: "dexa",
      }).success,
    ).toBe(true);
    expect(ScanInput.safeParse({ scannedOn: "2026-10-20", weightLb: 170, visceralFatLevel: 0 }).success).toBe(false);
    expect(ScanInput.safeParse({ scannedOn: "2026-13-40", weightLb: 170 }).success).toBe(false);
  });
});

describe("LabInput", () => {
  it("needs results", () => {
    const r = { marker: "LDL", value: 90, unit: "mg/dL" };
    expect(LabInput.safeParse({ drawnOn: "2026-10-20", results: [r] }).success).toBe(true);
    expect(LabInput.safeParse({ drawnOn: "2026-10-20", source: "quest", results: [r] }).success).toBe(true);
    expect(LabInput.safeParse({ drawnOn: "2026-10-20", results: [] }).success).toBe(false);
  });
});

describe("formError", () => {
  it("names the field", () => {
    const r = WeightInput.safeParse({ weightLb: 2000 });
    if (r.success) throw new Error("expected failure");
    expect(formError(r.error)).toMatch(/weightLb/);
  });
});
