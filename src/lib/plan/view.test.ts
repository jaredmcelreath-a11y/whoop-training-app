import { describe, expect, it } from "vitest";
import { RULES } from "@/lib/engine/rules/catalog";
import { titleCase } from "@/lib/ui/title-case";
import {
  weekStrip,
  AREA_LABEL,
  EVIDENCE_LABEL,
  INTENSITY_LABEL,
  KIND_LABEL,
  PHASE_LABEL,
  dayHeading,
  detailNotes,
  humanizeParams,
  intervalsLine,
  parseWeekParam,
  phaseBlocks,
  prescriptionLine,
  settingsFromForm,
  structureLine,
  weeksToRace,
} from "./view";
import type { PlanSettings } from "./settings";

const CURRENT: PlanSettings = {
  raceDate: "2027-10-17",
  seasonStart: "2026-10-26",
  windows: [{ start: "06:00", end: "09:00" }],
  longRideDow: 5,
  longRunDow: 6,
  restDow: 0,
  jointStatus: "caution",
  poolLengthM: 22.86,
};

function form(entries: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

const VALID = {
  raceDate: "2027-09-12",
  w1Start: "06:00",
  w1End: "09:00",
  w2Start: "",
  w2End: "",
  longRideDow: "5",
  longRunDow: "6",
  restDow: "0",
  jointStatus: "unrestricted",
  poolLength: "25",
  poolUnit: "yd",
};

describe("parseWeekParam", () => {
  it("keeps a valid Monday", () => {
    expect(parseWeekParam("2026-10-26", "2026-10-21")).toBe("2026-10-26");
  });
  it("falls back to the current local week when missing, malformed or not a Monday", () => {
    expect(parseWeekParam(undefined, "2026-10-21")).toBe("2026-10-19");
    expect(parseWeekParam("2026-10-27", "2026-10-21")).toBe("2026-10-19");
    expect(parseWeekParam("2026-13-02", "2026-10-21")).toBe("2026-10-19");
    expect(parseWeekParam("nope", "2026-10-21")).toBe("2026-10-19");
    expect(parseWeekParam(["2026-10-26", "x"], "2026-10-21")).toBe("2026-10-26");
  });
});

describe("dayHeading", () => {
  it("shows weekday and date", () => {
    expect(dayHeading("2026-10-26")).toBe("Mon Oct 26");
  });
});

describe("session detail lines", () => {
  it("formats a prescription line with or without a weight", () => {
    expect(prescriptionLine({ exercise: "Leg Press", sets: 3, repRange: [10, 12], targetWeightLb: 185, note: "" })).toBe(
      "Leg Press 3 × 10–12 @ 185 lb",
    );
    expect(prescriptionLine({ exercise: "Dead Bug", sets: 2, repRange: [8, 8], targetWeightLb: null, note: "x" })).toBe(
      "Dead Bug 2 × 8 @ —",
    );
  });
  it("formats walk-run intervals", () => {
    expect(intervalsLine({ runMin: 2, walkMin: 1, reps: 10 })).toBe("10 × (run 2 min, walk 1 min)");
  });
  it("formats a quality structure", () => {
    expect(structureLine({ warmUpMin: 15, hardMin: 20, coolDownMin: 10 }, "tempo")).toBe(
      "15 min warm-up · 20 min tempo · 10 min cool-down",
    );
  });
  it("collects notes from details", () => {
    const notes = detailNotes({
      note: "Running paused (joint status: restricted)",
      longRunCap: { capMin: 50, lookbackLongestMin: 45.4302, lookbackDays: 30, trimmedMin: 10, movedMin: 6, droppedMin: 4 },
      longBound: { boundMin: 90, droppedMin: 15 },
      plyo: true,
      extraWalkMin: 3,
    });
    expect(notes).toContain("Running paused (joint status: restricted)");
    expect(notes.some((n) => n.includes("capped at 50 min") && n.includes("45 min"))).toBe(true);
    expect(notes.some((n) => n.includes("90 min"))).toBe(true);
    expect(notes.some((n) => /plyometric/i.test(n))).toBe(true);
    expect(notes.some((n) => n.includes("3 min"))).toBe(true);
  });
  it("returns nothing for empty details", () => {
    expect(detailNotes({})).toEqual([]);
  });
});

describe("humanizeParams", () => {
  it("turns params into readable label/value pairs, never JSON", () => {
    const out = humanizeParams({
      taperWeeks: 2,
      maxWeeklyIncreasePct: 10,
      setsPerMusclePerWeek: [10, 14],
      whenAllSetsAtMax: true,
      swapTo: "z1_or_mobility",
      walkRun: { startRunMin: 1, everyWeeks: 2 },
    });
    expect(out).toEqual([
      { label: "Taper", value: "2 weeks" },
      { label: "Max weekly increase", value: "10%" },
      { label: "Sets per muscle per week", value: "10–14" },
      { label: "When all sets at max", value: "yes" },
      { label: "Swap to", value: "z1 or mobility" },
      {
        label: "Walk run",
        children: [
          { label: "Start run", value: "1 min" },
          { label: "Every", value: "2 weeks" },
        ],
      },
    ]);
  });
  it("adds units for hours, days, seconds and bpm", () => {
    expect(humanizeParams({ startHours: 5, rollingDays: 7, holdSeconds: [20, 40], elevatedBpm: 5, volumeFactor: 0.7, days: 1, startMinPerWeek: 45 })).toEqual([
      { label: "Start", value: "5 h" },
      { label: "Rolling", value: "7 days" },
      { label: "Hold", value: "20–40 s" },
      { label: "Elevated", value: "5 bpm" },
      { label: "Volume factor", value: "70%" },
      { label: "Days", value: "1" },
      { label: "Start", value: "45 min/week" },
    ]);
  });
});

describe("humanizeParams with lists of objects", () => {
  it("numbers each object in a list instead of printing [object Object]", () => {
    const out = humanizeParams({ tiers: [{ maxMin: 30 }, { maxMin: 75 }] });
    expect(JSON.stringify(out)).not.toContain("[object Object]");
    expect(out).toEqual([
      {
        label: "Tiers",
        children: [
          { label: "1", children: humanizeParams({ maxMin: 30 }) },
          { label: "2", children: humanizeParams({ maxMin: 75 }) },
        ],
      },
    ]);
  });
});

describe("humanizeParams open-ended tiers", () => {
  it("shows a last tier's sentinel maxMin as 'over' the previous tier's max", () => {
    const out = humanizeParams({ tiers: [{ maxMin: 90, gPerKg: [6, 8] }, { maxMin: 240 }, { maxMin: 9999, gPerKg: [8, 12] }] });
    const tiers = (out[0] as { children: { children: { label: string; value?: string }[] }[] }).children;
    expect(tiers[1].children[0]).toEqual({ label: "Planned endurance up to", value: "240 min" });
    expect(tiers[2].children[0]).toEqual({ label: "Planned endurance", value: "over 240 min" });
    expect(tiers[2].children[1]).toEqual({ label: "Per kg of bodyweight", value: "8–12 g" });
    expect(JSON.stringify(out)).not.toContain("9999");
  });

  it("renders the catalog's carb tiers without 9999", () => {
    const tiers = RULES["nutrition.carbsByLoad"].params.tiers;
    const prev = tiers[tiers.length - 2].maxMin;
    const text = JSON.stringify(humanizeParams(RULES["nutrition.carbsByLoad"].params));
    expect(text).not.toContain("9999");
    expect(text).toContain(`over ${prev} min`);
  });

  it("leaves an ordinary last tier (or a lone tier) alone", () => {
    expect(JSON.stringify(humanizeParams({ tiers: [{ maxMin: 30 }, { maxMin: 75 }] }))).toContain("75 min");
    expect(JSON.stringify(humanizeParams({ tiers: [{ maxMin: 9999 }] }))).toContain("9999 min");
  });
});

describe("humanizeParams labels", () => {
  it("uses friendlier labels for terse keys and passes a parent's unit to its children", () => {
    expect(
      humanizeParams({
        addLbUpper: 5,
        rirTarget: [1, 3],
        swcSd: 0.5,
        minHoursBetweenHardCardioAndLift: 6,
        typicalSessionMin: { swim: 40 },
      }),
    ).toEqual([
      { label: "Add (upper body)", value: "5 lb" },
      { label: "Reps in reserve", value: "1–3" },
      { label: "Smallest worthwhile change", value: "0.5 SD" },
      { label: "Min hours between hard cardio and lift", value: "6 h" },
      { label: "Typical session", children: [{ label: "Swim", value: "40 min" }] },
    ]);
  });
});

describe("season helpers", () => {
  const weeks = [
    { weekStart: "2026-10-26", index: 0, phase: "base" as const, recovery: false, gainPhase: true },
    { weekStart: "2026-11-02", index: 1, phase: "base" as const, recovery: true, gainPhase: true },
    { weekStart: "2026-11-09", index: 2, phase: "build" as const, recovery: false, gainPhase: false },
  ];
  it("groups consecutive weeks into phase blocks", () => {
    const b = phaseBlocks(weeks);
    expect(b.map((x) => [x.phase, x.weeks.length, x.start, x.end])).toEqual([
      ["base", 2, "2026-10-26", "2026-11-08"],
      ["build", 1, "2026-11-09", "2026-11-15"],
    ]);
  });
  it("counts weeks from this week to the race week", () => {
    expect(weeksToRace("2026-10-19", "2027-10-17")).toBe(51);
    expect(weeksToRace("2027-10-11", "2027-10-17")).toBe(0);
    expect(weeksToRace("2027-10-18", "2027-10-17")).toBe(0);
  });
});

describe("settingsFromForm", () => {
  it("parses a valid form, dropping an empty second window and converting yards", () => {
    const r = settingsFromForm(form(VALID), CURRENT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.settings.raceDate).toBe("2027-09-12");
    expect(r.settings.seasonStart).toBe(CURRENT.seasonStart);
    expect(r.settings.windows).toEqual([{ start: "06:00", end: "09:00" }]);
    expect(r.settings.jointStatus).toBe("unrestricted");
    expect(r.settings.poolLengthM).toBeCloseTo(22.86, 2);
  });
  it("keeps two windows and meters", () => {
    const r = settingsFromForm(form({ ...VALID, w2Start: "11:30", w2End: "13:30", poolLength: "50", poolUnit: "m" }), CURRENT);
    expect(r.ok && r.settings.windows.length).toBe(2);
    expect(r.ok && r.settings.poolLengthM).toBe(50);
  });
  it("gives a readable error for invalid input", () => {
    const sameDay = settingsFromForm(form({ ...VALID, restDow: "5" }), CURRENT);
    expect(sameDay).toEqual({ ok: false, error: "Long ride, long run and rest day must be three different days" });
    const early = settingsFromForm(form({ ...VALID, raceDate: "2026-11-15" }), CURRENT);
    expect(early.ok).toBe(false);
    expect(!early.ok && early.error).toMatch(/Race date/);
    const half = settingsFromForm(form({ ...VALID, w2Start: "11:30" }), CURRENT);
    expect(!half.ok && half.error).toMatch(/start and an end/);
    const pool = settingsFromForm(form({ ...VALID, poolLength: "abc" }), CURRENT);
    expect(!pool.ok && pool.error).toMatch(/Pool length/);
    const joint = settingsFromForm(form({ ...VALID, jointStatus: "bogus" }), CURRENT);
    expect(joint.ok).toBe(false);
    expect(!joint.ok && joint.error).not.toMatch(/\{|\[/);
  });
});

describe("weekStrip", () => {
  const s = (status: "planned" | "done" | "skipped", kind = "run") => ({ status, kind });
  it("gives each day of an invented week its state", () => {
    const days = [
      { date: "2026-03-02", sessions: [s("done"), s("done", "strength")] },
      { date: "2026-03-03", sessions: [s("planned")] },
      { date: "2026-03-04", sessions: [s("planned", "rest")] },
      { date: "2026-03-05", sessions: [s("planned")] },
      { date: "2026-03-06", sessions: [s("planned")] },
      { date: "2026-03-07", sessions: [] },
      { date: "2026-03-08", sessions: [s("done"), s("skipped", "swim")] },
    ];
    expect(weekStrip(days, "2026-03-05")).toEqual(["done", "missed", "rest", "today", "future", "rest", "future"]);
  });

  it("counts a past day with a skipped session as missed", () => {
    expect(weekStrip([{ date: "2026-03-02", sessions: [s("done"), s("skipped", "swim")] }], "2026-03-04")).toEqual(["missed"]);
  });
});

describe("labels are Title Case", () => {
  it("phase, kind and intensity labels", () => {
    for (const v of [...Object.values(PHASE_LABEL), ...Object.values(KIND_LABEL), ...Object.values(INTENSITY_LABEL), ...Object.values(AREA_LABEL), ...Object.values(EVIDENCE_LABEL)]) {
      expect(titleCase(v), v).toBe(v);
    }
  });
});
