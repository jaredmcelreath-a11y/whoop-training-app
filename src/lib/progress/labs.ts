/** Pure lab-marker helpers. No database or framework imports. */
import type { Point } from "./series";

export type MarkerReading = { drawnOn: string; value: number; unit: string };

const unitKey = (u: string) => u.trim().toLowerCase();

/**
 * Splits a date-ordered marker history by unit. The chart shows the latest reading's unit
 * (compared case- and whitespace-insensitively); earlier readings in other units are only counted.
 */
export function unitSplit(history: MarkerReading[]): {
  unit: string;
  points: Point[];
  otherUnits: { unit: string; count: number }[];
} {
  if (history.length === 0) return { unit: "", points: [], otherUnits: [] };
  const latest = history[history.length - 1];
  const key = unitKey(latest.unit);
  const points: Point[] = [];
  const others = new Map<string, { unit: string; count: number }>();
  for (const r of history) {
    if (unitKey(r.unit) === key) {
      points.push({ date: r.drawnOn, value: r.value });
      continue;
    }
    const k = unitKey(r.unit);
    const o = others.get(k);
    if (o) o.count += 1;
    else others.set(k, { unit: r.unit.trim(), count: 1 });
  }
  return { unit: latest.unit.trim(), points, otherUnits: [...others.values()] };
}
