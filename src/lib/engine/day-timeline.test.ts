import { describe, expect, it } from "vitest";
import { ML_PER_FL_OZ } from "@/lib/engine/nutrients";
import { RULES } from "@/lib/engine/rules/catalog";
import { anchorBedtime, buildTimeline, mergeActual, supplementNote, supplementRuleIds, type TimelineInput, type TimelineItem } from "./day-timeline";

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
    const start = wake + TL.firstMealAfterWakeMin;
    const second = start + (TL.fallbackAwakeMin - TL.firstMealAfterWakeMin) / 2;
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

  it("places supplements by timing: with_meal at the first meal, morning after waking, evening before bed", () => {
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
    expect(min(items.find((i) => i.title === "Morning Supplements")!.time)).toBe(
      min(of(items, "wake")[0].time) + TL.morningSupplementsAfterWakeMin,
    );
    expect(min(supp("Magnesium").time)).toBe(min(of(items, "bedtime")[0].time) - TL.eveningSupplementsBeforeBedMin);
    expect(min(supp("Caffeine").time)).toBe(min("12:00") - RULES["supplements.evidence"].params.caffeine.minutesBefore);
    expect(min(supp("Whey").time)).toBe(min("12:00") + 90);
    expect(supp("Creatine").ruleIds).toEqual(["supplements.evidence", "supplements.creatineBrain"]);
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
    expect(supplementNote("Ashwagandha", 70)).toBeNull();
  });
});

describe("supplement evidence for every supplement", () => {
  const B = RULES["supplements.creatineBrain"].params;
  const O = RULES["supplements.omega3"].params;
  const M = RULES["supplements.magnesium"].params;
  const K = RULES["supplements.vitaminK2"].params;
  const C = RULES["supplements.collagen"].params;

  it("recognizes the usual names and spellings", () => {
    for (const n of ["Omega-3", "fish oil", "EPA/DHA"]) expect(supplementNote(n, 70), n).toContain(`${O.safeUpToG} g`);
    for (const n of ["Magnesium Glycinate", "Mg glycinate"]) expect(supplementNote(n, 70), n).toContain(`${M.supplementUlMg} mg`);
    for (const n of ["Collagen Peptides", "Collegen", "gelatin"]) expect(supplementNote(n, 70), n).toContain(`${C.peptidesGPerDay} g`);
    expect(supplementNote("Vitamin K2", 70)).toContain(`${K.aiUgMen} µg`);
  });

  it("gives both the vitamin D and K2 notes for a D3+K2 combo", () => {
    const note = supplementNote("Vitamin D3+K2", 70)!;
    expect(note).toContain(`${RULES["supplements.evidence"].params.vitaminD.ulUg} µg`);
    expect(note).toContain(`${K.aiUgMen} µg`);
  });

  it("explains a creatine amount above the muscle dose with the brain research, and the dose split", () => {
    const note = supplementNote("Creatine", 70, "10 g")!;
    expect(note).toContain(`${B.studiedGPerDay[0]}-${B.studiedGPerDay[1]} g`);
    expect(note).toContain(`${B.splitDoses} × ${B.splitDoseG} g`);
  });

  it("never endorses an amount above every sourced range", () => {
    expect(supplementNote("Creatine", 70, "30 g")).toMatch(/above every dose/i);
    expect(supplementNote("Fish oil", 70, "8 g")).toMatch(/above every dose/i);
    expect(supplementNote("Magnesium", 70, "600 mg")).toMatch(/above/i);
  });

  it("links each supplement to its own rule", () => {
    expect(supplementRuleIds("Collegen")).toEqual(["supplements.collagen"]);
    expect(supplementRuleIds("Vitamin D3+K2")).toEqual(["supplements.evidence", "supplements.vitaminK2"]);
    expect(supplementRuleIds("Creatine")).toEqual(["supplements.evidence", "supplements.creatineBrain"]);
    expect(supplementRuleIds("Ashwagandha")).toEqual([]);
  });
});

describe("buildTimeline with a set wake time", () => {
  it("starts the day at the wake time and keeps items in order, even after the first window opens", () => {
    const items = buildTimeline(input({ wakeTime: "07:00" }));
    const wake = items.find((it) => it.kind === "wake")!;
    expect(wake.time).toBe("07:00");
    const mins = items.map((it) => min(it.time));
    for (let i = 1; i < mins.length; i++) {
      if (mins[i] < mins[i - 1]) expect(items[i].kind, `item ${i} goes backwards`).toBe("bedtime");
    }
  });
});

