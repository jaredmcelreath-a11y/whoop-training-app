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
 *   group, swimNoHeavyMealMin before a swim) moves to the group's end. When that would land after
 *   bedtime − snackAfterWakeMin, the meal moves instead to the latest free 5-min slot before
 *   the group's zone (after wake + snackAfterWakeMin and after the previous meal); with no such
 *   slot it is left out, and the last meal says so. After the collision nudge the swim zones
 *   are checked again, the same way. Bedtime may share a minute with a snack.
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

export type TimelineKind = "wake" | "supplement" | "routine" | "meal" | "snack" | "session" | "bedtime";

export type TimelineItem = {
  /** "HH:MM", local clock (an item after midnight wraps). */
  time: string;
  kind: TimelineKind;
  title: string;
  detail: string;
  ruleIds: RuleId[];
  proteinG?: number;
  carbsG?: number;
  /** For session items: the planned session's kind (swim, bike, run, strength, …). */
  sport?: string;
};

export type SupplementTiming = "morning" | "with_meal" | "pre_workout" | "post_workout" | "evening";

export type TimelineInput = {
  windows: readonly { start: string; end: string }[];
  /** `duringMl`: fluid to drink during the session (hydration.exercise), shown in oz when positive. */
  sessions: readonly { title: string; kind: string; durationMin: number; window?: number; intensity: string; duringMl?: number }[];
  mealsPerDay: number;
  supplements: readonly { name: string; timing: SupplementTiming; amount?: string | null }[];
  /** Day targets; null when unknown (amounts are then left out). */
  proteinG: number | null;
  carbsG: number | null;
  weightKg: number | null;
  /** A steady bedtime from recovery.anchorBedtime (time in bed, min); used instead of sleepNeedMin when given. */
  bedtime?: { inBedMin: number; earlierMin: number };
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
const KIND_ORDER: Record<TimelineKind, number> = { wake: 0, session: 1, meal: 2, snack: 3, supplement: 4, routine: 5, bedtime: 6 };

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
type SupplementKind = "creatine" | "caffeine" | "vitaminD" | "vitaminK2" | "omega3" | "magnesium" | "collagen";

/** Which known supplements a typed name is (a D3+K2 combo is both). */
function supplementKinds(name: string): SupplementKind[] {
  const n = name.toLowerCase();
  const kinds: SupplementKind[] = [];
  if (n.includes("creatin")) kinds.push("creatine");
  if (n.includes("caffein") || n.includes("coffee")) kinds.push("caffeine");
  if (/vitamin\s*d|vit\.?\s*d|\bd3\b/.test(n)) kinds.push("vitaminD");
  if (/\bk2\b|vitamin\s*k|menaquinone|mk-?7/.test(n)) kinds.push("vitaminK2");
  if (/omega|fish\s*oil|\bepa\b|\bdha\b/.test(n)) kinds.push("omega3");
  // "mg" counts only as the name itself or before a magnesium form, never as a dose unit ("Zinc 15 mg").
  if (/magnes|^mg$|^mg\s+(glycinate|bisglycinate|citrate|threonate|malate|oxide|chloride|taurate)\b/.test(n.trim())) kinds.push("magnesium");
  if (/coll[ae]gen|gelatin/.test(n)) kinds.push("collagen");
  return kinds;
}

const RULE_FOR: Record<SupplementKind, RuleId[]> = {
  creatine: ["supplements.evidence", "supplements.creatineBrain"],
  caffeine: ["supplements.evidence"],
  vitaminD: ["supplements.evidence"],
  vitaminK2: ["supplements.vitaminK2"],
  omega3: ["supplements.omega3"],
  magnesium: ["supplements.magnesium"],
  collagen: ["supplements.collagen"],
};

/** The Library rules behind a supplement's note, once each; [] for an unknown name. */
export function supplementRuleIds(name: string): RuleId[] {
  return [...new Set(supplementKinds(name).flatMap((k) => RULE_FOR[k]))];
}

/** A typed amount in grams ("10 g", "10g", "600 mg"), or null when it can't be read. */
function amountGrams(amount: string | null | undefined): number | null {
  const m = amount?.trim().toLowerCase().replace(/,/g, "").match(/^(\d+(?:\.\d+)?)\s*(g|grams?|mg|milligrams?)?$/);
  if (!m) return null;
  const v = Number(m[1]);
  return m[2]?.startsWith("m") ? v / 1000 : v;
}

const ABOVE = "Your amount is above every dose the app has sources for; check with your doctor or a registered dietitian.";

export function supplementNote(name: string, weightKg: number | null, amount?: string | null): string | null {
  const p = RULES["supplements.evidence"].params;
  const B = RULES["supplements.creatineBrain"].params;
  const O = RULES["supplements.omega3"].params;
  const M = RULES["supplements.magnesium"].params;
  const K = RULES["supplements.vitaminK2"].params;
  const C = RULES["supplements.collagen"].params;
  const g = amountGrams(amount);
  const notes: string[] = [];
  for (const kind of supplementKinds(name)) {
    switch (kind) {
      case "creatine": {
        let note = `Creatine monohydrate: ${p.creatine.gPerDay[0]}-${p.creatine.gPerDay[1]} g a day.`;
        if (g !== null && g > B.studiedGPerDay[1]) note += ` ${ABOVE}`;
        else if (g !== null && g > p.creatine.gPerDay[1]) {
          note +=
            ` Brain studies used ${B.studiedGPerDay[0]}-${B.studiedGPerDay[1]} g a day, with a small memory benefit mostly in older or sleep-deprived adults.` +
            (g >= B.splitAboveG
              ? ` Split it into doses of ${B.splitDoseG} g or less (${B.splitDoses} × ${B.splitDoseG} g at ${B.splitAboveG} g); in young, rested adults 10 and 20 g a day showed no memory effect.`
              : "");
        }
        notes.push(note);
        break;
      }
      case "caffeine": {
        const forYou = known(weightKg)
          ? ` (${Math.round(p.caffeine.mgPerKg[0] * weightKg)}-${Math.round(p.caffeine.mgPerKg[1] * weightKg)} mg for you)`
          : "";
        notes.push(`Caffeine: ${p.caffeine.mgPerKg[0]}-${p.caffeine.mgPerKg[1]} mg/kg${forYou}, about ${p.caffeine.minutesBefore} min before key sessions.`);
        break;
      }
      case "vitaminD":
        notes.push(`Vitamin D: dose only from a blood test with your doctor. RDA ${p.vitaminD.rdaUg} µg, upper limit ${p.vitaminD.ulUg} µg a day.`);
        break;
      case "vitaminK2":
        notes.push(`Vitamin K: adequate intake ${K.aiUgMen} µg a day for men. On a warfarin-type blood thinner, ask your prescriber first.`);
        break;
      case "omega3":
        notes.push(
          g !== null && g > O.safeUpToG
            ? `Omega-3: up to ${O.safeUpToG} g a day EPA+DHA is considered safe. ${ABOVE}`
            : `Omega-3: up to ${O.safeUpToG} g a day EPA+DHA is considered safe; about ${O.athleteG} g a day is cited for athletes.`,
        );
        break;
      case "magnesium": {
        const mg = g === null ? null : g * 1000;
        notes.push(
          `Magnesium: keep supplements at or under ${M.supplementUlMg} mg elemental a day.` +
            (mg !== null && mg > M.supplementUlMg ? " Your amount is above that limit; check with your doctor or a registered dietitian." : ""),
        );
        break;
      }
      case "collagen":
        notes.push(
          `Collagen: about ${C.peptidesGPerDay} g a day, or ${C.gelatinG[0]}-${C.gelatinG[1]} g gelatin with ${C.vitaminCMg} mg vitamin C about ${C.hoursBefore} h before training. It doesn't count toward protein targets.` +
            (g !== null && g > C.gelatinG[1] ? ` ${ABOVE}` : ""),
        );
        break;
    }
  }
  return notes.length ? notes.join(" ") : null;
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
        sport: s.kind,
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

  // Bedtime: the steady anchor when there is enough sleep history, else last night's WHOOP need.
  const anchor = i.bedtime && known(i.bedtime.inBedMin) && i.bedtime.inBedMin > 0 ? i.bedtime : null;
  const bed = anchor
    ? round5(wake + MIN_PER_DAY - anchor.inBedMin)
    : known(i.sleepNeedMin)
      ? wake + MIN_PER_DAY - i.sleepNeedMin
      : null;
  if (bed !== null && anchor) {
    drafts.push({
      at: bed,
      kind: "bedtime",
      title: "Bedtime",
      detail:
        anchor.earlierMin > 0
          ? `${anchor.earlierMin} min earlier than your steady bedtime: WHOOP shows extra sleep need tonight.`
          : "Your steady bedtime, from your average WHOOP sleep need and time awake in bed.",
      ruleIds: ["recovery.anchorBedtime", "recovery.sleepDebt"],
    });
  } else if (bed !== null) {
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
  // Breakfast comes a little after waking; the rest spread evenly to bedtime.
  const firstMealAt = wake + TL.firstMealAfterWakeMin;
  const spacing = (dayEnd - firstMealAt) / n;
  const latestMeal = bed !== null ? bed - TL.snackAfterWakeMin : null;
  const zoneAt = (at: number, swimOnly = false) => groups.find((x) => (!swimOnly || x.swim) && at >= x.zoneStart && at < x.end);
  /**
   * Moves `at` out of every no-meal zone to the group's end; repeated passes catch a move into a
   * later group's zone. A move past latestMeal is dropped (`kept` names the group).
   */
  const relocate = (at: number): { at: number; moved: Group | null; kept: Group | null } => {
    let t = at;
    let moved: Group | null = null;
    for (let pass = 0; pass < groups.length + 1; pass++) {
      const g = zoneAt(t);
      if (!g) break;
      t = g.end;
      moved = g;
    }
    if (moved && latestMeal !== null && t > latestMeal) return { at, moved: null, kept: moved };
    return { at: t, moved, kept: null };
  };
  /** The latest free grid minute before g's zone, after `after` and not before earliestFood; else null. */
  const beforeZone = (g: Group, after: number, taken: (t: number) => boolean): number | null => {
    for (let t = g.zoneStart - NUDGE_MIN; t > after && t >= earliestFood; t -= NUDGE_MIN) {
      if (!zoneAt(t) && !taken(t)) return t;
    }
    return null;
  };
  type MealSlot = { at: number; moved: Group | null; early: Group | null };
  const meals: MealSlot[] = [];
  let leftOut = 0;
  for (let k = 0; k < n; k++) {
    const r = relocate(round5(firstMealAt + k * spacing));
    if (!r.kept) {
      meals.push({ at: r.at, moved: r.moved, early: null });
      continue;
    }
    const prev = Math.max(-Infinity, ...meals.map((m) => m.at));
    const t = beforeZone(r.kept, prev, (x) => meals.some((m) => m.at === x));
    if (t === null) leftOut++;
    else meals.push({ at: t, moved: null, early: r.kept });
  }
  meals.sort((a, b) => a.at - b.at);
  const mealCount = Math.max(1, meals.length);
  const earlyText = (g: Group) => `Moved before ${g.titles[0]}: after it would be too close to bedtime.`;
  const movedText = (g: Group) => `Moved after ${g.titles[g.titles.length - 1]}.`;
  const leftOutText = (k: number) => `${k} meal${k === 1 ? "" : "s"} left out: no time outside training before bedtime.`;

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
  const evenProtein = known(i.proteinG) ? Math.round((i.proteinG - postSnackProtein) / mealCount) : null;
  const perMealProtein = minProtein !== null && evenProtein !== null ? Math.max(evenProtein, minProtein) : (evenProtein ?? minProtein);
  const raised = minProtein !== null && evenProtein !== null && evenProtein < minProtein;
  const perMealCarbs = known(i.carbsG) ? Math.max(0, Math.round((i.carbsG - snackCarbs - postSnackCarbs) / mealCount)) : null;

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
    if (m.moved && m.moved !== g) parts.push(movedText(m.moved));
    if (m.early) parts.push(earlyText(m.early));
    if (leftOut > 0 && k === meals.length - 1) parts.push(leftOutText(leftOut));
    const ruleIds: RuleId[] = ["nutrition.proteinPerMeal"];
    if (m.moved || m.early) ruleIds.push("nutrition.preWorkout");
    if (m.early || (leftOut > 0 && k === meals.length - 1)) ruleIds.push("nutrition.timeline");
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
  // Bedtime is a fixed point: it may share its minute with a snack (e.g. a recovery snack).
  const settle = () => {
    drafts.sort((a, b) => a.at - b.at || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    for (let k = 1; k < drafts.length; k++) {
      const shareOk = drafts[k].kind === "bedtime" && drafts[k - 1].kind === "snack" && drafts[k].at === drafts[k - 1].at;
      if (!shareOk && drafts[k].at <= drafts[k - 1].at) drafts[k].at = drafts[k - 1].at + NUDGE_MIN;
    }
  };
  settle();
  // A nudge can push a meal into a swim's no-meal zone: move it out again, then re-settle.
  for (let pass = 0; pass < groups.length + 1; pass++) {
    let changed = false;
    for (const d of [...drafts]) {
      if (d.kind !== "meal" || !zoneAt(d.at, true)) continue;
      const r = relocate(d.at);
      const others = drafts.filter((x) => x.kind === "meal" && x !== d);
      if (r.moved) {
        d.at = r.at;
        d.detail = `${d.detail} ${movedText(r.moved)}`;
      } else {
        // After the swim would pass bedtime: the latest free slot before its zone, else leave it out.
        const g = r.kept as Group;
        const prev = Math.max(-Infinity, ...others.filter((x) => x.at < g.zoneStart).map((x) => x.at));
        const t = beforeZone(g, prev, (x) => drafts.some((o) => o !== d && o.kind !== "supplement" && o.at === x));
        if (t !== null) {
          d.at = t;
          d.detail = `${d.detail} ${earlyText(g)}`;
        } else {
          drafts.splice(drafts.indexOf(d), 1);
          const last = others[others.length - 1];
          if (last) last.detail = `${last.detail} ${leftOutText(1)}`;
        }
      }
      if (drafts.includes(d) && !d.ruleIds.includes("nutrition.preWorkout")) d.ruleIds.push("nutrition.preWorkout");
      changed = true;
    }
    if (!changed) break;
    settle();
  }

  // Supplements, anchored to the final times; they may share a minute.
  const firstMeal = drafts.find((d) => d.kind === "meal");
  const lastMeal = [...drafts].reverse().find((d) => d.kind === "meal");
  const bedDraft = drafts.find((d) => d.kind === "bedtime");
  const g0 = groups[0];
  const supps: Draft[] = [];
  // Morning supplements share one item shortly after waking, so the timeline stays short.
  const morning = i.supplements.filter((s) => s.timing === "morning");
  if (morning.length) {
    const names = morning.map((s) => (s.amount ? `${s.name} (${s.amount})` : s.name));
    const ids = [...new Set(morning.flatMap((s) => supplementRuleIds(s.name)))];
    supps.push({
      at: wake + TL.morningSupplementsAfterWakeMin,
      kind: "supplement",
      title: "Morning Supplements",
      detail: `${names.join(", ")}. Evidence notes are in Supplements below.`,
      ruleIds: ids.length ? ids : ["supplements.evidence"],
    });
  }

  // Morning light (and quiet time) by the lamp, before breakfast is eaten in front of it.
  const ML = RULES["recovery.morningLight"].params;
  supps.push({
    at: wake + TL.morningLightAfterWakeMin,
    kind: "routine",
    title: "Morning Light and Quiet Time",
    detail: `Lamp on: about ${ML.lampMin} min at its rated distance, facing it without staring. Quiet time and reading as long as you need, and eat breakfast in front of it. On a clear morning after sunrise, about ${ML.outdoorMin.clear} min outside works too.`,
    ruleIds: ["recovery.morningLight"],
  });

  for (const s of i.supplements) {
    let at: number | null = null;
    let detail = "";
    switch (s.timing) {
      case "morning":
        continue; // placed above as one item
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
        at = bedDraft ? bedDraft.at - TL.eveningSupplementsBeforeBedMin : (lastMeal?.at ?? null);
        detail = bedDraft ? "An hour before bed." : "In the evening.";
        break;
    }
    if (at === null) continue;
    const note = supplementNote(s.name, kg, s.amount);
    const amount = s.amount ? `${s.amount}. ` : "";
    const ids = supplementRuleIds(s.name);
    supps.push({
      at,
      kind: "supplement",
      title: s.name,
      detail: note ? `${amount}${detail} ${note}` : `${amount}${detail}`,
      ruleIds: ids.length ? ids : ["supplements.evidence"],
    });
  }

  return [...drafts, ...supps]
    .sort((a, b) => a.at - b.at || KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
    .map(({ at, ...rest }) => ({ ...rest, time: fmt(at) }));
}

/** A workout that actually happened (logged in the app or recorded by WHOOP). */
export type ActualWorkout = {
  startHHMM: string;
  sport: "swim" | "bike" | "run" | "strength" | null;
  title: string;
  durationMin: number;
  source: "app" | "whoop";
};

const STRENGTH_SPORTS = new Set(["strength", "lower_leg", "core"]);
const sportOf = (s: string | undefined) => (s && STRENGTH_SPORTS.has(s) ? "strength" : (s ?? null));
const hhmm = (m: number) => `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * Puts real workouts on the timeline. A workout that matches a planned session of the same
 * sport (first unmatched, in order) moves that session to the real start and marks it done;
 * anything else becomes its own item. Items stay in day order (a bedtime after midnight
 * stays last), and a workout on another item's minute moves 5 min later.
 */
export function mergeActual(items: readonly TimelineItem[], actual: readonly ActualWorkout[]): TimelineItem[] {
  // Absolute minutes in day order: a clock time that goes backwards belongs to the next day.
  let offset = 0;
  let prev = -1;
  const placed = items.map((it) => {
    let t = toMin(it.time) + offset;
    if (t < prev) {
      offset += 1440;
      t += 1440;
    }
    prev = t;
    return { at: t, item: it };
  });
  const used = new Set<number>();
  for (const w of [...actual].sort((a, b) => toMin(a.startHHMM) - toMin(b.startHHMM))) {
    const at = toMin(w.startHHMM);
    const idx = placed.findIndex((p, i) => !used.has(i) && p.item.kind === "session" && w.sport !== null && sportOf(p.item.sport) === w.sport);
    if (idx >= 0) {
      used.add(idx);
      const p = placed[idx];
      placed[idx] = { at, item: { ...p.item, time: w.startHHMM, detail: `${p.item.detail} Done at ${w.startHHMM}.`.trim() } };
    } else {
      let t = at;
      while (placed.some((p) => p.at === t)) t += 5;
      const title = w.title.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      placed.push({
        at: t,
        item: {
          time: hhmm(t),
          kind: "session",
          ...(w.sport ? { sport: w.sport } : {}),
          title,
          detail: `${w.source === "whoop" ? "From WHOOP" : "Logged"} · ${w.durationMin} min`,
          ruleIds: [],
        },
      });
      used.add(placed.length - 1);
    }
  }
  return placed.sort((a, b) => a.at - b.at).map((p) => p.item);
}

/**
 * Time in bed for a steady bedtime (recovery.anchorBedtime): the average baseline need plus the
 * usual time awake in bed, plus tonight's extra need capped at maxEarlierMin. Never moves later.
 */
export function anchorBedtime(i: { baselineMin: number; bufferMin: number; extraMin: number }): { inBedMin: number; earlierMin: number } {
  const A = RULES["recovery.anchorBedtime"].params;
  const earlierMin = Math.round(Math.min(Math.max(i.extraMin, 0), A.maxEarlierMin));
  return { inBedMin: Math.round(i.baselineMin + i.bufferMin) + earlierMin, earlierMin };
}
