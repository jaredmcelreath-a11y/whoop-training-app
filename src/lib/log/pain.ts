import { and, asc, eq, gte, lte, max } from "drizzle-orm";
import type { Db } from "@/db/client";
import { painEntries } from "@/db/schema";
import { addDays, localDate } from "./dates";
import { parseNumber } from "./units";
import { PAIN_AREAS, PainInput, formError } from "./validate";

export { PAIN_AREAS };

type Parsed = { ok: true; inputs: PainInput[] } | { ok: false; error: string };

/** Writes several entries in one statement (no transactions on neon-http). */
export async function addPains(
  db: Db,
  inputs: PainInput[],
  at: Date,
  tz: string,
  cardioEntryId?: string,
): Promise<void> {
  if (!inputs.length) return;
  const day = localDate(at, tz);
  await db
    .insert(painEntries)
    .values(
      inputs.map((i) => ({
        ...i,
        loggedAt: at,
        localDate: day,
        cardioEntryId: cardioEntryId ?? null,
      })),
    );
}

export async function addPain(
  db: Db,
  input: PainInput,
  at: Date,
  tz: string,
  cardioEntryId?: string,
): Promise<void> {
  await addPains(db, [input], at, tz, cardioEntryId);
}

/**
 * One point per local date in the last `days` local days (today included), ascending:
 * that day's max score across sides and contexts. Days with no entries are omitted.
 */
export async function painTrend(
  db: Db,
  area: string,
  now: Date,
  tz: string,
  days = 14,
): Promise<{ date: string; max: number }[]> {
  const today = localDate(now, tz);
  const rows = await db
    .select({ date: painEntries.localDate, max: max(painEntries.score) })
    .from(painEntries)
    .where(
      and(
        eq(painEntries.area, area),
        gte(painEntries.localDate, addDays(today, -(days - 1))),
        lte(painEntries.localDate, today),
      ),
    )
    .groupBy(painEntries.localDate)
    .orderBy(asc(painEntries.localDate));
  return rows.map((r) => ({ date: r.date, max: r.max ?? 0 }));
}

function validate(raw: unknown[]): Parsed {
  const inputs: PainInput[] = [];
  for (const r of raw) {
    const p = PainInput.safeParse(r);
    if (!p.success) return { ok: false, error: formError(p.error) };
    inputs.push(p.data);
  }
  return { ok: true, inputs };
}

/** Pain page: only areas whose `log_<area>` box is checked are written. */
export function painFormToInputs(formData: FormData): Parsed {
  const context = formData.get("context") || "daily";
  return validate(
    PAIN_AREAS.filter((a) => formData.get(`log_${a}`) === "on").map((area) => ({
      area,
      side: formData.get(`side_${area}`),
      score: parseNumber(formData.get(`score_${area}`)),
      context,
    })),
  );
}

/** After-run prompt: each area is "skip" or 0-10, logged as after_run on both sides. */
export function afterRunFormToInputs(formData: FormData): Parsed {
  return validate(
    PAIN_AREAS.filter((a) => (formData.get(`score_${a}`) ?? "skip") !== "skip").map((area) => ({
      area,
      side: "both",
      score: parseNumber(formData.get(`score_${area}`)),
      context: "after_run",
    })),
  );
}
