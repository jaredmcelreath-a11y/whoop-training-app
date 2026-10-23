import { describe, expect, it } from "vitest";
import {
  appendEx,
  filterExercises,
  formatLastTime,
  nextSetDefaults,
  parseExList,
  plannedRowCount,
  setRowKey,
  shortDate,
  tagLine,
  targetLine,
  workoutBlocks,
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

describe("workoutBlocks", () => {
  const rx = (exerciseId: string, exercise: string) => ({
    exerciseId, exercise, sets: 3, repRange: [6, 10] as [number, number], targetWeightLb: null, note: "", ruleIds: [],
  });
  it("orders planned, then logged-only, then picked, without repeats", () => {
    const blocks = workoutBlocks(
      [rx("a", "A"), rx("b", "B")],
      [{ exerciseId: "c", exerciseName: "C" }, { exerciseId: "a", exerciseName: "A" }],
      [{ id: "d", name: "D" }, { id: "b", name: "B" }],
    );
    expect(blocks.map((b) => b.exerciseId)).toEqual(["a", "b", "c", "d"]);
    expect(blocks[0].planned?.exercise).toBe("A");
    expect(blocks[2].planned).toBeNull();
  });
});

describe("plannedRowCount", () => {
  const p = { exercise: "A", sets: 3, repRange: [6, 10] as [number, number], targetWeightLb: null, note: "", ruleIds: [] };
  it("shows the planned sets still to do, and always one row", () => {
    expect(plannedRowCount(p, 0)).toBe(3);
    expect(plannedRowCount(p, 2)).toBe(1);
    expect(plannedRowCount(p, 5)).toBe(1);
    expect(plannedRowCount(null, 4)).toBe(1);
  });
});

describe("targetLine", () => {
  const p = { exercise: "Lat Pulldown", sets: 3, repRange: [6, 10] as [number, number], targetWeightLb: 105, note: "", ruleIds: [] };
  it("reads sets by reps", () => expect(targetLine(p)).toBe("Target: 3 sets × 6–10 reps"));
  it("reads seconds for holds", () =>
    expect(targetLine({ ...p, exercise: "Plank", sets: 2, repRange: [20, 40], note: "Hold 20–40 seconds; add time when it feels easy." })).toBe(
      "Target: 2 sets × 20–40 sec",
    ));
  it("says one set in the singular", () => expect(targetLine({ ...p, sets: 1 })).toBe("Target: 1 set × 6–10 reps"));
});

describe("tagLine", () => {
  it("names the category and, for lifts, the pattern", () => {
    expect(tagLine("strength", "compound")).toBe("Strength · Compound");
    expect(tagLine("strength", "isolation")).toBe("Strength · Isolation");
    expect(tagLine("core", null)).toBe("Core");
  });
});

describe("filterExercises", () => {
  const names = ["Seated Leg Extension", "Exercise Bike Sprint", "Cable Flex Row", "Lat Pulldown"].map((name) => ({ name }));
  it("puts word-start matches first, then other matches, each alphabetical", () => {
    expect(filterExercises(names, "ex").map((e) => e.name)).toEqual(["Exercise Bike Sprint", "Seated Leg Extension", "Cable Flex Row"]);
  });
  it("returns everything for an empty query", () => expect(filterExercises(names, "  ")).toHaveLength(4));
  it("ignores case and spaces around the query", () =>
    expect(filterExercises(names, "  LAT ").map((e) => e.name)).toEqual(["Lat Pulldown"]));
});

describe("setRowKey", () => {
  it("keeps a row's identity when an earlier set is saved with the same values", () => {
    expect(setRowKey("ex", 1, 10, 100)).toBe(setRowKey("ex", 1, 10, 100));
  });
  it("gives a fresh row when the carried values change", () => {
    expect(setRowKey("ex", 1, 10, 105)).not.toBe(setRowKey("ex", 1, 10, 100));
    expect(setRowKey("ex", 1, null, null)).not.toBe(setRowKey("ex", 2, null, null));
  });
});
