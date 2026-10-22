import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LineChart } from "./line-chart";

// Synthetic data only.
const pts = (...v: [string, number][]) => v.map(([date, value]) => ({ date, value }));
const base = { unit: "lb", label: "Weight", emptyText: "Nothing yet" };

describe("LineChart", () => {
  it("shows the empty text for one weigh-in, even with a secondary point", () => {
    const html = renderToStaticMarkup(
      <LineChart {...base} segments={[pts(["2026-10-01", 150])]} secondary={[pts(["2026-10-01", 150])]} />,
    );
    expect(html).toContain("Nothing yet");
    expect(html).not.toContain("<svg");
  });

  it("draws an svg with label and latest value for two dates", () => {
    const html = renderToStaticMarkup(
      <LineChart {...base} segments={[pts(["2026-10-01", 150], ["2026-10-08", 151.26])]} />,
    );
    expect(html).toContain("<svg");
    expect(html).toContain('aria-label="Weight"');
    expect(html).toContain("151.3 lb");
  });

  it("keeps a goal above all data inside the viewBox padding", () => {
    const html = renderToStaticMarkup(
      <LineChart {...base} segments={[pts(["2026-10-01", 150], ["2026-10-08", 151])]} goal={200} width={320} height={140} pad={24} />,
    );
    const m = /<line class="[^"]*goal[^"]*"[^>]*y1="([\d.]+)"/.exec(html);
    expect(m).not.toBeNull();
    const y = Number(m![1]);
    expect(y).toBeGreaterThanOrEqual(24);
    expect(y).toBeLessThanOrEqual(140 - 24);
  });
});

describe("LineChart theming", () => {
  const html = renderToStaticMarkup(
    <LineChart {...base} segments={[pts(["2026-10-01", 150], ["2026-10-08", 151], ["2026-10-15", 152])]} goal={155} />,
  );

  it("has no color literals, so it recolors with the theme", () => {
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });

  it("fills a soft area under each line, closed to the chart floor", () => {
    expect(html).toMatch(/<path[^>]*data-area="true"[^>]*d="M[^"]*Z"/);
  });
});
