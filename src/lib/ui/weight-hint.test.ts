import { describe, expect, it } from "vitest";
import { weightHint } from "./weight-hint";

const latest = { date: "2026-03-05", lb: 170.4 };

describe("weightHint (Today's weight chip)", () => {
  it("shows the weigh-in date when there is no two-week trend", () => {
    expect(weightHint({ latest, avg7: 170.1, avg7Prev: null })).toBe("Mar 5");
  });

  it("keeps the date, the 7-day average and the change vs the prior week", () => {
    expect(weightHint({ latest, avg7: 170.1, avg7Prev: 169.6 })).toBe("Mar 5 · avg 170.1 (+0.5)");
    expect(weightHint({ latest, avg7: 169.0, avg7Prev: 169.6 })).toBe("Mar 5 · avg 169.0 (-0.6)");
    expect(weightHint({ latest, avg7: 169.6, avg7Prev: 169.6 })).toBe("Mar 5 · avg 169.6 (±0.0)");
  });

  it("asks for a weigh-in when there is none", () => {
    expect(weightHint({ latest: null, avg7: null, avg7Prev: null })).toBe("Log Weight");
  });
});
