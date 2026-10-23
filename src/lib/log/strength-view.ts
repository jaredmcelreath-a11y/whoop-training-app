/** Pure display helpers for the strength screen. */

import { z } from "zod";
import type { Prescription } from "@/lib/engine/strength";
import { CATEGORY_LABEL, type Category, type Pattern } from "./exercise-catalog";

type LoggedSet = { reps: number; weightLb: number | null };
type LastTime = { date: string; sets: LoggedSet[] } | null;

/** "2026-10-14" -> "Oct 14". Parsed as UTC so the day never shifts. */
export function shortDate(localDateStr: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(new Date(`${localDateStr}T00:00:00Z`));
}

function weight(w: number | null): string {
  return w === null ? "BW" : String(w);
}

/** "Last time (Oct 14): 3×8 @ 135", "Last time (Oct 14): 8@135, 6@140", or "First time". */
export function formatLastTime(last: LastTime): string {
  if (!last || last.sets.length === 0) return "First time";
  const [first] = last.sets;
  const same = last.sets.every((s) => s.reps === first.reps && s.weightLb === first.weightLb);
  const body = same
    ? `${last.sets.length}×${first.reps} @ ${weight(first.weightLb)}`
    : last.sets.map((s) => `${s.reps}@${weight(s.weightLb)}`).join(", ");
  return `Last time (${shortDate(last.date)}): ${body}`;
}

/** Prefill: previous set this session, else last time's first set, else empty. */
export function nextSetDefaults(
  inSession: (LoggedSet & { setIndex: number })[],
  last: LastTime,
): { setIndex: number; reps: number | null; weightLb: number | null } {
  if (inSession.length) {
    const prev = inSession.reduce((a, b) => (b.setIndex > a.setIndex ? b : a));
    return { setIndex: prev.setIndex + 1, reps: prev.reps, weightLb: prev.weightLb };
  }
  const first = last?.sets[0];
  return { setIndex: 0, reps: first?.reps ?? null, weightLb: first?.weightLb ?? null };
}

const Uuid = z.uuid();

/**
 * The workout page's `?ex=` list: exercises picked but not logged yet. Accepts a comma list and
 * repeated params (the picker form sends the current list plus the new pick); invalid ids and
 * repeats are dropped.
 */
export function parseExList(raw: string | string[] | undefined): string[] {
  const parts = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw])
    .flatMap((p) => p.split(","))
    .map((p) => p.trim());
  return [...new Set(parts.filter((p) => Uuid.safeParse(p).success))];
}

/** The `?ex=` value with `id` added at the end (once). */
export function appendEx(list: string[], id: string): string {
  return (list.includes(id) ? list : [...list, id]).join(",");
}

/** One exercise card on the workout page; `planned` is today's prescription line for it, if any. */
export type Block = { exerciseId: string; name: string; planned: Prescription | null };

/** Cards in order: today's planned lifts, then exercises logged without a plan, then manual picks. */
export function workoutBlocks(
  planned: readonly (Prescription & { exerciseId: string })[],
  sets: readonly { exerciseId: string; exerciseName: string }[],
  picks: readonly { id: string; name: string }[],
): Block[] {
  const out: Block[] = [];
  const add = (exerciseId: string, name: string, p: Prescription | null) => {
    if (!out.some((b) => b.exerciseId === exerciseId)) out.push({ exerciseId, name, planned: p });
  };
  for (const { exerciseId, ...p } of planned) add(exerciseId, p.exercise, p);
  for (const s of sets) add(s.exerciseId, s.exerciseName, null);
  for (const p of picks) add(p.id, p.name, null);
  return out;
}

/** Entry rows to show: the planned sets not yet saved, and always at least one. */
export function plannedRowCount(planned: Prescription | null, savedSets: number): number {
  return planned ? Math.max(planned.sets - savedSets, 1) : 1;
}

/** "Target: 3 sets × 6–10 reps", or "× 20–40 sec" for a timed hold. */
export function targetLine(p: Prescription): string {
  const unit = /^Hold\b/.test(p.note) ? "sec" : "reps";
  return `Target: ${p.sets} ${p.sets === 1 ? "set" : "sets"} × ${p.repRange[0]}–${p.repRange[1]} ${unit}`;
}

/** "Strength · Compound", or just the category for non-lifts. */
export function tagLine(category: Category, pattern: Pattern | null): string {
  const label = CATEGORY_LABEL[category];
  return pattern ? `${label} · ${pattern === "compound" ? "Compound" : "Isolation"}` : label;
}

/**
 * The exercise picker's search: names where a word starts with the query come first, then
 * other names containing it, each alphabetical. An empty query keeps everything.
 */
export function filterExercises<E extends { name: string }>(all: readonly E[], query: string): E[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...all];
  const byName = (a: E, b: E) => a.name.localeCompare(b.name);
  const wordStart = (n: string) => n.toLowerCase().split(/[\s-]+/).some((w) => w.startsWith(q));
  const hits = all.filter((e) => e.name.toLowerCase().includes(q));
  return [...hits.filter((e) => wordStart(e.name)).sort(byName), ...hits.filter((e) => !wordStart(e.name)).sort(byName)];
}

/**
 * React key for an entry row. It changes only when the row's position or its carried values
 * change, so saving an earlier set doesn't remount a row that is mid-save or has typed values.
 */
export function setRowKey(exerciseId: string, setIndex: number, reps: number | null, weightLb: number | null): string {
  return `${exerciseId}-${setIndex}-${reps ?? "x"}-${weightLb ?? "bw"}`;
}
