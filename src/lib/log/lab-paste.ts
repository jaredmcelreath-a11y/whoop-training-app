export type PastedResult = { marker: string; value: number; unit: string };

const LINE = /^([A-Za-z].*?)\s*:?\s+(-?\d+(?:\.\d+)?)\s+(\S.*)$/;

/** Parses "Marker: value unit" lines. Blank lines are ignored; others that fail go to `unparsed`. */
export function parseLabPaste(text: string): {
  parsed: PastedResult[];
  unparsed: string[];
} {
  const parsed: PastedResult[] = [];
  const unparsed: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = LINE.exec(line);
    if (!m) {
      unparsed.push(line);
      continue;
    }
    parsed.push({
      marker: m[1].trim(),
      value: Number(m[2]),
      unit: m[3].trim(),
    });
  }
  return { parsed, unparsed };
}
