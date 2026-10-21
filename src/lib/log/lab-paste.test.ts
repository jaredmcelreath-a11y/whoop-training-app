import { describe, expect, it } from "vitest";
import { parseLabPaste } from "./lab-paste";

describe("parseLabPaste", () => {
  it("parses the four common shapes and reports garbage", () => {
    const r = parseLabPaste(
      [
        "Ferritin: 120 ng/mL",
        "Vitamin D 45 ng/mL",
        "HbA1c: 5.2 %",
        "hs-CRP: 1.1 mg/L",
        "this is not a result",
        "",
      ].join("\n"),
    );
    expect(r.parsed).toEqual([
      { marker: "Ferritin", value: 120, unit: "ng/mL" },
      { marker: "Vitamin D", value: 45, unit: "ng/mL" },
      { marker: "HbA1c", value: 5.2, unit: "%" },
      { marker: "hs-CRP", value: 1.1, unit: "mg/L" },
    ]);
    expect(r.unparsed).toEqual(["this is not a result"]);
  });
});
