import { describe, expect, it } from "vitest";
import { RULES } from "@/lib/engine/rules/catalog";
import { dayType, strainTarget } from "./strain-target";

const s = (kind: string, intensity: string, durationMin = 45, details: Record<string, unknown> = {}) => ({
  kind,
  intensity,
  durationMin,
  details,
});

describe("dayType", () => {
  it("classifies a day by its planned sessions", () => {
    expect(dayType([s("rest", "easy", 0)])).toBe("rest");
    expect(dayType([])).toBe("rest");
    expect(dayType([s("run", "tempo", 40)])).toBe("hard");
    expect(dayType([s("bike", "z2", 180, { long: true })])).toBe("long");
    expect(dayType([s("run", "easy", 30), s("core", "easy", 15)])).toBe("easy");
    expect(dayType([s("strength", "strength"), s("core", "easy", 15)])).toBe("strength");
  });
  it("lets hard work win over a long session", () => {
    expect(dayType([s("run", "intervals", 40), s("bike", "z2", 180, { long: true })])).toBe("hard");
  });
});

describe("strainTarget", () => {
  const P = RULES["strain.dailyTarget"].params;
  it("uses the starting range until enough matching days exist", () => {
    const history = [8, 9, 10].map((strain) => ({ type: "easy" as const, strain }));
    expect(history.length).toBeLessThan(P.minDays);
    expect(strainTarget("easy", history)).toEqual({ low: 8, high: 11, estimate: true, type: "easy", days: 3 });
  });
  it("uses the middle half of matching days once there are enough", () => {
    const history = [8, 9, 10, 11, 12].map((strain) => ({ type: "easy" as const, strain }));
    expect(strainTarget("easy", history)).toEqual({ low: 9, high: 11, estimate: false, type: "easy", days: 5 });
  });
  it("ignores days of another type", () => {
    const history = [
      ...[8, 9, 10, 11, 12].map((strain) => ({ type: "easy" as const, strain })),
      ...[18, 19, 20, 21].map((strain) => ({ type: "hard" as const, strain })),
    ];
    expect(strainTarget("easy", history)).toMatchObject({ low: 9, high: 11, days: 5 });
    expect(strainTarget("long", history)).toEqual({ low: 12, high: 15, estimate: true, type: "long", days: 0 });
  });
});