describe("mergeActual (real workouts on the timeline)", () => {
  const it2 = (time: string, kind: TimelineItem["kind"], title: string, sport?: string): TimelineItem => ({
    time,
    kind,
    title,
    detail: kind === "session" ? "40 min" : "",
    ruleIds: kind === "session" ? ["week.template"] : [],
    ...(sport ? { sport } : {}),
  });
  const day = [it2("06:15", "wake", "Wake"), it2("07:00", "session", "Easy run", "run"), it2("12:30", "meal", "Lunch"), it2("22:15", "bedtime", "Bedtime")];

  it("moves a matching planned session to its real start, marked done, without a duplicate", () => {
    const out = mergeActual(day, [{ startHHMM: "17:40", sport: "run", title: "Running", durationMin: 35, source: "whoop" }]);
    const runs = out.filter((x) => x.kind === "session");
    expect(runs).toHaveLength(1);
    expect(runs[0].time).toBe("17:40");
    expect(runs[0].title).toBe("Easy run");
    expect(runs[0].detail).toContain("Done at 17:40");
    expect(runs[0].ruleIds).toEqual(["week.template"]);
    expect(out.map((x) => x.time)).toEqual(["06:15", "12:30", "17:40", "22:15"]);
  });

  it("adds a workout with no planned match as its own item", () => {
    const out = mergeActual(day, [{ startHHMM: "18:00", sport: "strength", title: "weightlifting", durationMin: 50, source: "whoop" }]);
    const added = out.find((x) => x.time === "18:00")!;
    expect(added.kind).toBe("session");
    expect(added.title).toBe("Weightlifting");
    expect(added.detail).toBe("From WHOOP · 50 min");
    expect(added.ruleIds).toEqual([]);
    expect(out.filter((x) => x.kind === "session")).toHaveLength(2);
  });

  it("pairs two runs with two planned runs in order", () => {
    const two = [it2("06:00", "session", "Run A", "run"), it2("12:00", "session", "Run B", "run")];
    const out = mergeActual(two, [
      { startHHMM: "06:30", sport: "run", title: "Running", durationMin: 30, source: "app" },
      { startHHMM: "17:00", sport: "run", title: "Running", durationMin: 30, source: "app" },
    ]);
    expect(out.map((x) => `${x.time} ${x.title}`)).toEqual(["06:30 Run A", "17:00 Run B"]);
  });

  it("adds a workout of unknown sport, and logged-in-app workouts say so", () => {
    const out = mergeActual(day, [{ startHHMM: "09:00", sport: null, title: "Workout", durationMin: 20, source: "app" }]);
    expect(out.find((x) => x.time === "09:00")?.detail).toBe("Logged · 20 min");
  });

  it("nudges a workout that lands on another item's minute", () => {
    const out = mergeActual(day, [{ startHHMM: "12:30", sport: "bike", title: "Cycling", durationMin: 30, source: "whoop" }]);
    expect(out.find((x) => x.title === "Cycling")?.time).toBe("12:35");
  });
});

describe("supplement notes: review fixes", () => {
  it("doesn't read a dose unit in a name as magnesium", () => {
    expect(supplementNote("Zinc 15 mg", 70)).toBeNull();
    expect(supplementNote("Vitamin C 500 mg", 70)).toBeNull();
    expect(supplementNote("Caffeine 200 mg", 70)).not.toMatch(/Magnesium/);
    expect(supplementRuleIds("Zinc 15 mg")).toEqual([]);
    expect(supplementNote("Mg glycinate", 70)).toMatch(/Magnesium/);
    expect(supplementNote("Mg", 70)).toMatch(/Magnesium/);
  });

  it("says to split into doses of 5 g or less, never implying a lower total", () => {
    const B = RULES["supplements.creatineBrain"].params;
    const note = supplementNote("Creatine", 70, "15 g")!;
    expect(note).toContain(`${B.splitDoseG} g or less`);
    expect(note).not.toMatch(/Split it as 2 × 5 g\./);
  });

  it("flags a collagen amount above the sourced range, and reads amounts with thousands separators", () => {
    expect(supplementNote("Collagen Peptides", 70, "25 g")).toMatch(/above every dose/i);
    expect(supplementNote("Collagen Peptides", 70, "10 g")).not.toMatch(/above every dose/i);
    expect(supplementNote("Fish oil", 70, "6,000 mg")).toMatch(/above every dose/i);
  });
});

describe("creatineBrain rule caveat stays within its sources", () => {
  const caveat = RULES["supplements.creatineBrain"].caveat;
  it("makes no vegetarian claim and cites the safety source the rule carries", () => {
    expect(caveat).not.toMatch(/vegetarian/i);
    expect(caveat).not.toMatch(/Kreider/);
    expect(caveat).toMatch(/Antonio 2021/);
    expect(caveat).toMatch(/clinical/i);
  });
});

