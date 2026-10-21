/**
 * The Day tab's timeline: when to wake, eat, train, take supplements and go to bed. Pure: every
 * input is a parameter and every threshold is a rule param. No DB, no clock.
 *
 * Placement:
 * - Wake: `wakeTime` when given, else the first window's start minus wakeBeforeWindowMin.
 * - Sessions: grouped by window index (a missing or unknown index means the first window); each
 *   group starts at its window's start and its sessions run back to back.
 * - Pre-workout snack: for a group with a session of at least minSessionMin, hoursBefore[0] h
 *   before (or swimNoHeavyMealMin before a swim, if longer), with the midpoint of carbsGPerKg.
 *   If that is earlier than wake + snackAfterWakeMin, it moves there and drops to the low carb
 *   bound (nutrition.timeline); if even that is not before the session, there is no snack.
 * - Meals: mealsPerDay slots spread evenly from wake + snackAfterWakeMin to bedtime. A meal that
 *   falls in a group's no-meal zone (the session itself, the snack lead time before a fuelled
 *   group, swimNoHeavyMealMin before a swim) moves to the group's end.
 * - Post-workout: the first meal within withinHours after a group becomes its recovery meal;
 *   otherwise a recovery snack is placed at the group's end.
 * - Protein: the day's protein minus recovery snacks, split evenly across meals, each at least
 *   gPerKgPerMeal × weightKg. Carbs: the day's carbs minus snacks, split evenly.
 * - Bedtime: wake + 24 h − sleepNeedMin, only when the WHOOP need (from last night's sleep) is
 *   known. Without it, meals are spaced over fallbackAwakeMin (nutrition.timeline).
 * - Sessions with a positive duringMl say how many oz to drink during them (hydration.exercise).
 * - Supplements: morning at wake, with_meal at the first meal, pre_workout caffeine's
 *   minutesBefore the first group (not before wake), post_workout at the first group's end,
 *   evening at bedtime (else the last meal). Pre/post-workout ones are left out on a day with no
 *   sessions.
 */
import { ML_PER_FL_OZ } from "@/lib/engine/nutrients";
import { RULES, type RuleId } from "@/lib/engine/rules/catalog";

export type TimelineKind = "wake" | "supplement" | "meal" | "snack" | "session" | "bedtime";

export type TimelineItem = {
  /** "HH:MM", local clock (an item after midnight wraps). */
  time: string;
  kind: TimelineKind;
  title: string;
  detail: string;
  ruleIds: RuleId[];
  proteinG?: number;
  carbsG?: number;
};

export type SupplementTiming = "morning" | "with_meal" | "pre_workout" | "post_workout" | "evening";

export type TimelineInput = {
  windows: readonly { start: string; end: string }[];
  /** `duringMl`: fluid to drink during the session (hydration.exercise), shown in oz when positive. */
  sessions: readonly { title: string; kind: string; durationMin: number; window?: number; intensity: string; duringMl?: number }[];
  mealsPerDay: number;
  supplements: readonly { name: string; timing: SupplementTiming }[];
  /** Day targets; null when unknown (amounts are then left out). */
  proteinG: number | null;
  carbsG: number | null;
  weightKg: number | null;
  /** WHOOP sleep need (min); null means no bedtime item. */
  sleepNeedMin: number | null;
  wakeTime?: string;
};

// Calendar facts and the display grid, not tunable thresholds.
const MIN_PER_HOUR = 60;
const MIN_PER_DAY = 24 * MIN_PER_HOUR;
/** Collision rule (Task 8 ruling): when two non-supplement items share a minute, the later one moves +5 min. */
const NUDGE_MIN = 5;
/** Meal times are rounded to the same 5-min grid. */
const ROUND_MIN = NUDGE_MIN;

/** Tie order at the same minute: supplements follow their anchor and precede bedtime. */
const KIND_ORDER: Record<TimelineKind, number> = { wake: 0, session: 1, meal: 2, snack: 3, supplement: 4, bedtime: 5 };

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * MIN_PER_HOUR + m;
};
const fmt = (m: number) => {
  const x = ((Math.round(m) % MIN_PER_DAY) + MIN_PER_DAY) % MIN_PER_DAY;
  return `${String(Math.floor(x / MIN_PER_HOUR)).padStart(2, "0")}:${String(x % MIN_PER_HOUR).padStart(2, "0")}`;
};
const round5 = (m: number) => Math.round(m / ROUND_MIN) * ROUND_MIN;
const known = (x: number | null): x is number => x !== null && Number.isFinite(x) && x > 0;

