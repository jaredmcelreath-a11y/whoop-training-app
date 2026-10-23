import { describe, expect, it } from "vitest";
import { changeLine, goalLine, hms, legTime } from "./projection-view";

describe("projection text", () => {
  it("formats a finish time as h:mm:ss", () => {
    expect(hms(24150)).toBe("6:42:30");
    expect(hms(2580)).toBe("0:43:00");
  });
  it("says how the week moved, to the second", () => {
    expect(changeLine(24078, 24150)).toBe("▼ 1:12 from last week");
    expect(changeLine(24150, 24105)).toBe("▲ 0:45 from last week");
    expect(changeLine(24150, 20000)).toBe("▲ 1:09:10 from last week");
    expect(changeLine(1, 1)).toBe("Same as last week");
    expect(changeLine(5, null)).toBe("First Projection");
  });
  it("shows the goal, defaulting to under 6:00", () => {
    expect(goalLine(null)).toBe("Goal: Under 6:00");
    expect(goalLine(20700)).toBe("Goal: Under 5:45");
  });
  it("writes leg times with units, so 43 minutes never reads as 0:43", () => {
    expect(legTime(2617)).toBe("44m");
    expect(legTime(12600)).toBe("3h 30m");
    expect(legTime(8170)).toBe("2h 16m");
    expect(legTime(720)).toBe("12m");
  });
});
