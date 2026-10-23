import { describe, expect, it } from "vitest";
import { RULES } from "@/lib/engine/rules/catalog";
import { project, vdotHalfMarathonS, type ProjectionInputs } from "./race-projection";

// All paces and sessions are invented.
const P = RULES["race.projection"].params;
const none = { swimSecPer100Yd: null, runSecPerMi: null, bikeMph: null };
const empty: ProjectionInputs = { swims: [], rides: [], runs: [], vo2max: null, start: none };
const MI = 1609.344;
const YD = 0.9144;

describe("vdotHalfMarathonS", () => {
  it("matches the published VDOT 50 half marathon (about 1:31:39)", () => {
    expect(Math.abs(vdotHalfMarathonS(50) - 5499)).toBeLessThan(60);
  });
  it("is faster for a higher VO2 max", () => {
    expect(vdotHalfMarathonS(55)).toBeLessThan(vdotHalfMarathonS(45));
  });
});

describe("project", () => {
  it("uses starting paces when there's no training, and marks everything an estimate", () => {
    const p = project({ ...empty, start: { swimSecPer100Yd: 125, runSecPerMi: 660, bikeMph: null } });
    expect(p.swim).toEqual({ seconds: Math.round(125 * 21.12 * 1.05), estimate: true });
    expect(p.run).toEqual({ seconds: Math.round(660 * 13.1 * 0.9 * 1.1), estimate: true });
    expect(p.bike).toEqual({ seconds: 12600, estimate: true });
    expect(p.transitionS).toBe(720);
    expect(p.totalS).toBe(p.swim.seconds + p.bike.seconds + p.run.seconds + 720);
    expect(p.estimate).toBe(true);
  });

  it("falls back to first-timer defaults with nothing at all", () => {
    const p = project(empty);
    expect(p.swim.seconds).toBe(Math.round(P.defaultSwimSecPer100Yd * 21.12 * P.openWaterFactor));
    expect(p.bike.seconds).toBe(Math.round((P.bikeMi / P.defaultBikeMph) * 3600));
    expect([p.swim, p.bike, p.run].every((l) => l.estimate)).toBe(true);
    expect(Number.isFinite(p.totalS)).toBe(true);
  });

  it("needs two qualifying swims before the swim counts as training", () => {
    const swim = (sec100: number) => ({ distanceM: 1000 * YD, durationS: sec100 * 10 });
    expect(project({ ...empty, swims: [swim(120)] }).swim.estimate).toBe(true);
    // Faster half of [120, 130] is [120]: its median, 120 s per 100 yd.
    const two = project({ ...empty, swims: [swim(120), swim(130)] });
    expect(two.swim).toEqual({ seconds: Math.round(120 * 21.12 * 1.05), estimate: false });
  });

  it("scales runs with Riegel, adjusts easy pace to race pace, then slows for the bike", () => {
    const run = { distanceM: 5 * MI, durationS: 3000 };
    const training = 3000 * (13.1 / 5) ** 1.06 * 0.9;
    const p = project({ ...empty, runs: [run, run] });
    expect(p.run.estimate).toBe(false);
    expect(Math.abs(p.run.seconds - training * 1.1)).toBeLessThanOrEqual(1);
    const vdot = vdotHalfMarathonS(50);
    const blended = project({ ...empty, runs: [run, run], vo2max: 50 });
    expect(Math.abs(blended.run.seconds - (training + 0.3 * (vdot - training)) * 1.1)).toBeLessThanOrEqual(1);
  });

  it("rides faster in a race than the training average", () => {
    const ride = { distanceM: 20 * MI, durationS: 3600 * 1.25 }; // 16 mph
    const p = project({ ...empty, rides: [ride, ride] });
    expect(p.bike).toEqual({ seconds: Math.round((56 / (16 * 1.05)) * 3600), estimate: false });
  });

  it("ignores sessions with impossible paces, so one typo can't lock in a wrong week", () => {
    const run = { distanceM: 5 * MI, durationS: 3000 };
    const typo = { distanceM: 5 * MI, durationS: 300 }; // 1:00 per mile
    expect(project({ ...empty, runs: [run, run, typo] }).run).toEqual(project({ ...empty, runs: [run, run] }).run);
    const ride = { distanceM: 20 * MI, durationS: 3600 * 1.25 };
    const rocket = { distanceM: 400_000, durationS: 3600 }; // about 249 mph
    expect(project({ ...empty, rides: [ride, rocket] }).bike.estimate).toBe(true);
  });
});
