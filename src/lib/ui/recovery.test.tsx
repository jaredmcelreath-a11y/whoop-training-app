import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecoveryRing } from "@/components/recovery-ring";
import { BAND_LABEL, recoveryBand } from "./recovery";

describe("recoveryBand", () => {
  it("uses WHOOP's 67 / 34 bands", () => {
    expect(recoveryBand(67)).toBe("good");
    expect(recoveryBand(66)).toBe("caution");
    expect(recoveryBand(34)).toBe("caution");
    expect(recoveryBand(33)).toBe("low");
    expect(recoveryBand(null)).toBeNull();
  });

  it("labels each band in words", () => {
    expect(BAND_LABEL).toEqual({ good: "High Recovery", caution: "Moderate Recovery", low: "Low Recovery" });
  });
});

describe("RecoveryRing", () => {
  it("shows the pending label and no arc when there is no score", () => {
    const html = renderToStaticMarkup(<RecoveryRing score={null} band={null} pendingLabel="Pending" />);
    expect(html).toContain("Pending");
    expect(html).not.toContain("data-arc");
    expect(html).not.toContain("NaN");
  });

  it("draws an arc proportional to the score, with the band label", () => {
    const html = renderToStaticMarkup(<RecoveryRing score={78} band="good" pendingLabel="Pending" />);
    const arc = Math.round(0.78 * 2 * Math.PI * 62);
    expect(html).toContain("data-arc");
    expect(html).toMatch(new RegExp(`stroke-dasharray="${arc} `));
    expect(html).toContain("78%");
    expect(html).toContain("High Recovery");
    expect(html).not.toContain("RECOVERY<");
    expect(html).not.toContain("NaN");
  });
});
