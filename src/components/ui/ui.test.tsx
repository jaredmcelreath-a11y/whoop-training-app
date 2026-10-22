import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BigNum, Cap, Card, Meter, Page, PageGlow, StatChip } from "./ui";

describe("Meter", () => {
  it("clamps values above the max", () => {
    const html = renderToStaticMarkup(<Meter value={150} max={100} label="Protein" />);
    expect(html).toContain('role="meter"');
    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain('aria-valuemax="100"');
  });

  it("shows an empty meter, never NaN, when the max is zero", () => {
    const html = renderToStaticMarkup(<Meter value={40} max={0} label="Carbs" />);
    expect(html).toContain('aria-valuenow="0"');
    expect(html).not.toContain("NaN");
  });
});

describe("StatChip", () => {
  it("shows a dash and the hint when the value is missing", () => {
    const html = renderToStaticMarkup(<StatChip label="HRV" value={null} hint="No data" />);
    expect(html).toContain("—");
    expect(html).toContain("No data");
  });

  it("links when given an href", () => {
    expect(renderToStaticMarkup(<StatChip label="Weight" value="172.4" href="/log#weight" />)).toMatch(/^<a [^>]*href="\/log#weight"/);
  });

  it("shows the value when present", () => {
    const html = renderToStaticMarkup(<StatChip label="HRV" value="68 ms" icon="pulse" />);
    expect(html).toContain("68 ms");
    expect(html).toContain("<svg");
  });
});

describe("Card and Page", () => {
  it("marks a hot card", () => {
    expect(renderToStaticMarkup(<Card hot>x</Card>)).toContain('data-hot="true"');
    expect(renderToStaticMarkup(<Card>x</Card>)).not.toContain("data-hot");
  });

  it("renders a linked card as an anchor", () => {
    expect(renderToStaticMarkup(<Card href="/log">x</Card>)).toMatch(/^<a [^>]*href="\/log"/);
  });

  it("sets the glow and an optional title", () => {
    const html = renderToStaticMarkup(<Page glow="low" title="Today">x</Page>);
    expect(html).toContain('data-glow="low"');
    expect(html).toContain("<h1");
    expect(renderToStaticMarkup(<Page>x</Page>)).toContain('data-glow="accent"');
  });

  it("renders a glow layer for content that knows its band later", () => {
    expect(renderToStaticMarkup(<PageGlow glow="caution" />)).toContain('data-glow="caution"');
  });

  it("renders a cap label and a big number with its unit", () => {
    expect(renderToStaticMarkup(<Cap>Today&apos;s Session</Cap>)).toContain("Today&#x27;s Session");
    const big = renderToStaticMarkup(<BigNum unit="lb">172.4</BigNum>);
    expect(big).toContain("172.4");
    expect(big).toContain("lb");
  });
});
