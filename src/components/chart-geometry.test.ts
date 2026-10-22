import { describe, expect, it } from "vitest";
import { chartGeometry } from "./chart-geometry";

const opts = { width: 320, height: 140, pad: 24 };
const pts = (...v: [string, number][]) => v.map(([date, value]) => ({ date, value }));

describe("chartGeometry", () => {
  it("draws two points as one two-command path spanning the padded width", () => {
    const g = chartGeometry([pts(["2026-10-01", 1], ["2026-10-11", 2])], opts);
    expect(g.paths).toHaveLength(1);
    expect(g.paths[0].match(/[ML]/g)).toHaveLength(2);
    expect(g.dots[0].x).toBe(24);
    expect(g.dots[1].x).toBe(296);
  });
  it("keeps y finite for a flat series", () => {
    const g = chartGeometry([pts(["2026-10-01", 5], ["2026-10-02", 5])], opts);
    for (const d of g.dots) expect(Number.isFinite(d.y)).toBe(true);
    for (const t of g.yTicks) expect(Number.isFinite(t.y)).toBe(true);
  });
  it("gives one path per segment", () => {
    const g = chartGeometry(
      [pts(["2026-10-01", 1], ["2026-10-02", 2]), pts(["2026-10-20", 3], ["2026-10-21", 4])],
      opts,
    );
    expect(g.paths).toHaveLength(2);
  });
  it("maps a higher value to a smaller y", () => {
    const g = chartGeometry([pts(["2026-10-01", 1], ["2026-10-02", 9])], opts);
    expect(g.dots[1].y).toBeLessThan(g.dots[0].y);
  });
  it("emits 3 y-ticks and short first/last x-labels", () => {
    const g = chartGeometry([pts(["2026-10-03", 1], ["2026-10-21", 9])], opts);
    expect(g.yTicks).toHaveLength(3);
    expect(g.xLabels.map((l) => l.label)).toEqual(["Oct 3", "Oct 21"]);
  });
  it("honours yMin and yMax", () => {
    const g = chartGeometry([pts(["2026-10-01", 5], ["2026-10-02", 5])], { ...opts, yMin: 0, yMax: 10 });
    expect(g.dots[0].y).toBe(70);
  });
});

describe("chartGeometry single date", () => {
  it("emits one x-label when every point shares a date", () => {
    const g = chartGeometry([pts(["2026-10-01", 5])], opts);
    expect(g.xLabels).toHaveLength(1);
  });
});
