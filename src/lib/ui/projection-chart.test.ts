import { describe, expect, it } from "vitest";
import { progressPoints } from "./projection-view";

const week = (weekStart: string, totalS: number, initialTotalS: number | null = totalS) => ({ weekStart, totalS, initialTotalS });

describe("progressPoints", () => {
  it("starts from the first projection ever made, then each week", () => {
    expect(progressPoints([week("2026-10-19", 24231, 25595), week("2026-10-26", 24100)])).toEqual([
      { label: "Start", totalS: 25595 },
      { label: "Oct 19", totalS: 24231 },
      { label: "Oct 26", totalS: 24100 },
    ]);
  });
  it("has no separate start when the first week never changed", () => {
    expect(progressPoints([week("2026-10-19", 24231), week("2026-10-26", 24100)]).map((p) => p.label)).toEqual(["Oct 19", "Oct 26"]);
  });
  it("is empty with no weeks", () => {
    expect(progressPoints([])).toEqual([]);
  });
});
