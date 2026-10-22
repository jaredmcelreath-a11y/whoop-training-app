import { describe, expect, it } from "vitest";
import { titleCase } from "./title-case";

const CASES: [string, string][] = [
  ["Easy run", "Easy Run"],
  ["Z2 bike 60 min", "Z2 Bike 60 min"],
  ["pre-run snack", "Pre-Run Snack"],
  ["hrv check", "HRV Check"],
  ["vo2 max test", "VO2 Max Test"],
  ["easy swim 40 min", "Easy Swim 40 min"],
  ["fuel so far", "Fuel So Far"],
  ["out of the saddle", "Out of the Saddle"],
  ["take it to", "Take It To"],
  ["Upper A", "Upper A"],
  ["n-of-1 trial", "n-of-1 Trial"],
  ["apple health to training app: iphone shortcut guide", "Apple Health to Training App: iPhone Shortcut Guide"],
  ["part 2: the nutrient list", "Part 2: The Nutrient List"],
  ["3b. yesterday (second pass)", "3b. Yesterday (Second Pass)"],
  ["optional shorter build: loops (advanced)", "Optional Shorter Build: Loops (Advanced)"],
  ["", ""],
];

describe("titleCase", () => {
  for (const [input, expected] of CASES) {
    it(`"${input}" → "${expected}"`, () => {
      expect(titleCase(input)).toBe(expected);
    });
  }

  it("is idempotent", () => {
    for (const [input] of CASES) expect(titleCase(titleCase(input))).toBe(titleCase(input));
  });

  it("keeps runs of spaces", () => {
    expect(titleCase("easy  run")).toBe("Easy  Run");
  });
});
