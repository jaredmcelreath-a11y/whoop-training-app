import { describe, expect, it } from "vitest";
import { parseLabText, parseLabTexts } from "./lab-text";

// Recognized-text fixtures with invented values; no real screenshots or results.
describe("parseLabText", () => {
  it("pairs a name and value on separate lines", () => {
    const { results } = parseLabText("Ferritin\n120 ng/mL\nOptimal\nVitamin D\n32 ng/mL\n30 - 100", []);
    expect(results).toEqual([
      { marker: "Ferritin", value: 120, unit: "ng/mL", flag: "Optimal" },
      { marker: "Vitamin D", value: 32, unit: "ng/mL", refRange: "30–100" },
    ]);
  });

  it("reads a same-line layout", () => {
    expect(parseLabText("HbA1c 5.2 % Normal", []).results).toEqual([{ marker: "HbA1c", value: 5.2, unit: "%", flag: "Normal" }]);
  });

  it("never takes the next marker's number", () => {
    const r = parseLabText("Ferritin\nIron\n85 ug/dL", []);
    expect(r.results).toEqual([{ marker: "Iron", value: 85, unit: "ug/dL" }]);
    expect(r.unread).toContain("Ferritin");
  });

  it("matches aliases in any case", () => {
    expect(parseLabText("25-OH VITAMIN D 41 ng/mL", []).results).toEqual([{ marker: "Vitamin D", value: 41, unit: "ng/mL" }]);
  });

  it("counts the owner's stored marker names", () => {
    expect(parseLabText("Invented Marker 7.5 mg/L", ["Invented Marker"]).results).toEqual([
      { marker: "Invented Marker", value: 7.5, unit: "mg/L" },
    ]);
  });

  it("reads commas and less-than values", () => {
    expect(parseLabText("Lp(a) <10 nmol/L\nCK 1,200 U/L", []).results).toEqual([
      { marker: "Lp(a)", value: 10, unit: "nmol/L", flag: "Below 10" },
      { marker: "CK", value: 1200, unit: "U/L" },
    ]);
  });

  it("keeps the last of a repeated marker and notes it", () => {
    const r = parseLabText("Ferritin 100 ng/mL\nFerritin 110 ng/mL", []);
    expect(r.results).toEqual([{ marker: "Ferritin", value: 110, unit: "ng/mL" }]);
    expect(r.unread).toContain("Duplicate: Ferritin");
  });

  it("still reads the old Marker: value unit paste format", () => {
    expect(parseLabText("Invented Thing: 4.2 mmol/L", [], { loose: true }).results).toEqual([{ marker: "Invented Thing", value: 4.2, unit: "mmol/L" }]);
  });

  it("reads nothing from labels alone", () => {
    expect(parseLabText("WHOOP\nAdvanced Labs\nYour Results", [])).toEqual({ results: [], unread: [], drawnOn: null });
  });

  it("finds the draw date", () => {
    expect(parseLabText("Collected Mar 3, 2026", []).drawnOn).toBe("2026-03-03");
    expect(parseLabText("03/04/2026", []).drawnOn).toBe("2026-03-04");
    expect(parseLabText("Drawn 2026-02-11\nFerritin 90 ng/mL", []).drawnOn).toBe("2026-02-11");
    expect(parseLabText("Ferritin 90 ng/mL", []).drawnOn).toBeNull();
  });
});

const val = (text: string, marker: string, opts?: { loose?: boolean }) =>
  parseLabText(text, [], opts).results.find((r) => r.marker === marker);

