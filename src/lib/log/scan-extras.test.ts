import { describe, it, expect } from "vitest";
import { ScanExtras, mergeScanExtras, readScanExtras, scanExtrasLabel } from "./scan-extras";

// Invented values.
const form = (values: Record<string, string>) => (name: string) => {
  const v = values[name];
  return v === undefined || v === "" ? null : Number(v);
};

describe("readScanExtras", () => {
  it("reads segment groups and detail fields, leaving out blanks", () => {
    const x = readScanExtras(form({ "segmentalLeanLb.leftLeg": "18", "segmentalLeanLb.torso": "", totalBodyWaterLb: "85.3", bioAge: "24" }));
    expect(x).toEqual({ segmentalLeanLb: { leftLeg: 18 }, totalBodyWaterLb: 85.3, bioAge: 24 });
    expect(ScanExtras.safeParse(x).success).toBe(true);
  });

  it("is null when nothing was entered", () => {
    expect(readScanExtras(form({}))).toBeNull();
  });

  it("keeps a bad entry so validation can name it", () => {
    const x = readScanExtras((n) => (n === "segmentalFatLb.rightArm" ? NaN : null));
    const r = ScanExtras.safeParse(x);
    expect(r.success).toBe(false);
    if (!r.success) expect(scanExtrasLabel(r.error.issues[0].path)).toBe("Right arm fat");
  });
});

describe("ScanExtras", () => {
  it("matches the stored shape of an imported scan and rejects out-of-range values", () => {
    const imported = {
      ecfLb: 28, icfLb: 57, bioAge: 24, mineralLb: 8, proteinLb: 25, waistHipRatio: 0.78,
      segmentalFatLb: { torso: 11, leftArm: 1.4, leftLeg: 3.7, rightArm: 1.2, rightLeg: 3.4 },
      segmentalLeanLb: { torso: 50, leftArm: 6, leftLeg: 18, rightArm: 6, rightLeg: 18.5 },
      totalBodyWaterLb: 85, subcutaneousFatLb: 19, visceralFatMassLb: 2.6, visceralFatAreaCm2: 52,
    };
    expect(ScanExtras.safeParse(imported).success).toBe(true);
    expect(ScanExtras.safeParse({ waistHipRatio: 7 }).success).toBe(false);
    expect(scanExtrasLabel(["waistHipRatio"])).toBe("Waist-to-hip ratio");
  });
});

describe("mergeScanExtras", () => {
  it("lays new values over old, merging segment groups per segment", () => {
    expect(mergeScanExtras({ a: 1, segmentalFatLb: { torso: 10 } }, { a: 2, segmentalFatLb: { leftLeg: 3 } })).toEqual({
      a: 2,
      segmentalFatLb: { torso: 10, leftLeg: 3 },
    });
    expect(mergeScanExtras(null, null)).toBeNull();
  });
});