describe("morning supplements", () => {
  const items = buildTimeline(
    input({
      wakeTime: "07:00",
      supplements: [
        { name: "Creatine", timing: "morning", amount: "5 g" },
        { name: "Vitamin D3+K2", timing: "morning" },
        { name: "Collagen Peptides", timing: "morning" },
        { name: "Magnesium", timing: "evening" },
      ],
    }),
  );
  const morning = items.filter((i) => i.kind === "supplement" && i.title === "Morning Supplements");

  it("merge into one item, 10 min after waking", () => {
    expect(morning).toHaveLength(1);
    expect(morning[0].time).toBe("07:10");
  });

  it("list each supplement with its amount, and link every rule once", () => {
    expect(morning[0].detail).toContain("Creatine (5 g)");
    expect(morning[0].detail).toContain("Vitamin D3+K2");
    expect(morning[0].detail).toContain("Collagen Peptides");
    expect(morning[0].ruleIds).toEqual([
      "supplements.evidence",
      "supplements.creatineBrain",
      "supplements.vitaminK2",
      "supplements.collagen",
    ]);
  });

  it("leave supplements at other times as their own items", () => {
    expect(items.some((i) => i.kind === "supplement" && i.title === "Magnesium")).toBe(true);
    expect(items.some((i) => i.kind === "supplement" && i.title === "Creatine")).toBe(false);
  });
});

describe("breakfast and evening supplement timing", () => {
  const items = buildTimeline(
    input({
      wakeTime: "07:00",
      sessions: [],
      sleepNeedMin: 480,
      supplements: [{ name: "Magnesium Glycinate", timing: "evening" }],
    }),
  );

  it("puts breakfast 20 min after waking", () => {
    expect(of(items, "meal")[0].time).toBe("07:20");
  });

  it("puts evening supplements an hour before bedtime", () => {
    const bed = min(of(items, "bedtime")[0].time);
    const mag = items.find((i) => i.kind === "supplement" && i.title === "Magnesium Glycinate")!;
    expect(min(mag.time)).toBe(bed - TL.eveningSupplementsBeforeBedMin);
    expect(TL.eveningSupplementsBeforeBedMin).toBe(60);
    expect(mag.detail).toMatch(/hour before bed/i);
  });
});

describe("anchor bedtime", () => {
  const A = RULES["recovery.anchorBedtime"].params;

  it("is the average baseline need plus time awake in bed, moved earlier for extra need up to the cap", () => {
    expect(anchorBedtime({ baselineMin: 480, bufferMin: 30, extraMin: 0 })).toEqual({ inBedMin: 510, earlierMin: 0 });
    expect(anchorBedtime({ baselineMin: 480, bufferMin: 30, extraMin: 20 })).toEqual({ inBedMin: 530, earlierMin: 20 });
    expect(anchorBedtime({ baselineMin: 480, bufferMin: 30, extraMin: 200 })).toEqual({ inBedMin: 510 + A.maxEarlierMin, earlierMin: A.maxEarlierMin });
  });

  it("never moves later than the anchor", () => {
    expect(anchorBedtime({ baselineMin: 480, bufferMin: 30, extraMin: -45 }).earlierMin).toBe(0);
  });

  it("drives the timeline's bedtime, rounded to 5 min, and says when it moved earlier", () => {
    const steady = buildTimeline(input({ wakeTime: "07:00", sleepNeedMin: 600, bedtime: { inBedMin: 510, earlierMin: 0 } }));
    const bed = of(steady, "bedtime")[0];
    expect(bed.time).toBe("22:30");
    expect(bed.detail).toMatch(/steady bedtime/i);
    expect(bed.ruleIds).toEqual(["recovery.anchorBedtime", "recovery.sleepDebt"]);

    const earlier = of(buildTimeline(input({ wakeTime: "07:00", bedtime: { inBedMin: 532, earlierMin: 22 } })), "bedtime")[0];
    expect(earlier.time).toBe("22:10");
    expect(earlier.detail).toMatch(/22 min earlier/);
  });
});

describe("morning light and quiet time", () => {
  const L = RULES["recovery.morningLight"].params;
  const items = buildTimeline(
    input({ wakeTime: "07:00", sessions: [], supplements: [{ name: "Creatine", timing: "morning" }] }),
  );
  const light = items.find((i) => i.kind === "routine")!;

  it("comes after the morning supplements and before breakfast", () => {
    expect(light.time).toBe("07:15");
    expect(min(light.time)).toBe(min("07:00") + TL.morningLightAfterWakeMin);
    const supp = items.find((i) => i.title === "Morning Supplements")!;
    expect(min(supp.time)).toBeLessThan(min(light.time));
    expect(min(light.time)).toBeLessThan(min(of(items, "meal")[0].time));
  });

  it("names the lamp dose, quiet time and breakfast in front of the light, with its rule", () => {
    expect(light.title).toBe("Morning Light and Quiet Time");
    expect(light.detail).toContain(`${L.lampMin} min`);
    expect(light.detail).toMatch(/quiet time/i);
    expect(light.detail).toMatch(/breakfast/i);
    expect(light.ruleIds).toEqual(["recovery.morningLight"]);
  });
});
