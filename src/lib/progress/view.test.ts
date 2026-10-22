import { describe, expect, it } from "vitest";
import type { ScanDelta } from "./series";
import { gainLine, paceLabel, parseRange, scanSplitText, shortDate } from "./view";

const scan = (scannedOn: string) => ({ scannedOn, weightLb: 150, leanMassLb: 120, fatMassLb: 30 });
const delta = (leanLb: number | null, fatLb: number | null, leanSharePct: number | null): ScanDelta => ({
  from: scan("2026-10-03"),
  to: scan("2026-12-01"),
  weightLb: 4,
  leanLb,
  fatLb,
  leanSharePct,
});

describe("parseRange", () => {
  it("accepts known ranges", () => {
    expect(parseRange("2w")).toBe("2w");
    expect(parseRange("2m")).toBe("2m");
    expect(parseRange(["4w"])).toBe("4w");
  });
  it("defaults to 4w", () => {
    expect(parseRange("x")).toBe("4w");
    expect(parseRange(undefined)).toBe("4w");
  });
});

describe("paceLabel", () => {
  it("formats swim pace", () => expect(paceLabel(95, "100 yd")).toBe("1:35 /100 yd"));
  it("formats run pace", () => expect(paceLabel(3600 / 7, "mi")).toBe("8:34 /mi"));
  it("carries rounding into minutes", () => expect(paceLabel(119.6, "mi")).toBe("2:00 /mi"));
});

describe("gainLine", () => {
  it("shows gained of goal", () =>
    expect(gainLine({ startLb: 150, currentLb: 154.2, gainedLb: 4.2, goalLb: 15 })).toBe("+4.2 of 15 lb"));
  it("asks for a weigh-in when there is no current weight", () =>
    expect(gainLine({ startLb: 150, currentLb: null, gainedLb: null, goalLb: 15 })).toBe("Log your weight to start tracking"));
  it("asks for a start weight when there is none", () =>
    expect(gainLine({ startLb: null, currentLb: 154, gainedLb: null, goalLb: 15 })).toBe("Set a gain start weight"));
  it("shows a loss with a minus sign", () =>
    expect(gainLine({ startLb: 150, currentLb: 149, gainedLb: -1, goalLb: 15 })).toBe("-1.0 of 15 lb"));
});

describe("scanSplitText", () => {
  it("handles a single scan", () => expect(scanSplitText(null, 1)).toBe("One scan so far. Rescan to see lean vs fat."));
  it("says so when every scan predates the season start", () =>
    expect(scanSplitText(null, 2)).toBe("Your scans are all from before the season started. Rescan to see lean vs fat."));
  it("shows the lean share", () =>
    expect(scanSplitText(delta(3, 1, 75), 2)).toBe(
      "Since Oct 3: lean +3.0 lb, fat +1.0 lb (75% lean). Single scans vary; the trend across several scans matters more.",
    ));
  it("omits the share when it is null", () =>
    expect(scanSplitText(delta(3, -1, null), 2)).toBe(
      "Since Oct 3: lean +3.0 lb, fat -1.0 lb. Single scans vary; the trend across several scans matters more.",
    ));
});

describe("shortDate", () => {
  it("formats without shifting the day", () => expect(shortDate("2026-10-03")).toBe("Oct 3"));
});
