import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { bandArc, MiniRing } from "./mini-ring";

describe("bandArc", () => {
  it("places the target band along the ring", () => {
    expect(bandArc(9, 11, 21, 100)).toEqual({ dash: "9.52 100", offset: -42.86 });
  });
});

describe("MiniRing", () => {
  it("draws track, target band and value for strain", () => {
    const html = renderToStaticMarkup(
      <MiniRing label="Strain" value={8.2} max={21} display="8.2" tone="strain" band={{ low: 9, high: 11 }} pendingLabel="Pending" />,
    );
    expect(html.match(/<circle/g)).toHaveLength(3);
    expect(html).toContain('aria-label="Strain 8.2, target 9 to 11"');
  });
  it("shows the pending label with no value arc", () => {
    const html = renderToStaticMarkup(
      <MiniRing label="Sleep" value={null} max={100} display="" tone="sleep" band={null} pendingLabel="Pending" />,
    );
    expect(html.match(/<circle/g)).toHaveLength(1);
    expect(html).toContain("Pending");
    expect(html).toContain('aria-label="Sleep Pending"');
  });
  it("uses classes, not color literals", () => {
    const html = renderToStaticMarkup(
      <MiniRing label="Sleep" value={84} max={100} display="84%" tone="sleep" band={null} pendingLabel="Pending" />,
    );
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
    expect(html).toContain('aria-label="Sleep 84%"');
  });
});