type Draft = Omit<TimelineItem, "time"> & { at: number };

type Group = { start: number; end: number; titles: string[]; swim: boolean; fuel: boolean; zoneStart: number };

/** The evidence note for a supplement the catalog covers, else null. */
export function supplementNote(name: string, weightKg: number | null): string | null {
  const p = RULES["supplements.evidence"].params;
  const n = name.toLowerCase();
  if (n.includes("creatin")) return `Creatine monohydrate: ${p.creatine.gPerDay[0]}-${p.creatine.gPerDay[1]} g a day.`;
  if (n.includes("caffein") || n.includes("coffee")) {
    const forYou = known(weightKg)
      ? ` (${Math.round(p.caffeine.mgPerKg[0] * weightKg)}-${Math.round(p.caffeine.mgPerKg[1] * weightKg)} mg for you)`
      : "";
    return `Caffeine: ${p.caffeine.mgPerKg[0]}-${p.caffeine.mgPerKg[1]} mg/kg${forYou}, about ${p.caffeine.minutesBefore} min before key sessions.`;
  }
  if (/vitamin\s*d|vit\.?\s*d|\bd3\b/.test(n)) {
    return `Vitamin D: dose only from a blood test with your doctor. RDA ${p.vitaminD.rdaUg} µg, upper limit ${p.vitaminD.ulUg} µg a day.`;
  }
  return null;
}

