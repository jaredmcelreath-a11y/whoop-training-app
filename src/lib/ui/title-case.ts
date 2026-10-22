/** Words lowercased in a title unless first or last. */
export const SMALL_WORDS = ["a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "vs"];

/** Acronyms and units written exactly this way wherever they appear. */
export const KEEP = [
  "Z1", "Z2", "Z3", "Z4", "Z5", "HRV", "RHR", "VO2", "WHOOP",
  "kcal", "lb", "oz", "g", "mL", "min", "h", "km", "mi", "yd", "m", "AM", "PM", "n-of-1", "iPhone", "iOS",
];

const KEEP_BY_LOWER = new Map(KEEP.map((k) => [k.toLowerCase(), k]));
const SMALL = new Set(SMALL_WORDS);

function casePart(part: string, edge: boolean): string {
  if (part === "" || /^\d/.test(part)) return part;
  const kept = KEEP_BY_LOWER.get(part.toLowerCase());
  if (kept) return kept;
  // Leading punctuation, as in "(advanced)": case the first letter after it.
  const [, lead, rest] = part.match(/^([^A-Za-z\d]*)([\s\S]*)$/) ?? ["", "", part];
  if (rest === "") return part;
  const restKept = KEEP_BY_LOWER.get(rest.toLowerCase());
  if (restKept) return lead + restKept;
  if (!edge && lead === "" && SMALL.has(rest.toLowerCase())) return rest.toLowerCase();
  return lead + rest[0].toUpperCase() + rest.slice(1);
}

/** Title Case for display titles (session names, headings). Leaves sentences and quoted titles to the caller. */
export function titleCase(s: string): string {
  const tokens = s.split(/(\s+)/);
  const wordIdx = tokens.map((t, i) => (/\S/.test(t) ? i : -1)).filter((i) => i >= 0);
  const first = wordIdx[0];
  const last = wordIdx[wordIdx.length - 1];
  // A word right after a colon starts a subtitle, so it is capitalized like a first word.
  const afterColon = new Set(wordIdx.filter((_, k) => k > 0 && tokens[wordIdx[k - 1]].endsWith(":")));
  return tokens
    .map((t, i) => {
      if (!/\S/.test(t)) return t;
      const kept = KEEP_BY_LOWER.get(t.toLowerCase());
      const edge = i === first || i === last || afterColon.has(i);
      return kept ?? t.split("-").map((p) => casePart(p, edge)).join("-");
    })
    .join("");
}
