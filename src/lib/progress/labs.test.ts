import { describe, expect, it } from "vitest";
import { unitSplit } from "./labs";

describe("unitSplit", () => {
  it("keeps only the latest unit's points and counts the rest", () => {
    const out = unitSplit([
      { drawnOn: "2026-01-01", value: 100, unit: "mg/dL" },
      { drawnOn: "2026-03-01", value: 110, unit: "MG/dL " },
      { drawnOn: "2026-06-01", value: 2.8, unit: "mmol/L" },
    ]);
    expect(out.unit).toBe("mmol/L");
    expect(out.points).toEqual([{ date: "2026-06-01", value: 2.8 }]);
    expect(out.otherUnits).toEqual([{ unit: "mg/dL", count: 2 }]);
  });

  it("has no other units when all match", () => {
    const out = unitSplit([
      { drawnOn: "2026-01-01", value: 1, unit: "ng/mL" },
      { drawnOn: "2026-02-01", value: 2, unit: "ng/mL" },
    ]);
    expect(out.unit).toBe("ng/mL");
    expect(out.points).toHaveLength(2);
    expect(out.otherUnits).toEqual([]);
  });

  it("handles empty history", () => {
    expect(unitSplit([])).toEqual({ unit: "", points: [], otherUnits: [] });
  });
});
