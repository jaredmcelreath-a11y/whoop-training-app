import { describe, expect, it } from "vitest";
import {
  appendEx,
  formatLastTime,
  nextSetDefaults,
  parseExList,
  shortDate,
} from "./strength-view";

describe("shortDate", () => {
  it("formats a local date string without shifting the day", () => {
    expect(shortDate("2026-10-14")).toBe("Oct 14");
    expect(shortDate("2026-01-01")).toBe("Jan 1");
  });
});

describe("formatLastTime", () => {
  it("says First time with no history", () => {
    expect(formatLastTime(null)).toBe("First time");
    expect(formatLastTime({ date: "2026-10-14", sets: [] })).toBe("First time");
  });

  it("collapses identical sets", () => {
    const sets = [1, 2, 3].map(() => ({ reps: 8, weightLb: 135 }));
    expect(formatLastTime({ date: "2026-10-14", sets })).toBe("Last time (Oct 14): 3×8 @ 135");
  });

  it("lists differing sets", () => {
    const sets = [
      { reps: 8, weightLb: 135 },
      { reps: 8, weightLb: 135 },
      { reps: 6, weightLb: 140 },
    ];
    expect(formatLastTime({ date: "2026-10-14", sets })).toBe(
      "Last time (Oct 14): 8@135, 8@135, 6@140",
    );
  });

  it("shows BW for null weight and keeps decimals", () => {
    expect(
      formatLastTime({ date: "2026-10-14", sets: [{ reps: 10, weightLb: null }, { reps: 10, weightLb: null }] }),
    ).toBe("Last time (Oct 14): 2×10 @ BW");
    expect(
      formatLastTime({ date: "2026-10-14", sets: [{ reps: 5, weightLb: 132.5 }, { reps: 5, weightLb: null }] }),
    ).toBe("Last time (Oct 14): 5@132.5, 5@BW");
  });
});

describe("nextSetDefaults", () => {
  const last = { date: "2026-10-14", sets: [{ reps: 8, weightLb: 135 }, { reps: 6, weightLb: 140 }] };

  it("uses the previous set in this session first", () => {
    const inSession = [
      { setIndex: 0, reps: 10, weightLb: 100 },
      { setIndex: 1, reps: 9, weightLb: 105 },
    ];
    expect(nextSetDefaults(inSession, last)).toEqual({ setIndex: 2, reps: 9, weightLb: 105 });
  });

  it("picks the highest set index, even after a removed set", () => {
    const inSession = [
      { setIndex: 2, reps: 7, weightLb: null },
      { setIndex: 0, reps: 10, weightLb: 100 },
    ];
    expect(nextSetDefaults(inSession, last)).toEqual({ setIndex: 3, reps: 7, weightLb: null });
  });

  it("falls back to last time's first set", () => {
    expect(nextSetDefaults([], last)).toEqual({ setIndex: 0, reps: 8, weightLb: 135 });
  });

  it("is empty with no history", () => {
    expect(nextSetDefaults([], null)).toEqual({ setIndex: 0, reps: null, weightLb: null });
  });
});

describe("?ex= list", () => {
  const a = "11111111-1111-4111-8111-111111111111";
  const b = "22222222-2222-4222-8222-222222222222";
  const c = "33333333-3333-4333-8333-333333333333";

  it("parses a comma list, dropping invalid ids and repeats", () => {
    expect(parseExList(`${a},nope,${b}, ${a},`)).toEqual([a, b]);
    expect(parseExList(undefined)).toEqual([]);
    expect(parseExList("")).toEqual([]);
  });

  it("flattens repeated ex params (the picker sends the list plus the new pick)", () => {
    expect(parseExList([`${a},${b}`, c])).toEqual([a, b, c]);
  });

  it("appends an id once", () => {
    expect(appendEx([a, b], c)).toBe(`${a},${b},${c}`);
    expect(appendEx([a, b], a)).toBe(`${a},${b}`);
    expect(appendEx([], a)).toBe(a);
  });
});
