import { describe, expect, it } from "vitest";
import { fromMeters, parseNumber, toMeters } from "./units";

describe("units", () => {
  it("converts to meters", () => {
    expect(toMeters(25, "yd")).toBeCloseTo(22.86, 6);
    expect(toMeters(1, "mi")).toBeCloseTo(1609.344, 6);
    expect(toMeters(2, "km")).toBeCloseTo(2000, 6);
    expect(toMeters(7, "m")).toBeCloseTo(7, 6);
  });
  it("round-trips", () => {
    for (const u of ["yd", "m", "mi", "km"] as const) {
      expect(fromMeters(toMeters(3.7, u), u)).toBeCloseTo(3.7, 6);
    }
  });
  it("parseNumber", () => {
    expect(parseNumber(" 165.4 ")).toBe(165.4);
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("   ")).toBeNull();
    expect(parseNumber(null)).toBeNull();
    expect(parseNumber("1,5")).toBeNaN();
    expect(parseNumber("abc")).toBeNaN();
  });
});

describe("feet", () => {
  it("converts a 75 ft pool to 22.86 m and back", () => {
    expect(toMeters(75, "ft")).toBeCloseTo(22.86, 5);
    expect(fromMeters(22.86, "ft")).toBeCloseTo(75, 5);
  });
});
