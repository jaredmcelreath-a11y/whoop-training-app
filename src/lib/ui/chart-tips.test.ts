import { describe, expect, it } from "vitest";
import { tipAfter, tipPlacement } from "./chart-tips";

describe("tipAfter", () => {
  it("opens on mouse hover and closes when the mouse leaves", () => {
    expect(tipAfter(null, { type: "enter", i: 2 })).toBe(2);
    expect(tipAfter(2, { type: "leave" })).toBeNull();
  });
  it("toggles a dot on tap, and switches between dots", () => {
    expect(tipAfter(null, { type: "tap", i: 1 })).toBe(1);
    expect(tipAfter(1, { type: "tap", i: 1 })).toBeNull();
    expect(tipAfter(1, { type: "tap", i: 3 })).toBe(3);
  });
  it("keeps a hovered dot open when the mouse also clicks it", () => {
    expect(tipAfter(1, { type: "tap", i: 1, mouse: true })).toBe(1);
  });
  it("closes when the popup itself is tapped", () => {
    expect(tipAfter(4, { type: "close" })).toBeNull();
  });
});

describe("tipPlacement", () => {
  it("places the dot by percent of the chart", () => {
    expect(tipPlacement(160, 75, 320, 150)).toMatchObject({ leftPct: 50, topPct: 50, align: "center", below: false });
  });
  it("keeps the popup inside the chart at the edges", () => {
    expect(tipPlacement(10, 75, 320, 150).align).toBe("start");
    expect(tipPlacement(310, 75, 320, 150).align).toBe("end");
  });
  it("opens below a dot near the top", () => {
    expect(tipPlacement(160, 10, 320, 150).below).toBe(true);
  });
});
