import { describe, expect, it } from "vitest";
import { ML_PER_FL_OZ } from "@/lib/engine/nutrients";
import { RULES } from "@/lib/engine/rules/catalog";
import { buildTimeline, supplementNote, type TimelineInput, type TimelineItem } from "./day-timeline";

// All values below are invented test data.
const TL = RULES["nutrition.timeline"].params;
const PRE = RULES["nutrition.preWorkout"].params;
const POST = RULES["nutrition.postWorkout"].params;
const PPM = RULES["nutrition.proteinPerMeal"].params;

const min = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

function input(over: Partial<TimelineInput> = {}): TimelineInput {
  return {
    windows: [
      { start: "06:00", end: "09:00" },
      { start: "12:00", end: "13:30" },
    ],
    sessions: [],
    mealsPerDay: 4,
    supplements: [],
    proteinG: 140,
    carbsG: 350,
    weightKg: 70,
    sleepNeedMin: 480,
    ...over,
  };
}

const of = (items: TimelineItem[], kind: TimelineItem["kind"]) => items.filter((i) => i.kind === kind);

describe("buildTimeline", () => {
  it("wakes the catalog offset before the first window", () => {
    const items = buildTimeline(input());
    const [wake] = of(items, "wake");
    expect(min(wake.time)).toBe(min("06:00") - TL.wakeBeforeWindowMin);
    expect(wake.ruleIds).toContain("nutrition.timeline");
  });

  it("morning 75-min run at 06:00: the snack would fall before wake, so it moves after wake and shrinks", () => {
    const items = buildTimeline(input({ sessions: [{ title: "Easy run", kind: "run", durationMin: 75, window: 0, intensity: "z2" }] }));
    const [run] = of(items, "session");
    expect(run.time).toBe("06:00");
    const snack = of(items, "snack").find((s) => s.ruleIds.includes("nutrition.preWorkout"));
    expect(snack).toBeDefined();
    const wake = min(of(items, "wake")[0].time);
    expect(min(snack!.time)).toBe(wake + TL.snackAfterWakeMin);
    expect(snack!.carbsG).toBe(Math.round(PRE.carbsGPerKg[0] * 70));
    expect(snack!.ruleIds).toContain("nutrition.timeline");
    expect(snack!.detail).toMatch(/small snack/i);
  });

  it("morning 75-min run with an early wake: a full snack 60-90 min before (04:30-05:00)", () => {
    const items = buildTimeline(
      input({ wakeTime: "04:00", sessions: [{ title: "Easy run", kind: "run", durationMin: 75, window: 0, intensity: "z2" }] }),
    );
    const snack = of(items, "snack").find((s) => s.ruleIds.includes("nutrition.preWorkout"))!;
    expect(min(snack.time)).toBeGreaterThanOrEqual(min("04:30"));
    expect(min(snack.time)).toBeLessThanOrEqual(min("05:00"));
    expect(snack.carbsG).toBe(Math.round(((PRE.carbsGPerKg[0] + PRE.carbsGPerKg[1]) / 2) * 70));
    expect(snack.ruleIds).not.toContain("nutrition.timeline");
  });

  it("swim at 12:00: no meal between 10:30 and 12:00", () => {
    for (const mealsPerDay of [3, 4, 5, 6]) {
      const items = buildTimeline(
        input({ mealsPerDay, sessions: [{ title: "Swim", kind: "swim", durationMin: 60, window: 1, intensity: "z2" }] }),
      );
      expect(of(items, "session")[0].time).toBe("12:00");
      const meals = of(items, "meal");
      expect(meals).toHaveLength(mealsPerDay);
      for (const m of meals) {
        const t = min(m.time);
        expect(t >= min("12:00") - PRE.swimNoHeavyMealMin && t < min("12:00")).toBe(false);
      }
    }
  });

  it("4 meals, each with protein at least gPerKgPerMeal x weight, even when the day's protein is low", () => {
    const items = buildTimeline(input({ weightKg: 80, proteinG: 100 }));
    const meals = of(items, "meal");
    expect(meals).toHaveLength(4);
    for (const m of meals) expect(m.proteinG!).toBeGreaterThanOrEqual(PPM.gPerKgPerMeal * 80);
  });

  it("spreads the remaining protein evenly across meals", () => {
    const items = buildTimeline(input({ weightKg: 70, proteinG: 160 }));
    const meals = of(items, "meal");
    expect(meals.map((m) => m.proteinG)).toEqual([40, 40, 40, 40]);
  });

  it("post-workout: carbs and protein within withinHours after the session", () => {
    const items = buildTimeline(input({ sessions: [{ title: "Ride", kind: "bike", durationMin: 90, window: 1, intensity: "z2" }] }));
    const end = min("12:00") + 90;
    const post = items.find((i) => i.ruleIds.includes("nutrition.postWorkout"))!;
    expect(post).toBeDefined();
    expect(min(post.time)).toBeGreaterThanOrEqual(end);
    expect(min(post.time)).toBeLessThanOrEqual(end + POST.withinHours * 60);
    expect(post.detail).toContain(`${Math.round(POST.carbsGPerKg * 70)} g carbs`);
    expect(post.detail).toContain(`${Math.round(POST.proteinGPerKg * 70)} g protein`);
  });

  it("bedtime is wake + 24 h - the WHOOP sleep need", () => {
    const items = buildTimeline(input({ sleepNeedMin: 480 }));
    const [bed] = of(items, "bedtime");
    const wake = min(of(items, "wake")[0].time);
    expect(min(bed.time)).toBe(wake + 24 * 60 - 480);
    expect(items[items.length - 1].kind).toBe("bedtime");
  });

  it("bedtime says the need is from last night's WHOOP sleep", () => {
    const [bed] = of(buildTimeline(input({ sleepNeedMin: 495 })), "bedtime");
    expect(bed.detail).toBe("Based on last night's WHOOP sleep need of 8 h 15 min.");
  });

  it("without a sleep need, meals spread over the catalog's fallback awake day", () => {
    const items = buildTimeline(input({ sleepNeedMin: null, mealsPerDay: 2 }));
    const wake = min(of(items, "wake")[0].time);
    const start = wake + TL.snackAfterWakeMin;
    const second = start + (TL.fallbackAwakeMin - TL.snackAfterWakeMin) / 2;
    expect(min(of(items, "meal")[1].time)).toBe(Math.round(second / 5) * 5);
  });

  it("a session with during-session fluid says how many oz to drink", () => {
    const items = buildTimeline(
      input({ sessions: [{ title: "Ride", kind: "bike", durationMin: 90, window: 1, intensity: "z2", duringMl: 20 * ML_PER_FL_OZ }] }),
    );
    expect(of(items, "session")[0].detail).toBe("90 min. Drink ~20 oz during.");
    expect(of(items, "session")[0].ruleIds).toContain("hydration.exercise");
  });

  it("a session without during-session fluid keeps the plain duration", () => {
    const items = buildTimeline(input({ sessions: [{ title: "Lift", kind: "strength", durationMin: 50, window: 0, intensity: "strength" }] }));
    expect(of(items, "session")[0].detail).toBe("50 min");
    expect(of(items, "session")[0].ruleIds).not.toContain("hydration.exercise");
  });

  it("a null sleep need gives no bedtime item, but meals still appear", () => {
    const items = buildTimeline(input({ sleepNeedMin: null }));
    expect(of(items, "bedtime")).toHaveLength(0);
    expect(of(items, "meal")).toHaveLength(4);
  });

  it("sessions without a window index go to the first window; same-window sessions run back to back", () => {
    const items = buildTimeline(
      input({
        sessions: [
          { title: "Lift", kind: "strength", durationMin: 50, intensity: "strength" },
          { title: "Core", kind: "core", durationMin: 15, window: 0, intensity: "easy" },
        ],
      }),
    );
    expect(of(items, "session").map((s) => s.time)).toEqual(["06:00", "06:50"]);
  });

  it("is sorted, and no two non-supplement items share a minute", () => {
    const items = buildTimeline(
      input({
        mealsPerDay: 6,
        supplements: [
          { name: "Creatine", timing: "with_meal" },
          { name: "Vitamin D", timing: "morning" },
          { name: "Caffeine", timing: "pre_workout" },
          { name: "Protein", timing: "post_workout" },
          { name: "Magnesium", timing: "evening" },
        ],
        sessions: [
          { title: "Run", kind: "run", durationMin: 75, window: 0, intensity: "z2" },
          { title: "Swim", kind: "swim", durationMin: 60, window: 1, intensity: "z2" },
        ],
      }),
    );
    const mins = items.map((i) => min(i.time) + (i.kind === "bedtime" && min(i.time) < min(items[0].time) ? 1440 : 0));
    expect([...mins].sort((a, b) => a - b)).toEqual(mins);
    const nonSupp = items.filter((i) => i.kind !== "supplement").map((i) => i.time);
    expect(new Set(nonSupp).size).toBe(nonSupp.length);
    for (const i of items) expect(i.ruleIds.length).toBeGreaterThan(0);
  });

  it("re-checks the swim no-meal zone after the collision nudge", () => {
    // Wake 06:00, bed 22:00, 5 meals: 06:10, 09:20, 12:30, 15:40, 18:50. Meal 1 sits in the long
    // run and moves to its end (09:20), on top of meal 2; the nudge then pushes one of them to
    // 09:25, the first minute of the swim's no-meal zone (10:55 − 90 min).
    const items = buildTimeline(
      input({
        wakeTime: "06:00",
        mealsPerDay: 5,
        windows: [
          { start: "06:10", end: "09:30" },
          { start: "10:55", end: "12:00" },
        ],
        sessions: [
          { title: "Long run", kind: "run", durationMin: 190, window: 0, intensity: "z2" },
          { title: "Swim", kind: "swim", durationMin: 30, window: 1, intensity: "z2" },
        ],
      }),
    );
    const swimStart = min("10:55");
    const meals = of(items, "meal");
    expect(meals).toHaveLength(5);
    for (const m of meals) {
      const t = min(m.time);
      expect(t >= swimStart - PRE.swimNoHeavyMealMin && t < swimStart + 30, `${m.title} at ${m.time}`).toBe(false);
    }
    const nonSupp = items.filter((i) => i.kind !== "supplement").map((i) => i.time);
    expect(new Set(nonSupp).size).toBe(nonSupp.length);
  });

  it("a meal whose move would land within snackAfterWakeMin of bedtime moves before the session's zone instead", () => {
    // Bed 22:00. The 18:50 meal falls in the evening run's pre-workout zone (18:00-21:55);
    // moving it to the run's end (21:55) would put it after bedtime − snackAfterWakeMin.
    const items = buildTimeline(
      input({
        wakeTime: "06:00",
        mealsPerDay: 5,
        windows: [
          { start: "06:00", end: "09:00" },
          { start: "19:00", end: "22:00" },
        ],
        sessions: [{ title: "Evening run", kind: "run", durationMin: 175, window: 1, intensity: "z2" }],
      }),
    );
    const bed = min("22:00");
    expect(of(items, "bedtime")[0].time).toBe("22:00");
    const meals = of(items, "meal");
    expect(meals).toHaveLength(5);
    for (const m of meals) expect(min(m.time), `${m.title} at ${m.time}`).toBeLessThanOrEqual(bed - TL.snackAfterWakeMin);
    const last = meals[meals.length - 1];
    expect(min(last.time)).toBeLessThan(min("19:00") - PRE.hoursBefore[0] * 60);
    expect(last.detail).toMatch(/before Evening run.*bedtime/i);
  });

  it("never leaves a meal inside a session when the move after it would pass bedtime", () => {
    for (const [start, durationMin] of [
      ["18:00", 240],
      ["18:40", 200],
      ["17:00", 300],
    ] as const) {
      for (const kind of ["run", "swim"]) {
        const items = buildTimeline(
          input({
            wakeTime: "06:00",
            mealsPerDay: 5,
            windows: [
              { start: "06:00", end: "09:00" },
              { start, end: "23:00" },
            ],
            sessions: [{ title: "Evening", kind, durationMin, window: 1, intensity: "z2" }],
          }),
        );
        const s0 = min(start);
        const zone = kind === "swim" ? Math.max(PRE.swimNoHeavyMealMin, PRE.hoursBefore[0] * 60) : 0;
        const meals = of(items, "meal");
        expect(meals.length, `${kind} ${start}/${durationMin}`).toBeGreaterThan(0);
        for (const m of meals) {
          const t = min(m.time);
          const label = `${kind} ${start}/${durationMin}: ${m.title} ${m.time}`;
          expect(t >= s0 - zone && t < s0 + durationMin, label).toBe(false);
          expect(m.detail, label).not.toMatch(/Kept before/);
        }
      }
    }
  });

  it("drops a meal with no slot outside training before bedtime, and says so", () => {
    // Training 06:10-21:55 leaves no time for meals between wake and bedtime − snackAfterWakeMin
    // except right after wake, before the first session's zone.
    const items = buildTimeline(
      input({
        wakeTime: "04:00",
        mealsPerDay: 3,
        windows: [{ start: "06:00", end: "23:00" }],
        sessions: [{ title: "Ultra", kind: "run", durationMin: 955, window: 0, intensity: "z2" }],
      }),
    );
    const meals = of(items, "meal");
    for (const m of meals) expect(min(m.time)).toBeLessThan(min("06:00"));
    expect(meals.length).toBeLessThan(3);
    expect(meals.some((m) => /left out/i.test(m.detail))).toBe(true);
  });

  it("a meal nudged into a late swim's zone, with no way out before bedtime, leaves no meal in the zone", () => {
    // Slots 06:10, 09:20, 12:30, 15:40, 18:50. The 15:40 meal moves to the run's end (18:50), on
    // top of meal 5; the nudge pushes one to 18:55, the start of the 20:25 swim's 90-min zone.
    // Moving after the swim (21:55) passes bedtime − snackAfterWakeMin (21:50).
    const items = buildTimeline(
      input({
        wakeTime: "06:00",
        mealsPerDay: 5,
        windows: [
          { start: "15:40", end: "19:00" },
          { start: "20:25", end: "22:00" },
        ],
        sessions: [
          { title: "Run", kind: "run", durationMin: 190, window: 0, intensity: "z2" },
          { title: "Swim", kind: "swim", durationMin: 90, window: 1, intensity: "z2" },
        ],
      }),
    );
    const swimStart = min("20:25");
    for (const m of of(items, "meal")) {
      const t = min(m.time);
      expect(t >= swimStart - PRE.swimNoHeavyMealMin && t < swimStart + 90, `${m.title} at ${m.time}`).toBe(false);
      expect(t).toBeLessThanOrEqual(min("22:00") - TL.snackAfterWakeMin);
    }
    expect(of(items, "meal").some((m) => /left out|before Swim/i.test(m.detail))).toBe(true);
  });

  it("bedtime shares its minute with a recovery snack instead of moving", () => {
    // Run 19:00-22:00 ends at bedtime: its recovery snack is at 22:00.
    const items = buildTimeline(
      input({
        wakeTime: "06:00",
        mealsPerDay: 5,
        windows: [
          { start: "06:00", end: "09:00" },
          { start: "19:00", end: "22:00" },
        ],
        sessions: [{ title: "Evening run", kind: "run", durationMin: 180, window: 1, intensity: "z2" }],
      }),
    );
    expect(of(items, "bedtime")[0].time).toBe("22:00");
    expect(of(items, "snack").some((s) => s.title === "Recovery snack" && s.time === "22:00")).toBe(true);
  });

  it("never moves a meal past bedtime, over many evening sessions", () => {
    for (let startMin = min("16:00"); startMin <= min("21:30"); startMin += 5) {
      for (const durationMin of [30, 60, 90, 120, 180]) {
        for (const kind of ["run", "swim"]) {
          const start = `${String(Math.floor(startMin / 60)).padStart(2, "0")}:${String(startMin % 60).padStart(2, "0")}`;
          const items = buildTimeline(
            input({
              wakeTime: "06:00",
              mealsPerDay: 5,
              windows: [
                { start: "06:00", end: "09:00" },
                { start, end: "23:00" },
              ],
              sessions: [{ title: "Evening", kind, durationMin, window: 1, intensity: "z2" }],
            }),
          );
          for (const m of of(items, "meal")) {
            expect(min(m.time), `${kind} ${durationMin} at ${start}: ${m.title} ${m.time}`).toBeLessThanOrEqual(min("22:00") - TL.snackAfterWakeMin);
          }
        }
      }
    }
  });

  it("places supplements by timing: with_meal at the first meal, morning at wake, evening at bedtime", () => {
    const items = buildTimeline(
      input({
        supplements: [
          { name: "Creatine", timing: "with_meal" },
          { name: "Vitamin D", timing: "morning" },
          { name: "Magnesium", timing: "evening" },
          { name: "Caffeine", timing: "pre_workout" },
          { name: "Whey", timing: "post_workout" },
        ],
        sessions: [{ title: "Ride", kind: "bike", durationMin: 90, window: 1, intensity: "z2" }],
      }),
    );
    const supp = (name: string) => items.find((i) => i.kind === "supplement" && i.title === name)!;
    expect(supp("Creatine").time).toBe(of(items, "meal")[0].time);
    expect(supp("Vitamin D").time).toBe(of(items, "wake")[0].time);
    expect(supp("Magnesium").time).toBe(of(items, "bedtime")[0].time);
    expect(min(supp("Caffeine").time)).toBe(min("12:00") - RULES["supplements.evidence"].params.caffeine.minutesBefore);
    expect(min(supp("Whey").time)).toBe(min("12:00") + 90);
    expect(supp("Creatine").ruleIds).toEqual(["supplements.evidence"]);
  });

  it("pre- and post-workout supplements are skipped on a day with no sessions", () => {
    const items = buildTimeline(input({ supplements: [{ name: "Caffeine", timing: "pre_workout" }] }));
    expect(of(items, "supplement")).toHaveLength(0);
  });

  it("without a weight or targets, still builds the times and omits the amounts", () => {
    const items = buildTimeline(
      input({ weightKg: null, proteinG: null, carbsG: null, sessions: [{ title: "Run", kind: "run", durationMin: 75, window: 1, intensity: "z2" }] }),
    );
    expect(of(items, "meal")).toHaveLength(4);
    expect(of(items, "meal").every((m) => m.proteinG === undefined)).toBe(true);
    expect(of(items, "snack").length).toBeGreaterThan(0);
  });
});

describe("supplementNote", () => {
  it("gives the catalog dose for known supplements and null for unknown ones", () => {
    const s = RULES["supplements.evidence"].params;
    expect(supplementNote("Creatine monohydrate", 70)).toContain(`${s.creatine.gPerDay[0]}-${s.creatine.gPerDay[1]} g a day`);
    expect(supplementNote("caffeine", 70)).toContain(`${s.caffeine.mgPerKg[0] * 70}-${s.caffeine.mgPerKg[1] * 70} mg`);
    expect(supplementNote("Vitamin D3", null)).toContain(`${s.vitaminD.ulUg}`);
    expect(supplementNote("Fish oil", 70)).toBeNull();
  });
});
