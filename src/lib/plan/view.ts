/** Pure display helpers for the Plan tab (week, season, settings, library). */
import { RULES } from "@/lib/engine/rules/catalog";
import type { Evidence } from "@/lib/engine/rules/types";
import type { Phase, SeasonWeek } from "@/lib/engine/season";
import { addDays, weekStart } from "@/lib/log/dates";
import { fromMeters, parseNumber, toMeters } from "@/lib/log/units";
import { PlanSettingsInput, type PlanSettings } from "./settings";

const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 86_400_000;
const PERCENT = 100;

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const ms = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === s;
}

/** The `?week=` value when it is a real Monday (YYYY-MM-DD), else the Monday of `today`. */
export function parseWeekParam(raw: string | string[] | undefined, today: string): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (v && isRealDate(v) && weekStart(v) === v) return v;
  return weekStart(today);
}

/** "2026-10-26" -> "Mon Oct 26" (read as UTC so the day never shifts). */
export function dayHeading(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(d);
  const md = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(d);
  return `${wd} ${md}`;
}

/** "2027-10-17" -> "Sun, Oct 17, 2027". */
export function longDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** "2026-10-26" -> "Oct 26". */
export function shortDay(date: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

// ---------------------------------------------------------------------------
// Session details
// ---------------------------------------------------------------------------

export type RxLine = { exercise: string; sets: number; repRange: readonly number[]; targetWeightLb: number | null; note: string };

const range = (r: readonly number[]) => (r.length === 2 && r[0] !== r[1] ? `${r[0]}–${r[1]}` : String(r[0]));

/** "Leg Press 3 × 10–12 @ 185 lb", or "@ —" when there is no target weight. */
export function prescriptionLine(p: RxLine): string {
  const w = p.targetWeightLb === null ? "—" : `${p.targetWeightLb} lb`;
  return `${p.exercise} ${p.sets} × ${range(p.repRange)} @ ${w}`;
}

/** "10 × (run 2 min, walk 1 min)". */
export function intervalsLine(iv: { runMin: number; walkMin: number; reps: number }): string {
  return `${iv.reps} × (run ${iv.runMin} min, walk ${iv.walkMin} min)`;
}

/** "15 min warm-up · 20 min tempo · 10 min cool-down". */
export function structureLine(st: { warmUpMin: number; hardMin: number; coolDownMin: number }, intensity: string): string {
  return `${st.warmUpMin} min warm-up · ${st.hardMin} min ${intensity} · ${st.coolDownMin} min cool-down`;
}

type LongRunCap = { capMin: number; lookbackLongestMin: number | null; lookbackDays: number; trimmedMin: number; droppedMin: number };
type LongBound = { boundMin: number; droppedMin: number };
type Strides = { reps: number; seconds: number; note?: string };

/** Plain-language notes from a session's details (caps, paused running, plyometrics, strides). */
export function detailNotes(details: Record<string, unknown>): string[] {
  const out: string[] = [];
  // A quality session's note repeats its structure (shown on its own line), unless running is paused.
  const note = typeof details.note === "string" ? details.note : "";
  if (note && (!details.structure || note.includes("paused"))) out.push(note);
  const strides = details.strides as Strides | undefined;
  if (strides) out.push(`${strides.reps} × ${strides.seconds} s strides${strides.note ? ` — ${strides.note.toLowerCase()}` : ""}`);
  if (typeof details.extraWalkMin === "number" && details.extraWalkMin > 0) {
    out.push(`Plus ${details.extraWalkMin} min easy walking`);
  }
  const cap = details.longRunCap as LongRunCap | undefined;
  if (cap) {
    const why = cap.lookbackLongestMin === null ? "" : ` (longest run in the last ${cap.lookbackDays} days: ${Math.round(cap.lookbackLongestMin)} min)`;
    out.push(`Long run capped at ${cap.capMin} min${why}`);
  }
  const bound = details.longBound as LongBound | undefined;
  if (bound) out.push(`Long session limited to ${bound.boundMin} min (${bound.droppedMin} min dropped)`);
  if (details.plyo === true) out.push("Includes plyometrics (small jumps)");
  if (details.optional === true) out.push("Optional today");
  return out;
}

export const KIND_LABEL: Record<string, string> = {
  swim: "Swim",
  bike: "Bike",
  run: "Run",
  strength: "Strength",
  lower_leg: "Lower Leg",
  core: "Core",
  mobility: "Mobility",
  rest: "Rest",
};

export type StripState = "done" | "today" | "future" | "missed" | "rest";

/**
 * One state per day for the Plan week strip. Rest-only (or empty) days are "rest"; a day is
 * "done" once its swim, bike and run sessions are all done (lifting doesn't hold it back), or on
 * a day with no cardio, once all its sessions are; today is "today"; a past day that isn't done
 * is "missed"; everything else is "future".
 */
export function weekStrip(
  days: readonly { date: string; sessions: readonly { status: "planned" | "done" | "skipped"; kind: string }[] }[],
  today: string,
): StripState[] {
  return days.map((d) => {
    const work = d.sessions.filter((s) => s.kind !== "rest");
    if (work.length === 0) return "rest";
    const cardio = work.filter((s) => ENDURANCE_KINDS.has(s.kind));
    if ((cardio.length ? cardio : work).every((s) => s.status === "done")) return "done";
    if (d.date === today) return "today";
    return d.date < today ? "missed" : "future";
  });
}

export const INTENSITY_LABEL: Record<string, string> = {
  z1: "Zone 1",
  z2: "Zone 2",
  tempo: "Tempo",
  threshold: "Threshold",
  intervals: "Intervals",
  strength: "Strength",
  easy: "Easy",
};

const ENDURANCE_KINDS = new Set(["swim", "bike", "run"]);

const EASY_ZONES = ["z1", "z2"] as const;

/**
 * What an easy swim, ride or run feels like, from intensity.zones: "Easy: Zone 2, 60–70% of max
 * heart rate. …". Null for anything that isn't easy endurance work.
 */
export function effortLine(kind: string, intensity: string): string | null {
  if (!ENDURANCE_KINDS.has(kind)) return null;
  const zone = intensity === "easy" ? "z2" : EASY_ZONES.find((z) => z === intensity);
  if (!zone) return null;
  const [lo, hi] = RULES["intensity.zones"].params[zone];
  return `Easy: Zone ${zone.slice(1)}, ${Math.round(lo * 100)}–${Math.round(hi * 100)}% of max heart rate. You can talk in full sentences.`;
}

/**
 * The intensity badge for a session, or null when it would only say "Easy" on a strength-type
 * session (core, lower leg, mobility): those carry `easy` as a placeholder, not a training zone.
 */
export function sessionMetaLabel(kind: string, intensity: string): string | null {
  if (intensity === "easy" && !ENDURANCE_KINDS.has(kind)) return null;
  return INTENSITY_LABEL[intensity] ?? intensity;
}

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

export type ParamItem = { label: string; value: string } | { label: string; children: ParamItem[] };

type UnitFn = (n: number) => string;

/** Key suffix -> unit shown after the value (longest first). */
const SUFFIXES: { suffix: string; unit: UnitFn }[] = [
  { suffix: "MinPerWeek", unit: () => " min/week" },
  { suffix: "Pct", unit: () => "%" },
  { suffix: "Hours", unit: () => " h" },
  { suffix: "Min", unit: () => " min" },
  { suffix: "Days", unit: (n) => (n === 1 ? " day" : " days") },
  { suffix: "Weeks", unit: (n) => (n === 1 ? " week" : " weeks") },
  { suffix: "Seconds", unit: () => " s" },
  { suffix: "Bpm", unit: () => " bpm" },
];
const PERCENT_KEYS = /(Factor|Fraction|Share)$/;

function words(key: string): string {
  const w = key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
  return w.charAt(0).toUpperCase() + w.slice(1);
}

function scalar(v: unknown, unit: string, pct: boolean): string {
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (typeof v === "number") return pct ? `${Math.round(v * PERCENT)}%` : `${v}${unit}`;
  if (typeof v === "string") return v.replace(/_/g, " ");
  return String(v);
}

/** Keys whose camelCase split reads badly, with their own label and unit. */
const KEY_LABEL: Record<string, { label: string; unit?: string }> = {
  compound: { label: "Big lifts (reps)" },
  isolation: { label: "Isolation lifts (reps)" },
  rirCompound: { label: "Reps in reserve (big lifts)" },
  rirIsolation: { label: "Reps in reserve (isolation)" },
  stepPct: { label: "Step", unit: "%" },
  defaultIncrementLb: { label: "Default increment", unit: " lb" },
  calibrationRir: { label: "Reps left when finding a weight" },
  swcSd: { label: "Smallest worthwhile change", unit: " SD" },
  reentryBelowFraction: { label: "Restart if a week falls below" },
  absoluteCapWeeklyIncreasePct: { label: "Hard cap on weekly increase", unit: "%" },
  noLowerDayWithinHoursBeforeKeyRun: { label: "No leg day this many hours before a key run", unit: " h" },
  // Nutrition and hydration (Plan 4)
  gPerKg: { label: "Per kg of bodyweight", unit: " g" },
  minGPerKg: { label: "Minimum per kg", unit: " g" },
  maxGPerKg: { label: "Maximum per kg", unit: " g" },
  gPerKgPerMeal: { label: "Per meal, per kg", unit: " g" },
  carbsGPerKg: { label: "Carbs per kg", unit: " g" },
  proteinGPerKg: { label: "Protein per kg", unit: " g" },
  maxMin: { label: "Planned endurance up to", unit: " min" },
  pctKcalMin: { label: "Minimum share of calories", unit: "%" },
  pctBodyweightPerWeek: { label: "Gain per week (of bodyweight)", unit: "%" },
  floorKcalPerKgFfm: { label: "Floor per kg fat-free mass", unit: " kcal" },
  targetKcalPerKgFfm: { label: "Target per kg fat-free mass", unit: " kcal" },
  ffmFallbackFraction: { label: "Fat-free mass if no scan (share of weight)" },
  whoopDaysMin: { label: "Minimum WHOOP days", unit: " days" },
  fallbackActivityFactor: { label: "Activity factor (x resting burn)", unit: "" },
  kcalPerLbChange: { label: "Energy per lb of weight change", unit: " kcal" },
  maxWeeklyStepKcal: { label: "Largest weekly change", unit: " kcal" },
  replacePctOfLoss: { label: "Replace of sweat lost", unit: "%" },
  defaultLph: { label: "Default sweat rate", unit: " L/h" },
  minLph: { label: "Lowest rate used", unit: " L/h" },
  maxLph: { label: "Highest rate used", unit: " L/h" },
  maxGainLb: { label: "Largest weight gain accepted", unit: " lb" },
  litersPerKgLost: { label: "Litres per kg lost", unit: " L" },
  totalWaterL: { label: "Total water (food + drinks)", unit: " L" },
  mgPerKg: { label: "Per kg of bodyweight", unit: " mg" },
  gPerDay: { label: "Per day", unit: " g" },
  rdaUg: { label: "RDA", unit: " µg" },
  ulUg: { label: "Upper limit", unit: " µg" },
  defaultMet: { label: "Default MET by sport" },
  kcalPerMetKgHour: { label: "kcal per MET per kg per hour", unit: "" },
};

/**
 * A tier `maxMin` at or above a day's minutes is an open-ended sentinel (no day plans that
 * much), shown as "over" the previous tier's max.
 */
const OPEN_ENDED_MIN = 24 * 60;
const maxMinOf = (x: unknown) => (x && typeof x === "object" ? (x as { maxMin?: unknown }).maxMin : undefined);

/** Rule params as readable label/value pairs (nested objects become nested lists). */
export function humanizeParams(params: unknown, inherited?: UnitFn): ParamItem[] {
  if (!params || typeof params !== "object") return [];
  return Object.entries(params as Record<string, unknown>).map(([key, v]): ParamItem => {
    const over = KEY_LABEL[key];
    const sfx = over
      ? undefined
      : SUFFIXES.find((s) => key.endsWith(s.suffix) && key !== s.suffix.charAt(0).toLowerCase() + s.suffix.slice(1));
    const own = over?.unit;
    const unitFn: UnitFn | undefined =
      own !== undefined ? () => own : (sfx?.unit ?? (/Hours/.test(key) ? () => " h" : inherited));
    const label = over?.label ?? words(sfx ? key.slice(0, -sfx.suffix.length) : key);
    const first = Array.isArray(v) ? v[0] : v;
    const pct = PERCENT_KEYS.test(key) && typeof first === "number" && own === undefined;
    const unit = unitFn && typeof first === "number" ? unitFn(Array.isArray(v) ? 2 : first) : "";
    if (Array.isArray(v) && v.some((x) => x && typeof x === "object")) {
      return {
        label,
        children: v.map((x, i) => {
          const children = humanizeParams(x, sfx?.unit);
          const max = maxMinOf(x);
          const prev = i > 0 ? maxMinOf(v[i - 1]) : undefined;
          if (typeof max !== "number" || max < OPEN_ENDED_MIN || typeof prev !== "number") return { label: `${i + 1}`, children };
          const keys = Object.keys(x as object);
          const at = keys.indexOf("maxMin");
          children[at] = { label: "Planned endurance", value: `over ${prev} min` };
          return { label: `${i + 1}`, children };
        }),
      };
    }
    if (Array.isArray(v)) {
      const parts = v.map((x) => scalar(x, "", pct));
      const joined = v.length === 2 && v.every((x) => typeof x === "number") ? `${parts[0]}–${parts[1]}` : parts.join(", ");
      return { label, value: `${joined}${pct ? "" : unit}` };
    }
    if (v && typeof v === "object") return { label, children: humanizeParams(v, sfx?.unit) };
    return { label, value: scalar(v, unit, pct) };
  });
}

/** Plain-language meaning of each evidence level, strongest first. */
export const EVIDENCE_TEXT: Record<Evidence, string> = {
  consensus: "An expert group's position stand or consensus statement.",
  "meta-analysis": "Pooled results of many studies.",
  trial: "A single study: one trial or one group of people.",
  expert: "An expert's explainer or narrative review, not a direct test.",
  "n-of-1": "One person's self-experiment. Interesting, but it may not apply to you.",
  practice: "Common coaching practice with no direct study behind the number.",
};

export const EVIDENCE_LABEL: Record<Evidence, string> = {
  consensus: "Consensus",
  "meta-analysis": "Meta-Analysis",
  trial: "Trial",
  expert: "Expert",
  "n-of-1": "n-of-1",
  practice: "Practice",
};

export const AREA_LABEL: Record<string, string> = {
  season: "Season",
  volume: "Volume",
  intensity: "Intensity",
  strength: "Strength",
  recovery: "Recovery",
  pain: "Pain and Joints",
  concurrent: "Mixing Cardio and Lifting",
  lower_leg: "Lower Leg",
  week: "Weekly Template",
  nutrition: "Nutrition",
  hydration: "Hydration",
  supplements: "Supplements",
  strain: "Strain",
  race: "Race",
};

// ---------------------------------------------------------------------------
// Season
// ---------------------------------------------------------------------------

export const PHASE_LABEL: Record<Phase, string> = {
  base: "Base",
  build: "Build",
  peak: "Peak",
  taper: "Taper",
  race: "Race",
};

export const PHASE_BLURB: Record<Phase, string> = {
  base: "Easy aerobic volume and strength; muscle-gain weeks happen here.",
  build: "Volume climbs toward race needs, with more quality sessions.",
  peak: "Highest volume and race-specific sessions.",
  taper: "Volume drops, intensity stays, so you arrive fresh.",
  race: "Race week: short, sharp sessions and rest.",
};

export type PhaseBlock = { phase: Phase; start: string; end: string; weeks: SeasonWeek[] };

/** Consecutive weeks of the same phase, with their first Monday and last Sunday. */
export function phaseBlocks(weeks: readonly SeasonWeek[]): PhaseBlock[] {
  const out: PhaseBlock[] = [];
  for (const w of weeks) {
    const last = out[out.length - 1];
    if (last && last.phase === w.phase) {
      last.weeks.push(w);
      last.end = addDays(w.weekStart, DAYS_PER_WEEK - 1);
    } else {
      out.push({ phase: w.phase, start: w.weekStart, end: addDays(w.weekStart, DAYS_PER_WEEK - 1), weeks: [w] });
    }
  }
  return out;
}

/** Whole weeks from this week's Monday to the race week's Monday (0 in race week or after). */
export function weeksToRace(thisWeek: string, raceDate: string): number {
  const diff = Date.parse(`${weekStart(raceDate)}T00:00:00Z`) - Date.parse(`${thisWeek}T00:00:00Z`);
  return Math.max(0, Math.round(diff / (DAYS_PER_WEEK * MS_PER_DAY)));
}

// ---------------------------------------------------------------------------
// Settings form
// ---------------------------------------------------------------------------

const CAUTION = RULES["pain.jointStatus"].params.caution;

export const JOINT_OPTIONS: { value: PlanSettings["jointStatus"]; label: string; text: string }[] = [
  { value: "unrestricted", label: "Unrestricted", text: "No joint limits. Running builds at the normal rate and plyometrics are allowed." },
  {
    value: "caution",
    label: "Caution",
    text: `Running builds at ${Math.round(CAUTION.runIncreaseFactor * PERCENT)}% of the normal rate and plyometrics (jumps) are left out.`,
  },
  { value: "restricted", label: "Restricted", text: "Running and plyometrics are paused. Swim, bike and lifting continue." },
];

const FIELD_LABEL: Record<string, string> = {
  raceDate: "Race date",
  seasonStart: "Season start",
  windows: "Training windows",
  longRideDow: "Long ride day",
  longRunDow: "Long run day",
  restDow: "Rest day",
  secondRestDow: "Second rest day",
  jointStatus: "Joint status",
  poolLengthM: "Pool length",
  wakeTime: "Wake time",
  startSwimSecPer100Yd: "Starting swim pace",
  startRunSecPerMi: "Starting run pace",
  startBikeMph: "Starting bike speed",
  goalSec: "Race goal",
};

const S_PER_MIN = 60;
const MIN_PER_H = 60;

/** The inverse of parseClock, for showing a saved value in the form; "" when unset. */
export function formatClock(s: number | null, kind: "pace" | "goal"): string {
  if (s === null) return "";
  const minutes = kind === "pace" ? Math.floor(s / S_PER_MIN) : Math.floor(s / (S_PER_MIN * MIN_PER_H));
  const rest = kind === "pace" ? s % S_PER_MIN : Math.floor(s / S_PER_MIN) % MIN_PER_H;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

/** "2:05" as a pace (m:ss) is 125 s; "6:00" as a goal (h:mm) is 21,600 s. Null when unreadable. */
export function parseClock(raw: string, kind: "pace" | "goal"): number | null {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(raw.trim());
  if (!m) return null;
  const [big, small] = [Number(m[1]), Number(m[2])];
  return kind === "pace" ? big * S_PER_MIN + small : (big * MIN_PER_H + small) * S_PER_MIN;
}

type FormResult = { ok: true; settings: PlanSettings } | { ok: false; error: string };

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v.trim() : "";
};

/** Reads the plan settings form; validates with PlanSettingsInput and returns readable errors. */
export function settingsFromForm(f: FormData, current: PlanSettings): FormResult {
  const windows: { start: string; end: string }[] = [];
  for (const n of [1, 2]) {
    const start = str(f, `w${n}Start`);
    const end = str(f, `w${n}End`);
    if (!start && !end) continue;
    if (!start || !end) return { ok: false, error: `Training window ${n} needs a start and an end time` };
    windows.push({ start, end });
  }

  const len = parseNumber(f.get("poolLength"));
  const unit = str(f, "poolUnit");
  if (len === null || Number.isNaN(len) || len <= 0 || (unit !== "yd" && unit !== "m" && unit !== "ft")) {
    return { ok: false, error: "Pool length must be a positive number in yards, meters or feet" };
  }

  const jointStatus = str(f, "jointStatus");
  if (!JOINT_OPTIONS.some((o) => o.value === jointStatus)) return { ok: false, error: "Choose a joint status" };

  const dow = (k: string) => {
    const s = str(f, k);
    return s === "" ? NaN : Number(s);
  };

  // Optional projection fields: blank clears; anything else must read as a pace, speed or goal.
  const clock = (key: string, kind: "pace" | "goal", label: string) => {
    const raw = str(f, key);
    if (!raw) return { value: null };
    const v = parseClock(raw, kind);
    return v === null ? { error: `${label}: use ${kind === "pace" ? "m:ss, like 2:05" : "h:mm, like 6:00"}` } : { value: v };
  };
  const swim = clock("startSwim", "pace", "Starting swim pace");
  const run = clock("startRun", "pace", "Starting run pace");
  const goal = clock("goal", "goal", "Race goal");
  const bikeRaw = str(f, "startBike");
  const bike = bikeRaw ? parseNumber(bikeRaw) : null;
  for (const c of [swim, run, goal]) if ("error" in c) return { ok: false, error: c.error as string };
  if (bikeRaw && (bike === null || Number.isNaN(bike))) return { ok: false, error: "Starting bike speed: use mph, like 16" };

  const parsed = PlanSettingsInput.safeParse({
    raceDate: str(f, "raceDate"),
    seasonStart: current.seasonStart,
    windows,
    longRideDow: dow("longRideDow"),
    longRunDow: dow("longRunDow"),
    restDow: dow("restDow"),
    secondRestDow: str(f, "secondRestDow") === "" ? null : dow("secondRestDow"),
    jointStatus,
    poolLengthM: Math.round(toMeters(len, unit) * PERCENT) / PERCENT,
    wakeTime: str(f, "wakeTime") || null,
    painSide: ["left", "right", "both"].includes(str(f, "painSide")) ? str(f, "painSide") : null,
    poolUnit: unit,
    startSwimSecPer100Yd: "value" in swim ? swim.value : null,
    startRunSecPerMi: "value" in run ? run.value : null,
    startBikeMph: bike,
    goalSec: "value" in goal ? goal.value : null,
    painMonitoring: f.get("painMonitoring") === "on",
  });
  if (!parsed.success) {
    const msgs = parsed.error.issues.map((i) => {
      if (i.code === "custom") return i.message;
      const label = FIELD_LABEL[String(i.path[0])] ?? "A field";
      return i.code === "invalid_format" ? `${label}: ${i.message}` : `${label} is missing or invalid`;
    });
    return { ok: false, error: [...new Set(msgs)].join("; ") };
  }
  return {
    ok: true,
    settings: {
      ...parsed.data,
      secondRestDow: parsed.data.secondRestDow ?? null,
      wakeTime: parsed.data.wakeTime ?? null,
      painSide: parsed.data.painSide ?? null,
      poolUnit: parsed.data.poolUnit ?? "yd",
      startSwimSecPer100Yd: parsed.data.startSwimSecPer100Yd ?? null,
      startRunSecPerMi: parsed.data.startRunSecPerMi ?? null,
      startBikeMph: parsed.data.startBikeMph ?? null,
      goalSec: parsed.data.goalSec ?? null,
      painMonitoring: parsed.data.painMonitoring ?? true,
    },
  };
}

/** A stored pool length (m) shown in the owner's chosen unit, to at most 2 decimals. */
export function poolDisplay(m: number, unit: "yd" | "m" | "ft"): { value: string; unit: "yd" | "m" | "ft" } {
  return { value: String(Number(fromMeters(m, unit).toFixed(2))), unit };
}

/** Library filters: an area and an evidence level, each All when missing or unknown. */
export function filterRules<R extends { area: string; evidence: Evidence }>(
  rules: readonly R[],
  area: string | undefined,
  evidence: string | undefined,
): R[] {
  const a = area && rules.some((r) => r.area === area) ? area : null;
  const e = evidence && (Object.keys(EVIDENCE_LABEL) as string[]).includes(evidence) ? evidence : null;
  return rules.filter((r) => (a === null || r.area === a) && (e === null || r.evidence === e));
}
