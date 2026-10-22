import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StripBox } from "./strip-box";

describe("StripBox (week strip day)", () => {
  it("marks done and missed days with different shapes, not only color", () => {
    const done = renderToStaticMarkup(<StripBox state="done" />);
    const missed = renderToStaticMarkup(<StripBox state="missed" />);
    expect(done).toContain('data-glyph="check"');
    expect(missed).toContain('data-glyph="close"');
  });

  it("leaves future and rest days empty", () => {
    expect(renderToStaticMarkup(<StripBox state="future" />)).not.toContain("data-glyph");
    expect(renderToStaticMarkup(<StripBox state="rest" />)).not.toContain("data-glyph");
  });
});
