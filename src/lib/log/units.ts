export type Unit = "yd" | "m" | "mi" | "km";

export const METERS_PER_YARD = 0.9144;
export const METERS_PER_MILE = 1609.344;

const METERS_PER: Record<Unit, number> = {
  yd: METERS_PER_YARD,
  m: 1,
  mi: METERS_PER_MILE,
  km: 1000,
};

export function toMeters(value: number, unit: Unit): number {
  return value * METERS_PER[unit];
}

export function fromMeters(m: number, unit: Unit): number {
  return m / METERS_PER[unit];
}

/** Trimmed, '.'-decimal only. Empty -> null; anything unparseable (e.g. "1,5") -> NaN. */
export function parseNumber(raw: FormDataEntryValue | null): number | null {
  if (raw === null || typeof raw !== "string") return null;
  const s = raw.trim();
  if (s === "") return null;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
  return Number(s);
}
