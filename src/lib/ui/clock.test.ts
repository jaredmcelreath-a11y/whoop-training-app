import { describe, expect, it } from "vitest";
import { clock12, withClock12 } from "./clock";

describe("clock12", () => {
  it("turns a 24-hour time into a 12-hour one", () => {
    expect(clock12("07:10")).toBe("7:10 AM");
    expect(clock12("00:30")).toBe("12:30 AM");
    expect(clock12("12:00")).toBe("12:00 PM");
    expect(clock12("22:15")).toBe("10:15 PM");
  });
});

describe("withClock12", () => {
  it("rewrites every time inside a sentence", () => {
    expect(withClock12("Before Ride at 12:00. Done at 17:40.")).toBe("Before Ride at 12:00 PM. Done at 5:40 PM.");
  });

  it("leaves text without times alone", () => {
    expect(withClock12("60 g carbs, 1.5 h before.")).toBe("60 g carbs, 1.5 h before.");
  });
});