export function buildTimeline(i: TimelineInput): TimelineItem[] {
  const TL = RULES["nutrition.timeline"].params;
  const PRE = RULES["nutrition.preWorkout"].params;
  const POST = RULES["nutrition.postWorkout"].params;
  const PPM = RULES["nutrition.proteinPerMeal"].params;
  const SUP = RULES["supplements.evidence"].params;
  if (!i.windows.length) throw new RangeError("At least one training window is needed.");

  const kg = known(i.weightKg) ? i.weightKg : null;
  const drafts: Draft[] = [];

  // Wake.
  const wake = i.wakeTime ? toMin(i.wakeTime) : toMin(i.windows[0].start) - TL.wakeBeforeWindowMin;
  drafts.push({
    at: wake,
    kind: "wake",
    title: "Wake up",
    detail: i.wakeTime ? "Your set wake time." : `${TL.wakeBeforeWindowMin} min before your first training window.`,
    ruleIds: ["nutrition.timeline"],
  });
  const earliestFood = wake + TL.snackAfterWakeMin;

  // Sessions, grouped by window.
  const leadMin = PRE.hoursBefore[0] * MIN_PER_HOUR;
  const groups: Group[] = [];
  i.windows.forEach((w, wi) => {
    const ss = i.sessions.filter((s) => {
      const idx = Number.isInteger(s.window) && (s.window as number) >= 0 && (s.window as number) < i.windows.length ? (s.window as number) : 0;
      return idx === wi;
    });
    if (!ss.length) return;
    const start = toMin(w.start);
    let cursor = start;
    for (const s of ss) {
      const drinkOz = known(s.duringMl ?? null) ? Math.round((s.duringMl as number) / ML_PER_FL_OZ) : 0;
      drafts.push({
        at: cursor,
        kind: "session",
        title: s.title,
        detail: drinkOz > 0 ? `${s.durationMin} min. Drink ~${drinkOz} oz during.` : `${s.durationMin} min`,
        ruleIds: drinkOz > 0 ? ["week.template", "hydration.exercise"] : ["week.template"],
      });
      cursor += s.durationMin;
    }
    const swim = ss.some((s) => s.kind === "swim");
    const fuel = ss.some((s) => s.durationMin >= PRE.minSessionMin);
    const zoneStart = start - Math.max(fuel ? leadMin : 0, swim ? PRE.swimNoHeavyMealMin : 0);
    groups.push({ start, end: cursor, titles: ss.map((s) => s.title), swim, fuel, zoneStart });
  });

  // Bedtime.
  const bed = known(i.sleepNeedMin) ? wake + MIN_PER_DAY - i.sleepNeedMin : null;
  if (bed !== null) {
    drafts.push({
      at: bed,
      kind: "bedtime",
      title: "Bedtime",
      detail: `Based on last night's WHOOP sleep need of ${Math.floor((i.sleepNeedMin as number) / MIN_PER_HOUR)} h ${Math.round((i.sleepNeedMin as number) % MIN_PER_HOUR)} min.`,
      ruleIds: ["recovery.sleepDebt"],
    });
  }

  // Pre-workout snacks.
  let snackCarbs = 0;
  for (const g of groups) {
    if (!g.fuel) continue;
    const ideal = g.zoneStart;
    const shifted = ideal < earliestFood;
    const at = shifted ? earliestFood : ideal;
    if (at >= g.start) continue;
    const perKg = shifted ? PRE.carbsGPerKg[0] : (PRE.carbsGPerKg[0] + PRE.carbsGPerKg[1]) / 2;
    const carbs = kg !== null ? Math.round(perKg * kg) : undefined;
    if (carbs !== undefined) snackCarbs += carbs;
    const amount = carbs !== undefined ? `${carbs} g carbs` : "carbs";
    const before = `${g.titles[0]} at ${fmt(g.start)}`;
    drafts.push({
      at,
      kind: "snack",
      title: shifted ? "Small pre-workout snack" : "Pre-workout snack",
      detail: shifted
        ? `Small snack, ${amount}, ${g.start - at} min before ${before}: the usual ${PRE.hoursBefore[0]}-${PRE.hoursBefore[1]} h lead would be before you wake, so it is later and smaller.`
        : `${amount}, ${(g.start - at) / MIN_PER_HOUR} h before ${before}.${g.swim ? ` No heavy meal in the last ${PRE.swimNoHeavyMealMin} min before a swim.` : ""}`,
      ruleIds: shifted ? ["nutrition.preWorkout", "nutrition.timeline"] : ["nutrition.preWorkout"],
      ...(carbs !== undefined ? { carbsG: carbs } : {}),
    });
  }

  // Meal slots.
  const n = Math.max(1, Math.floor(i.mealsPerDay));
  const dayEnd = bed ?? wake + TL.fallbackAwakeMin;
  const spacing = (dayEnd - earliestFood) / n;
  const meals = Array.from({ length: n }, (_, k) => ({ at: round5(earliestFood + k * spacing), moved: null as Group | null }));
  // Move meals out of no-meal zones; a second pass catches a move into a later group's zone.
  for (let pass = 0; pass < groups.length + 1; pass++) {
    for (const m of meals) {
      const g = groups.find((x) => m.at >= x.zoneStart && m.at < x.end);
      if (g) {
        m.at = g.end;
        m.moved = g;
      }
    }
  }
  meals.sort((a, b) => a.at - b.at);

  // Post-workout: a meal within withinHours after, else a recovery snack.
  const postCarbs = kg !== null ? Math.round(POST.carbsGPerKg * kg) : undefined;
  const postProtein = kg !== null ? Math.round(POST.proteinGPerKg * kg) : undefined;
  const recoveryText = (g: Group) =>
    `${postCarbs !== undefined ? `${postCarbs} g carbs and ${postProtein} g protein` : "Carbs and protein"} within ${POST.withinHours} h after ${g.titles[g.titles.length - 1]}.`;
  const recoveryOf = new Map<number, Group>();
  let postSnackCarbs = 0;
  let postSnackProtein = 0;
  for (const g of groups) {
    const k = meals.findIndex((m, idx) => !recoveryOf.has(idx) && m.at >= g.end && m.at <= g.end + POST.withinHours * MIN_PER_HOUR);
    if (k >= 0) {
      recoveryOf.set(k, g);
      continue;
    }
    if (postCarbs !== undefined) postSnackCarbs += postCarbs;
    if (postProtein !== undefined) postSnackProtein += postProtein;
    drafts.push({
      at: g.end,
      kind: "snack",
      title: "Recovery snack",
      detail: recoveryText(g),
      ruleIds: ["nutrition.postWorkout"],
      ...(postCarbs !== undefined ? { carbsG: postCarbs, proteinG: postProtein } : {}),
    });
  }

  // Meal amounts.
  const minProtein = kg !== null ? Math.ceil(PPM.gPerKgPerMeal * kg) : null;
  const evenProtein = known(i.proteinG) ? Math.round((i.proteinG - postSnackProtein) / n) : null;
  const perMealProtein = minProtein !== null && evenProtein !== null ? Math.max(evenProtein, minProtein) : (evenProtein ?? minProtein);
  const raised = minProtein !== null && evenProtein !== null && evenProtein < minProtein;
  const perMealCarbs = known(i.carbsG) ? Math.max(0, Math.round((i.carbsG - snackCarbs - postSnackCarbs) / n)) : null;

  meals.forEach((m, k) => {
    const g = recoveryOf.get(k);
    const protein = perMealProtein !== null ? Math.max(perMealProtein, g && postProtein !== undefined ? postProtein : 0) : null;
    const carbs = perMealCarbs !== null ? Math.max(perMealCarbs, g && postCarbs !== undefined ? postCarbs : 0) : null;
    const parts: string[] = [];
    parts.push(
      protein !== null || carbs !== null
        ? [protein !== null ? `${protein} g protein` : null, carbs !== null ? `${carbs} g carbs` : null].filter(Boolean).join(", ") + "."
        : "Log a weight to see amounts.",
    );
    if (raised) parts.push(`Each meal has at least ${PPM.gPerKgPerMeal} g/kg of protein.`);
    if (g) parts.push(`Recovery: ${recoveryText(g)}`);
    if (m.moved && m.moved !== g) parts.push(`Moved after ${m.moved.titles[m.moved.titles.length - 1]}.`);
    const ruleIds: RuleId[] = ["nutrition.proteinPerMeal"];
    if (m.moved) ruleIds.push("nutrition.preWorkout");
    if (g) ruleIds.push("nutrition.postWorkout");
    drafts.push({
      at: m.at,
      kind: "meal",
      title: `Meal ${k + 1}`,
      detail: parts.join(" "),
      ruleIds,
      ...(protein !== null ? { proteinG: protein } : {}),
      ...(carbs !== null ? { carbsG: carbs } : {}),
    });
  });

  // Order, then the collision rule: a later non-supplement item sharing a minute moves +NUDGE_MIN.
  drafts.sort((a, b) => a.at - b.at || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  for (let k = 1; k < drafts.length; k++) {
    if (drafts[k].at <= drafts[k - 1].at) drafts[k].at = drafts[k - 1].at + NUDGE_MIN;
  }

  // Supplements, anchored to the final times; they may share a minute.
  const firstMeal = drafts.find((d) => d.kind === "meal");
  const lastMeal = [...drafts].reverse().find((d) => d.kind === "meal");
  const bedDraft = drafts.find((d) => d.kind === "bedtime");
  const g0 = groups[0];
  const supps: Draft[] = [];
  for (const s of i.supplements) {
    let at: number | null = null;
    let detail = "";
    switch (s.timing) {
      case "morning":
        at = wake;
        detail = "In the morning.";
        break;
      case "with_meal":
        at = firstMeal?.at ?? null;
        detail = "With a meal.";
        break;
      case "pre_workout":
        if (g0) {
          at = Math.max(wake, g0.start - SUP.caffeine.minutesBefore);
          detail = `Before ${g0.titles[0]}.`;
        }
        break;
      case "post_workout":
        if (g0) {
          at = g0.end;
          detail = `After ${g0.titles[g0.titles.length - 1]}.`;
        }
        break;
      case "evening":
        at = bedDraft?.at ?? lastMeal?.at ?? null;
        detail = bedDraft ? "At bedtime." : "In the evening.";
        break;
    }
    if (at === null) continue;
    const note = supplementNote(s.name, kg);
    supps.push({ at, kind: "supplement", title: s.name, detail: note ? `${detail} ${note}` : detail, ruleIds: ["supplements.evidence"] });
  }

  return [...drafts, ...supps]
    .sort((a, b) => a.at - b.at || KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
    .map(({ at, ...rest }) => ({ ...rest, time: fmt(at) }));
}
