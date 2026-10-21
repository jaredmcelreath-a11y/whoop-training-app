import { describe, expect, it } from "vitest";
import {
  normalizeCycle,
  normalizeRecovery,
  normalizeSleep,
  normalizeWorkout,
} from "./normalize";
import cycleScored from "./fixtures/cycle-scored.json";
import cyclePending from "./fixtures/cycle-pending.json";
import cycleUnscorable from "./fixtures/cycle-unscorable.json";
import recoveryScored from "./fixtures/recovery-scored.json";
import recoveryPending from "./fixtures/recovery-pending.json";
import recoveryUnscorable from "./fixtures/recovery-unscorable.json";
import sleepScored from "./fixtures/sleep-scored.json";
import sleepPending from "./fixtures/sleep-pending.json";
import sleepUnscorable from "./fixtures/sleep-unscorable.json";
import workoutScored from "./fixtures/workout-scored.json";
import workoutPending from "./fixtures/workout-pending.json";
import workoutUnscorable from "./fixtures/workout-unscorable.json";

describe("normalizeWorkout", () => {
  it("converts kJ to kcal and maps zones", () => {
    const r = normalizeWorkout(workoutScored);
    expect(r.kilojoule).toBe(4184);
    expect(r.kcal).toBe(1000);
    expect(r.zoneMs).toEqual({ z0: 300000, z1: 600000, z2: 900000, z3: 1200000, z4: 500000, z5: 100000 });
    expect(r.sportName).toBe("running");
    expect(r.avgHr).toBe(145);
    expect(r.distanceM).toBe(8046.7);
    expect(r.start).toEqual(new Date("2026-10-19T17:00:00.000Z"));
  });
  it.each([
    ["PENDING_SCORE", workoutPending],
    ["UNSCORABLE", workoutUnscorable],
  ])("%s gives null scores", (state, p) => {
    const r = normalizeWorkout(p);
    expect(r.scoreState).toBe(state);
    for (const k of ["strain", "avgHr", "maxHr", "kilojoule", "kcal", "distanceM", "altitudeGainM", "zoneMs"] as const)
      expect(r[k]).toBeNull();
  });
});

describe("normalizeSleep", () => {
  it("converts stage ms to rounded minutes", () => {
    const r = normalizeSleep(sleepScored);
    expect(r.lightMin).toBe(225);
    expect(r.swsMin).toBe(90);
    expect(r.remMin).toBe(105);
    expect(r.awakeMin).toBe(30);
    expect(r.asleepMin).toBe(420);
    expect(r.needBaselineMin).toBe(450);
    expect(r.needDebtMin).toBe(30);
    expect(r.needStrainMin).toBe(15);
    expect(r.needNapMin).toBe(-5);
    expect(r.performancePct).toBe(88);
    expect(r.respiratoryRate).toBe(15.2);
    expect(r.cycleId).toBe(93845);
    expect(r.nap).toBe(false);
  });
  it.each([
    ["PENDING_SCORE", sleepPending],
    ["UNSCORABLE", sleepUnscorable],
  ])("%s gives null scores", (state, p) => {
    const r = normalizeSleep(p);
    expect(r.scoreState).toBe(state);
    for (const k of ["asleepMin", "lightMin", "swsMin", "remMin", "awakeMin", "performancePct", "consistencyPct", "efficiencyPct", "respiratoryRate", "needBaselineMin", "needDebtMin", "needStrainMin", "needNapMin"] as const)
      expect(r[k]).toBeNull();
  });
});

describe("normalizeCycle", () => {
  it("maps a scored cycle", () => {
    const r = normalizeCycle(cycleScored);
    expect(r).toMatchObject({ id: 93845, strain: 12.4, kilojoule: 8368, kcal: 2000, avgHr: 71, maxHr: 165, scoreState: "SCORED" });
  });
  it("keeps open cycle end null", () => {
    expect(normalizeCycle(cyclePending).end).toBeNull();
  });
  it.each([cyclePending, cycleUnscorable])("non-scored gives null scores", (p) => {
    const r = normalizeCycle(p);
    expect(r.scoreState).not.toBe("SCORED");
    for (const k of ["strain", "kilojoule", "kcal", "avgHr", "maxHr"] as const) expect(r[k]).toBeNull();
  });
});

describe("normalizeRecovery", () => {
  it("maps a scored recovery", () => {
    expect(normalizeRecovery(recoveryScored)).toMatchObject({
      cycleId: 93845,
      sleepId: "ecfc6a15-4661-442f-a9a4-f160dd7afae8",
      recoveryScore: 44,
      rhr: 64,
      hrvRmssdMs: 31.813562,
      spo2Pct: 95.6875,
      skinTempC: 33.7,
      userCalibrating: false,
    });
  });
  it.each([
    ["PENDING_SCORE", recoveryPending],
    ["UNSCORABLE", recoveryUnscorable],
  ])("%s gives null scores", (state, p) => {
    const r = normalizeRecovery(p);
    expect(r.scoreState).toBe(state);
    for (const k of ["recoveryScore", "rhr", "hrvRmssdMs", "spo2Pct", "skinTempC", "userCalibrating"] as const)
      expect(r[k]).toBeNull();
  });
});
