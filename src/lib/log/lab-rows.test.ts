import { describe, expect, it } from "vitest";
import { mergeRows, type FormRow } from "./lab-rows";

const row = (key: number, marker: string, value = "", unit = ""): FormRow => ({ key, marker, value, unit, flag: "", refRange: "" });

describe("mergeRows", () => {
  it("drops blank rows, updates a matching marker in place, appends the rest", () => {
    let k = 100;
    const next = () => k++;
    const out = mergeRows(
      [row(1, ""), row(2, "Ferritin", "90", "ng/mL"), row(3, "Invented Marker", "4", "mg/L")],
      [
        { marker: "ferritin", value: 110, unit: "ng/mL", flag: "Optimal" },
        { marker: "Vitamin D", value: 32, unit: "ng/mL", refRange: "30–100" },
        { marker: "Iron", value: 85, unit: "ug/dL" },
      ],
      next,
    );
    expect(out).toEqual([
      { key: 2, marker: "Ferritin", value: "110", unit: "ng/mL", flag: "Optimal", refRange: "" },
      row(3, "Invented Marker", "4", "mg/L"),
      { key: 100, marker: "Vitamin D", value: "32", unit: "ng/mL", flag: "", refRange: "30–100" },
      { key: 101, marker: "Iron", value: "85", unit: "ug/dL", flag: "", refRange: "" },
    ]);
  });
});
