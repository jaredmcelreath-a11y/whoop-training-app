import { describe, it, expect } from "vitest";
import { RULES } from "@/lib/engine/rules/catalog";
import { fitSwimSets, planSwimSets, type SwimSetsInput } from "@/lib/engine/swim-sets";

const P = RULES["week.swimSets"].params;
const FT = 0.3048;
const YD = 0.9144;

// Invented pool and pace.
const base = (over: Partial<SwimSetsInput> = {}): SwimSetsInput => ({
  durationMin: 30,
  long: false,
  weekIndex: 0,
  recovery: false,
  drillIndex: 0,
  poolLengthM: 25 * YD,
  poolUnit: "yd",
  secPer100Yd: 150,
  ...over,
});

describe("planSwimSets", () => {
  it("lays out warm-up, drill, main set and cool-down that add up to the session", () => {
    const s = planSwimSets(base())!;
    expect(s.warmUpMin).toBe(P.warmUpMin);
    expect(s.coolDownMin).toBe(P.coolDownMin);
    expect(s.drill?.name).toBe(P.drills[0].name);
    expect(s.drill?.min).toBe(P.drillMin);
    expect(s.warmUpMin + (s.drill?.min ?? 0) + s.mainMin + s.coolDownMin).toBe(30);
    expect(s.nonstop).toBe(false);
  });

  it("starts easy reps at 2 down-and-backs and long reps at 3 in a 25 yd pool, rest 30 s", () => {
    const easy = planSwimSets(base())!;
    expect(easy.rep).toMatchObject({ downBacks: 2, distance: 100, unit: "yd", restSeconds: P.startRestSeconds });
    const long = planSwimSets(base({ long: true, durationMin: 45 }))!;
    expect(long.drill).toBeNull();
    expect(long.rep).toMatchObject({ downBacks: 3, distance: 150 });
  });

  it("counts down-and-backs in a 70 ft pool and rounds the distance to 5", () => {
    const s = planSwimSets(base({ poolLengthM: 70 * FT, poolUnit: "ft" }))!;
    expect(s.rep.downBacks).toBe(2);
    expect(s.rep.distance).toBe(95);
    expect(s.rep.unit).toBe("yd");
  });

  it("shows meters for a meter pool", () => {
    const s = planSwimSets(base({ poolLengthM: 25, poolUnit: "m" }))!;
    expect(s.rep.unit).toBe("m");
    expect(s.rep.distance).toBe(100);
  });

  it("grows reps 20% and cuts rest 5 s every 2 weeks, rest never under 15 s", () => {
    const at = (weekIndex: number) => planSwimSets(base({ long: true, durationMin: 60, weekIndex }))!.rep;
    expect(at(1).downBacks).toBe(3); // 150 yd
    expect(at(2).downBacks).toBe(4); // 180 yd
    expect(at(2).restSeconds).toBe(25);
    expect(at(4).downBacks).toBe(4); // 216 yd
    expect(at(6).restSeconds).toBe(P.minRestSeconds);
    expect(at(20).restSeconds).toBe(P.minRestSeconds);
  });

  it("holds the previous step in a recovery week", () => {
    const normal = planSwimSets(base({ long: true, durationMin: 60, weekIndex: 3 }))!.rep;
    const rec = planSwimSets(base({ long: true, durationMin: 60, weekIndex: 4, recovery: true }))!.rep;
    expect(rec).toEqual(normal);
  });

  it("becomes one nonstop swim once a rep would fill the main set", () => {
    const s = planSwimSets(base({ long: true, durationMin: 40, weekIndex: 30 }))!;
    expect(s.nonstop).toBe(true);
    expect(s.mainMin).toBe(40 - P.warmUpMin - P.coolDownMin);
  });

  it("rotates the drill", () => {
    expect(planSwimSets(base({ drillIndex: 1 }))!.drill?.name).toBe(P.drills[1].name);
    expect(planSwimSets(base({ drillIndex: P.drills.length }))!.drill?.name).toBe(P.drills[0].name);
  });

  it("drops the drill when it would squeeze the main set, and has no sets when too short", () => {
    const short = planSwimSets(base({ durationMin: P.warmUpMin + P.coolDownMin + P.minMainSetMin }))!;
    expect(short.drill).toBeNull();
    expect(short.mainMin).toBe(P.minMainSetMin);
    expect(planSwimSets(base({ durationMin: P.warmUpMin + P.coolDownMin + P.minMainSetMin - 1 }))).toBeNull();
  });
});

describe("fitSwimSets", () => {
  it("refits a shortened swim, keeping the reps", () => {
    const s = planSwimSets(base())!;
    const fit = fitSwimSets(s, 24)!;
    expect(fit.rep).toEqual(s.rep);
    expect(fit.warmUpMin + (fit.drill?.min ?? 0) + fit.mainMin + fit.coolDownMin).toBe(24);
    expect(fitSwimSets(s, 5)).toBeNull();
  });
});
