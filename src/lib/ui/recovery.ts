export type Band = "good" | "caution" | "low";

/** WHOOP's recovery bands: 67+ green, 34–66 yellow, below 34 red. */
export function recoveryBand(score: number | null): Band | null {
  if (score === null || !Number.isFinite(score)) return null;
  if (score >= 67) return "good";
  if (score >= 34) return "caution";
  return "low";
}

/** Neutral words for each band, so the color is never the only signal. */
export const BAND_LABEL: Record<Band, string> = {
  good: "High Recovery",
  caution: "Moderate Recovery",
  low: "Low Recovery",
};
