import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cardioEntries, workouts } from "@/db/schema";
import { localDate, zonedLocalToUtc } from "./dates";
import { findWhoopMatch, type LinkedWorkout } from "./link-whoop";
import { fromMeters, parseNumber, toMeters } from "./units";
import { CardioInput } from "./validate";

export type CardioEntry = typeof cardioEntries.$inferSelect;
export type CardioKind = CardioInput["kind"];

export const DEFAULT_UNIT = { swim: "yd", run: "mi", bike: "mi" } as const;
/** A swim with no pool length given is a 25 yd pool. */
const DEFAULT_POOL_M = toMeters(25, "yd");

/** Stores an already-validated entry in canonical units (meters, seconds). */
export async function addCardio(db: Db, input: CardioInput, tz: string): Promise<{ id: string }> {
  const startedAt = new Date(input.startedAt);
  const isSwim = input.kind === "swim";
  const durationS = Math.round(input.durationMin * 60);
  const whoopWorkoutId = await findWhoopMatch(
    db,
    input.kind,
    startedAt,
    new Date(startedAt.getTime() + durationS * 1000),
  );
  const [row] = await db
    .insert(cardioEntries)
    .values({
      kind: input.kind,
      startedAt,
      localDate: localDate(startedAt, tz),
      durationS,
      whoopWorkoutId,
      distanceM: input.distance === null ? null : toMeters(input.distance, input.unit),
      avgWatts: input.avgWatts === null ? null : Math.round(input.avgWatts),
      inclinePct: input.inclinePct,
      poolLengthM: isSwim
        ? input.poolLength === null
          ? DEFAULT_POOL_M
          : toMeters(input.poolLength, input.unit)
        : null,
      indoor: input.indoor,
      notes: input.notes.trim() || null,
    })
    .returning({ id: cardioEntries.id });
  return row;
}

/** When a cardio entry finished: its start plus its duration. */
export function runEndedAt(startedAt: Date, durationS: number): Date {
  return new Date(startedAt.getTime() + durationS * 1000);
}

export async function deleteCardio(db: Db, id: string): Promise<void> {
  await db.delete(cardioEntries).where(eq(cardioEntries.id, id));
}

export type CardioWithWhoop = CardioEntry & { whoop: LinkedWorkout | null };

/** Newest first, with the linked WHOOP workout (if any) from one left-joined query. */
export async function recentCardio(db: Db, limit = 10): Promise<CardioWithWhoop[]> {
  const rows = await db
    .select({
      entry: cardioEntries,
      wId: workouts.id,
      strain: workouts.strain,
      avgHr: workouts.avgHr,
      wStart: workouts.start,
      wEnd: workouts.end,
    })
    .from(cardioEntries)
    .leftJoin(workouts, eq(workouts.id, cardioEntries.whoopWorkoutId))
    .orderBy(desc(cardioEntries.startedAt))
    .limit(limit);
  return rows.map((r) => ({
    ...r.entry,
    whoop:
      r.wId === null
        ? null
        : { strain: r.strain, avgHr: r.avgHr, start: r.wStart as Date, end: (r.wEnd ?? r.wStart) as Date },
  }));
}

/**
 * Reads the cardio form. `startedAt` is a datetime-local value in `tz`; fields that do not
 * belong to the chosen kind are dropped; swims and gym rides are indoor, runs read the checkbox.
 */
export function cardioFormToInput(formData: FormData, tz: string) {
  const kind = String(formData.get("kind") ?? "");
  const has = (k: CardioKind) => kind === k;
  let startedAt = "";
  try {
    startedAt = zonedLocalToUtc(String(formData.get("startedAt") ?? ""), tz);
  } catch {
    // Left empty so validation reports startedAt.
  }
  const unit = String(formData.get("unit") || DEFAULT_UNIT[kind as CardioKind] || "");
  return CardioInput.safeParse({
    kind,
    startedAt,
    durationMin: parseNumber(formData.get("durationMin")),
    distance: parseNumber(formData.get("distance")),
    unit,
    avgWatts: has("bike") ? parseNumber(formData.get("avgWatts")) : null,
    inclinePct: has("run") ? parseNumber(formData.get("inclinePct")) : null,
    poolLength: has("swim") ? parseNumber(formData.get("poolLength")) : null,
    indoor: has("run") ? formData.get("indoor") === "on" : true,
    notes: String(formData.get("notes") ?? ""),
  });
}

/** 125 -> "2:05"; 3900 -> "1:05:00". */
function clock(totalS: number): string {
  const s = Math.round(totalS);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

const LABEL = { run: "Run", bike: "Bike", swim: "Swim" } as const;

/**
 * "Run · 2.0 mi · 24:10 · 12:05 /mi", "Swim · 1,500 yd · 32 min · 2:08 /100yd",
 * "Bike · 10.0 mi · 45 min · 145 W". Swims show yd, runs and rides mi.
 */
export function formatCardio(
  e: Pick<CardioEntry, "kind" | "durationS" | "distanceM" | "avgWatts">,
): string {
  const parts: string[] = [LABEL[e.kind]];
  const dist = e.distanceM && e.distanceM > 0 ? e.distanceM : null;
  if (dist !== null) {
    parts.push(
      e.kind === "swim"
        ? `${Math.round(fromMeters(dist, "yd")).toLocaleString("en-US")} yd`
        : `${fromMeters(dist, "mi").toFixed(1)} mi`,
    );
  }
  const long = e.durationS >= 3600;
  parts.push(long || e.kind === "run" ? clock(e.durationS) : `${Math.round(e.durationS / 60)} min`);
  if (dist !== null && e.kind === "run")
    parts.push(`${clock(e.durationS / fromMeters(dist, "mi"))} /mi`);
  if (dist !== null && e.kind === "swim") {
    parts.push(`${clock(e.durationS / (fromMeters(dist, "yd") / 100))} /100yd`);
  }
  if (e.kind === "bike" && e.avgWatts !== null) parts.push(`${e.avgWatts} W`);
  return parts.join(" · ");
}
