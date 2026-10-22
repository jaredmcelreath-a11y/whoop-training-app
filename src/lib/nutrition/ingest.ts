import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { nutritionDays, type NutrientValue } from "@/db/schema";
import { isNutrientKey, nutrientUnit, type NutrientKey } from "@/lib/engine/nutrients";

/**
 * Apple Health ingest. These caps are input validation (reject garbage), not
 * training rules, so they live here rather than in the rules catalog.
 */
export const MAX_ENERGY_KCAL = 15000;
export const MAX_WATER_ML = 15000;
export const MAX_MACRO_G = 2000;
export const MAX_MICRO = 100000; // in each micro's canonical unit
export const MAX_DAYS = 3;
export const MAX_BODY_BYTES = 65536;
/** At most this many unknown keys are echoed back; `ignoredKeyCount` has the full count. */
export const MAX_IGNORED_KEYS = 20;
/**
 * Clock-skew tolerance for `sentAt`. A post dated further ahead would lock its days (later real
 * posts look older and are ignored), so it is rejected instead.
 */
export const MAX_SENT_AT_AHEAD_MS = 5 * 60_000;

/** True when `sentAt` (a valid ISO datetime) is more than MAX_SENT_AT_AHEAD_MS after `now`. */
export function sentAtTooFarAhead(sentAt: string, now: Date): boolean {
  return Date.parse(sentAt) - now.getTime() > MAX_SENT_AT_AHEAD_MS;
}

/**
 * Reads a request body as UTF-8 text, counting bytes as they arrive. Past `maxBytes` it stops,
 * cancels the stream and returns null, so an oversize body is never fully buffered.
 */
export async function readBodyCapped(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<string | null> {
  if (!body) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

const MACRO_KEYS: ReadonlySet<NutrientKey> = new Set(["protein_g", "carbs_g", "fat_g", "fiber_g"]);

function maxFor(key: NutrientKey): number {
  if (key === "energy_kcal") return MAX_ENERGY_KCAL;
  if (key === "water_ml") return MAX_WATER_ML;
  if (MACRO_KEYS.has(key)) return MAX_MACRO_G;
  return MAX_MICRO;
}

function isRealDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const day = z
  .object({
    date: z.string().refine(isRealDate, "date must be a real YYYY-MM-DD date"),
    // Unknown keys are tolerated (and reported); known keys are range-checked below.
    totals: z.record(z.string(), z.unknown()),
  })
  .superRefine((d, ctx) => {
    for (const [k, v] of Object.entries(d.totals)) {
      if (!isNutrientKey(k)) continue;
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > maxFor(k)) {
        ctx.addIssue({ code: "custom", path: ["totals", k], message: `${k} out of range` });
      }
    }
  });

export const IngestPayload = z.object({
  sentAt: z.iso.datetime({ offset: true }),
  days: z
    .array(day)
    .min(1)
    .max(MAX_DAYS)
    .refine((ds) => new Set(ds.map((d) => d.date)).size === ds.length, "duplicate dates"),
});
export type IngestPayloadT = z.infer<typeof IngestPayload>;

const COLUMN: Partial<Record<NutrientKey, "kcal" | "proteinG" | "carbsG" | "fatG" | "fiberG" | "waterMl">> = {
  energy_kcal: "kcal",
  protein_g: "proteinG",
  carbs_g: "carbsG",
  fat_g: "fatG",
  fiber_g: "fiberG",
  water_ml: "waterMl",
};

/**
 * Replace each day's totals (never sum). Unknown keys are echoed (the first MAX_IGNORED_KEYS)
 * and counted, never stored. One statement per day; the WHERE makes an
 * older/duplicate post a no-op, so out-of-order delivery cannot clobber newer data.
 */
export async function ingestDays(
  db: Db,
  payload: IngestPayloadT,
): Promise<{ written: number; ignoredKeys: string[]; ignoredKeyCount: number }> {
  const sentAt = new Date(payload.sentAt);
  const ignored = new Set<string>();
  let written = 0;
  for (const d of payload.days) {
    const cols: Record<string, number | null> = {
      kcal: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      fiberG: null,
      waterMl: null,
    };
    const micros: Record<string, NutrientValue> = {};
    for (const [k, v] of Object.entries(d.totals)) {
      if (!isNutrientKey(k)) {
        ignored.add(k);
        continue;
      }
      const col = COLUMN[k];
      if (col) cols[col] = v as number;
      else micros[k] = { value: v as number, unit: nutrientUnit(k) };
    }
    const values = { ...cols, micros, sentAt, source: "apple_health" };
    const rows = await db
      .insert(nutritionDays)
      .values({ localDate: d.date, ...values })
      .onConflictDoUpdate({
        target: nutritionDays.localDate,
        set: { ...values, updatedAt: sql`now()` },
        setWhere: sql`${nutritionDays.sentAt} is null or ${nutritionDays.sentAt} < excluded.sent_at`,
      })
      .returning({ localDate: nutritionDays.localDate });
    written += rows.length;
  }
  return { written, ignoredKeys: [...ignored].slice(0, MAX_IGNORED_KEYS), ignoredKeyCount: ignored.size };
}
