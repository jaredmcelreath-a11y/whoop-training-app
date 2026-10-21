/** Pure display helpers for the strength screen. */

import { z } from "zod";

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
