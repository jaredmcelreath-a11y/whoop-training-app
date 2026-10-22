/** "07:10" → "7:10 AM", "22:15" → "10:15 PM". */
export function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Rewrites each 24-hour "HH:MM" in a sentence as a 12-hour time. */
export const withClock12 = (text: string): string =>
  text.replace(/\b([01]\d|2[0-3]):([0-5]\d)\b/g, (t) => clock12(t));
