import type { ReadResult } from "./lab-text";

/** One editable row in the lab form (all text, as typed). */
export type FormRow = { key: number; marker: string; value: string; unit: string; flag: string; refRange: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Adds read results to the form's rows for review: blank rows go, a result for a marker already
 * on screen updates that row in place (keeping its name as typed), and new markers are appended.
 */
export function mergeRows(existing: readonly FormRow[], read: readonly ReadResult[], nextKey: () => number): FormRow[] {
  const rows = existing.filter((r) => r.marker || r.value || r.unit);
  for (const r of read) {
    const fields = { value: String(r.value), unit: r.unit, flag: r.flag ?? "", refRange: r.refRange ?? "" };
    const at = rows.findIndex((x) => norm(x.marker) === norm(r.marker));
    if (at >= 0) rows[at] = { ...rows[at], ...fields };
    else rows.push({ key: nextKey(), marker: r.marker, ...fields });
  }
  return rows;
}
