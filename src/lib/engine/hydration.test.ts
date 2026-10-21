import { describe, expect, it } from "vitest";
import { RULES } from "@/lib/engine/rules/catalog";
import { dailyWaterTargetMl, duringSessionMl, sweatRate } from "./hydration";

const dflt = RULES["hydration.exercise"].params.defaultLph;
const pct = RULES["hydration.rehydrate"].params.replacePctOfLoss / 100;

describe("sweatRate", () => {
  it("computes L/h from mass change plus fluid", () => {
    expect(sweatRate({ preLb: 160, postLb: 158.5, fluidMl: 500, durationMin: 60 })).toBeCloseTo(1.18, 2);
  });
  it("rejects a gain over 2 lb and a test under 20 min", () => {
    expect(() => sweatRate({ preLb: 160, postLb: 162.5, fluidMl: 0, durationMin: 60 })).toThrow(RangeError);
    expect(() => sweatRate({ preLb: 160, postLb: 159, fluidMl: 0, durationMin: 19 })).toThrow(RangeError);
    expect(() => sweatRate({ preLb: 160, postLb: 159, fluidMl: -1, durationMin: 30 })).toThrow(RangeError);
  });
});

describe("dailyWaterTargetMl", () => {
  it("rest day, male: 3.7 x 0.8 L", () => {
    const r = dailyWaterTargetMl({ profileSex: "male", sessions: [], sweatRates: {} });
    expect(r.baselineMl).toBeCloseTo(2960, 6);
    expect(r.trainingMl).toBe(0);
    expect(r.totalMl).toBeCloseTo(2960, 6);
  });
  it("no profile uses the lower value and says so", () => {
    const r = dailyWaterTargetMl({ profileSex: null, sessions: [], sweatRates: {} });
    expect(r.baselineMl).toBeCloseTo(2160, 6);
    expect(r.reasons.join(" ")).toContain("Set your reference-intake profile for a personal target");
  });
  it("90-min run with no test: default rate x 1.5 h x 1.25", () => {
    const r = dailyWaterTargetMl({ profileSex: "male", sessions: [{ kind: "run", durationMin: 90 }], sweatRates: {} });
    expect(r.trainingMl).toBeCloseTo(dflt * 1.5 * pct * 1000, 6);
  });
  it("measured rate above maxLph is NOT capped in the daily target, but is floored at minLph", () => {
    const hi = dailyWaterTargetMl({ profileSex: "male", sessions: [{ kind: "bike", durationMin: 120 }], sweatRates: { bike: 1.5 } });
    expect(hi.trainingMl).toBeCloseTo(1.5 * 2 * pct * 1000, 6);
    const lo = dailyWaterTargetMl({ profileSex: "male", sessions: [{ kind: "bike", durationMin: 60 }], sweatRates: { bike: 0.1 } });
    expect(lo.trainingMl).toBeCloseTo(RULES["hydration.exercise"].params.minLph * pct * 1000, 6);
  });
  it("ignores sessions under the minimum duration", () => {
    const r = dailyWaterTargetMl({ profileSex: "male", sessions: [{ kind: "run", durationMin: 59 }], sweatRates: {} });
    expect(r.trainingMl).toBe(0);
  });
});

describe("duringSessionMl", () => {
  it("caps the rate at maxLph and floors at minLph", () => {
    expect(duringSessionMl("run", 60, { run: 1.5 })).toBeCloseTo(1000, 6);
    expect(duringSessionMl("run", 60, { run: 0.1 })).toBeCloseTo(400, 6);
    expect(duringSessionMl("run", 120, {})).toBeCloseTo(dflt * 2000, 6);
  });
});
