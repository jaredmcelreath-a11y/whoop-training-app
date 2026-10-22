import { MAX_SUPPLEMENTS, NutritionSettingsInput, type NutritionSettings } from "./settings";

/** Pure helpers for the nutrition settings form. No DB, no Next. */

export const MIN_MEALS = 3;
export const MAX_MEALS = 6;
export const MAX_SUPPLEMENT_ROWS = MAX_SUPPLEMENTS;
const TOKEN_TAIL = 4;
const MASK = "••••";

export const REF_PROFILES: readonly { value: NonNullable<NutritionSettings["refProfile"]>; label: string }[] = [
  { value: "male_19_30", label: "Adult Male, 19–30 (DRI Reference)" },
  { value: "female_19_30", label: "Adult Female, 19–30 (DRI Reference)" },
  { value: "male_31_50", label: "Adult Male, 31–50 (DRI Reference)" },
  { value: "female_31_50", label: "Adult Female, 31–50 (DRI Reference)" },
];

export const TIMINGS: readonly { value: NutritionSettings["supplements"][number]["timing"]; label: string }[] = [
  { value: "morning", label: "Morning" },
  { value: "with_meal", label: "With a Meal" },
  { value: "pre_workout", label: "Before a Workout" },
  { value: "post_workout", label: "After a Workout" },
  { value: "evening", label: "Evening" },
];

/** "••••abcd": only the last four characters are ever shown. */
export function maskToken(token: string): string {
  if (token.length <= TOKEN_TAIL) return MASK;
  return MASK + token.slice(-TOKEN_TAIL);
}

export const INGEST_PATH = "/api/ingest/health";
/** A host[:port] with nothing else in it (no path, spaces or markup). */
const HOST_RE = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(:\d{1,5})?$/i;
const LOCAL_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/** First value of a possibly comma-separated proxy header. */
const first = (v: string | null) => v?.split(",")[0].trim() || null;

/**
 * The full ingest URL from the request's headers: the proxy's x-forwarded-host/-proto when
 * set, else Host; http for a local dev host, https otherwise. The bare path when the host is
 * missing or malformed.
 */
export function ingestUrl(h: Pick<Headers, "get">): string {
  // x-forwarded-host only shapes this display string; it is never used for routing or auth.
  const host = first(h.get("x-forwarded-host")) ?? first(h.get("host"));
  if (!host || !HOST_RE.test(host)) return INGEST_PATH;
  const fwd = first(h.get("x-forwarded-proto"))?.toLowerCase();
  const proto = fwd === "http" || fwd === "https" ? fwd : LOCAL_RE.test(host) ? "http" : "https";
  return `${proto}://${host}${INGEST_PATH}`;
}

export type FormParse = { ok: true; patch: Partial<NutritionSettings> } | { ok: false; error: string };

function text(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v.trim() : "";
}

function number(raw: string): number {
  // Number("") is 0 and Number("1e3") passes; accept plain decimals only.
  return /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : NaN;
}

/** Turns the submitted form into a settings patch, or one readable error. */
export function nutritionPatchFromForm(fd: FormData): FormParse {
  const names = fd.getAll("supplementName");
  const timings = fd.getAll("supplementTiming");
  const amounts = fd.getAll("supplementAmount");
  const supplements: NutritionSettings["supplements"] = [];
  names.forEach((n, i) => {
    const name = typeof n === "string" ? n.trim() : "";
    if (!name) return; // empty rows are dropped
    const amount = typeof amounts[i] === "string" ? (amounts[i] as string).trim() : "";
    supplements.push({
      name,
      timing: String(timings[i] ?? "") as NutritionSettings["supplements"][number]["timing"],
      ...(amount ? { amount } : {}),
    });
  });

  const meals = number(text(fd, "mealsPerDay"));
  if (!Number.isInteger(meals) || meals < MIN_MEALS || meals > MAX_MEALS) {
    return { ok: false, error: `Meals per day must be a whole number from ${MIN_MEALS} to ${MAX_MEALS}` };
  }
  const goal = number(text(fd, "gainGoalLb"));
  if (!(goal > 0)) return { ok: false, error: "Gain goal must be a number of pounds above zero" };
  const startRaw = text(fd, "gainStartWeightLb");
  const start = startRaw === "" ? null : number(startRaw);
  if (start !== null && !(start > 0)) {
    return { ok: false, error: "Start weight must be a number of pounds above zero, or left blank" };
  }
  const profileRaw = text(fd, "refProfile");

  const patch = {
    refProfile: profileRaw === "" ? null : profileRaw,
    mealsPerDay: meals,
    waterSource: text(fd, "waterSource"),
    supplements,
    gainGoalLb: goal,
    gainStartWeightLb: start,
  };
  const parsed = NutritionSettingsInput.safeParse(patch);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  return { ok: true, patch: parsed.data };
}
