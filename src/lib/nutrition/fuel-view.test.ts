import { describe, expect, it } from "vitest";
import { barPercent, confidenceNote, fuelNeeds, mlToOz, needLink, ozLabel, syncedLabel, WATER_TAP_ML } from "./fuel-view";
import { NEED } from "./service";
import { ML_PER_FL_OZ } from "@/lib/engine/nutrients";

describe("barPercent", () => {
  it("is eaten over target, clamped to 0..100", () => {
    expect(barPercent(500, 1000)).toBe(50);
    expect(barPercent(1500, 1000)).toBe(100);
    expect(barPercent(-5, 1000)).toBe(0);
  });
  it("is 0 for a missing or non-positive target or value", () => {
    expect(barPercent(null, 1000)).toBe(0);
    expect(barPercent(100, null)).toBe(0);
    expect(barPercent(100, 0)).toBe(0);
    expect(barPercent(Number.NaN, 100)).toBe(0);
  });
});

describe("oz formatting", () => {
  it("converts mL to whole oz", () => {
    expect(mlToOz(ML_PER_FL_OZ * 16)).toBe(16);
    expect(ozLabel(ML_PER_FL_OZ * 40, ML_PER_FL_OZ * 96)).toBe("40 / 96 oz");
  });
  it("drops the target when it is 0", () => {
    expect(ozLabel(ML_PER_FL_OZ * 40, 0)).toBe("40 oz");
  });
  it("one tap is 16 oz", () => {
    expect(mlToOz(WATER_TAP_ML)).toBeCloseTo(16, 6);
  });
});

describe("syncedLabel", () => {
  it("says not synced without a date", () => {
    expect(syncedLabel(null, "UTC")).toBe("Not synced yet");
  });
  it("shows HH:MM in the zone", () => {
    expect(syncedLabel(new Date("2026-10-21T14:05:00Z"), "UTC")).toBe("Last synced from Apple Health 14:05");
    expect(syncedLabel(new Date("2026-10-21T14:05:00Z"), "America/New_York")).toBe("Last synced from Apple Health 10:05");
  });
});

describe("needLink", () => {
  it("maps weight needs to /log", () => {
    expect(needLink("Log a weight")).toBe("/log");
    expect(needLink("Log your weight to track the gain goal")).toBe("/log");
  });
  it("maps body scan needs to the scans page", () => {
    expect(needLink("Add a body scan for lean mass")).toBe("/log/scans");
  });
  it("maps settings and unknown needs to nutrition settings", () => {
    expect(needLink("Set your reference-intake profile")).toBe("/settings/nutrition");
    expect(needLink("something else")).toBe("/settings/nutrition");
  });
});

describe("needLink with the service's real need strings", () => {
  it("sends each need to the page that fixes it", () => {
    expect(needLink(NEED.weight)).toBe("/log");
    expect(needLink(NEED.gainWeight)).toBe("/log");
    expect(needLink(NEED.scan)).toBe("/log/scans");
    expect(needLink(NEED.burn)).toBe("/log/scans");
    expect(needLink(NEED.gainStart)).toBe("/settings/nutrition");
    expect(needLink(NEED.profile)).toBe("/settings/nutrition");
  });
});

describe("confidenceNote", () => {
  it("is null without targets", () => {
    expect(confidenceNote("low", false)).toBeNull();
  });
  it("describes the confidence when targets exist", () => {
    expect(confidenceNote("low", true)).toMatch(/low confidence/i);
    expect(confidenceNote("high", true)).toMatch(/high confidence/i);
  });
});

describe("fuelNeeds", () => {
  it("returns each need with its link", () => {
    expect(fuelNeeds(["Log a weight"])).toEqual([{ text: "Log a weight", href: "/log" }]);
    expect(fuelNeeds([])).toEqual([]);
  });
});