describe("parseLabText: compound names (review I1)", () => {
  it.each([
    ["HDL Cholesterol 55 mg/dL\nNon-HDL Cholesterol 140 mg/dL", "HDL Cholesterol", 55],
    ["Total Cholesterol 190 mg/dL\nCholesterol/HDL Ratio 3.4", "Total Cholesterol", 190],
    ["Hemoglobin 14.8 g/dL\nMean Corpuscular Hemoglobin 29.5 pg", "Hemoglobin", 14.8],
    ["AST 22 U/L\nALT 25 U/L\nAST/ALT Ratio 0.9", "AST", 22],
    ["Albumin 4.6 g/dL\nAlbumin/Globulin Ratio 1.8", "Albumin", 4.6],
    ["LDL Cholesterol 95 mg/dL\nLDL Particle Number 1100 nmol/L", "LDL Cholesterol", 95],
    ["RBC 4.9 M/uL\nRBC Magnesium 5.6 mg/dL", "RBC", 4.9],
  ])("%s keeps %s at %d", (text, marker, value) => {
    expect(val(text, marker)?.value).toBe(value);
    expect(parseLabText(text, []).unread.some((u) => u.startsWith("Duplicate"))).toBe(false);
  });
  it("reads TIBC split over two lines as TIBC, not Iron", () => {
    const r = parseLabText("Total Iron Binding\nCapacity\n310 ug/dL", []);
    expect(r.results.map((x) => x.marker)).toEqual(["TIBC"]);
  });
});

describe("parseLabText: numbers that aren't the value (review I2)", () => {
  it("skips ranges, dates and reference lines before the value", () => {
    expect(val("Ferritin\n30 - 400\n120 ng/mL", "Ferritin")).toMatchObject({ value: 120, unit: "ng/mL", refRange: "30–400" });
    expect(val("Ferritin\nOptimal range 30-400\n120 ng/mL", "Ferritin")?.value).toBe(120);
    expect(val("hs-CRP\nRef < 1.0\n0.4 mg/L", "hs-CRP")).toMatchObject({ value: 0.4, unit: "mg/L" });
    expect(val("Ferritin\nMar 3, 2026\n120 ng/mL", "Ferritin")?.value).toBe(120);
  });
  it("doesn't read a heading count as a result", () => {
    expect(parseLabText("Iron Panel\n4 Biomarkers\nFerritin 120 ng/mL", []).results.map((r) => r.marker)).toEqual(["Ferritin"]);
  });
  it("reads each screenshot on its own, so a cut-off value never takes the next one's status bar", () => {
    const r = parseLabTexts(["Ferritin 120 ng/mL\nVitamin D", "9:41\nLabs\nVitamin B12 520 pg/mL"], []);
    expect(r.results.map((x) => [x.marker, x.value])).toEqual([["Ferritin", 120], ["Vitamin B12", 520]]);
    expect(r.unread).toContain("Vitamin D");
  });
  it("notes a marker repeated across screenshots and keeps the later one", () => {
    const r = parseLabTexts(["Ferritin 100 ng/mL", "Ferritin 110 ng/mL"], []);
    expect(r.results).toEqual([{ marker: "Ferritin", value: 110, unit: "ng/mL" }]);
    expect(r.unread).toContain("Duplicate: Ferritin");
  });
});

describe("parseLabText: screenshots aren't free-form pastes (review I3)", () => {
  it("reads nothing from an unrelated screen", () => {
    const home = "9:41\nRecovery 67 %\nHRV 45 ms\nSleep Performance 92 %\nStrain 12.4 Today\nUpdated 3 days ago";
    expect(parseLabText(home, []).results).toEqual([]);
  });
});

describe("parseLabText: digits in names (review I4)", () => {
  it("reads 25-OH and D3 spellings as the name, not the value", () => {
    expect(val("Vitamin D, 25-OH 41 ng/mL", "Vitamin D")?.value).toBe(41);
    expect(val("Vitamin D3 41 ng/mL", "Vitamin D")?.value).toBe(41);
    expect(val("Vitamin D 25-OH: 41 ng/mL", "Vitamin D", { loose: true })?.value).toBe(41);
  });
});

describe("parseLabText: description text (review I5)", () => {
  it("ignores a marker mentioned in a sentence", () => {
    const r = parseLabText("Ferritin\n120 ng/mL\nWhat is Ferritin?\nLevels below 30 ng/mL may limit endurance.", []);
    expect(r.results).toEqual([{ marker: "Ferritin", value: 120, unit: "ng/mL" }]);
  });
});

describe("parseLabText: units (review I6)", () => {
  it("takes a unit from the next line and allows none", () => {
    expect(val("Ferritin\n120\nng/mL", "Ferritin")).toMatchObject({ value: 120, unit: "ng/mL" });
    expect(val("eGFR 98", "eGFR")).toMatchObject({ value: 98, unit: "" });
  });
});
