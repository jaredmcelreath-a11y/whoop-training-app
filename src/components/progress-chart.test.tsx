import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgressChart } from "./progress-chart";

const pts = [
  { label: "Start", totalS: 25595 },
  { label: "Oct 19", totalS: 24300 },
  { label: "Oct 26", totalS: 24100 },
];

describe("ProgressChart", () => {
  it("draws one dot per point, a line, the goal line and the end labels", () => {
    const html = renderToStaticMarkup(<ProgressChart points={pts} goalS={21600} />);
    expect(html.match(/<circle/g)).toHaveLength(3);
    expect(html).toContain("<polyline");
    expect(html).toContain('data-goal="true"');
    expect(html).toContain(">Start<");
    expect(html).toContain(">Oct 26<");
    expect(html).toContain('aria-label="Projected finish from 7:06:35 at Start to 6:41:40 at Oct 26, goal 6:00:00"');
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
  });
  it("shows a note until there are two points", () => {
    const html = renderToStaticMarkup(<ProgressChart points={pts.slice(0, 1)} goalS={21600} />);
    expect(html).not.toContain("<polyline");
    expect(html).toContain("Your chart starts after next week");
  });
  it("labels each dot with its time and week for the popup", () => {
    const html = renderToStaticMarkup(<ProgressChart points={pts} goalS={21600} />);
    expect(html).toContain('aria-label="7:06:35 · Start"');
    expect(html).toContain('aria-label="6:45:00 · Oct 19"');
  });
});
