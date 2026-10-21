/** Tiny markdown block parser for the bundled setup guide. Pure; handles only what the guide uses. */
export type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "para"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; start: number; items: string[] }
  | { type: "code"; text: string }
  | { type: "table"; head: string[]; rows: string[][] };

const cells = (l: string) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function parseGuide(md: string): Block[] {
  const lines = md.split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.trim() === "") { i++; continue; }
    if (l.startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) buf.push(lines[i++]);
      i++;
      out.push({ type: "code", text: buf.join("\n") });
      continue;
    }
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) { out.push({ type: "heading", level: h[1].length, text: h[2] }); i++; continue; }
    if (l.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(cells(lines[i++]));
      out.push({ type: "table", head: rows[0], rows: rows.slice(2) });
      continue;
    }
    if (/^\s*- /.test(l)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("```")) {
        if (/^\s*- /.test(lines[i])) items.push(lines[i].replace(/^\s*- /, ""));
        else if (items.length) items[items.length - 1] += " " + lines[i].trim();
        i++;
      }
      out.push({ type: "ul", items });
      continue;
    }
    if (/^\d+\.\s/.test(l)) {
      const items: string[] = [];
      const start = Number(l.match(/^(\d+)\./)![1]);
      // Numbered steps may be followed by indented sub-lists; fold those into the step text.
      while (i < lines.length && lines[i].trim() !== "" ) {
        if (/^\d+\.\s/.test(lines[i])) items.push(lines[i].replace(/^\d+\.\s/, ""));
        else if (items.length) items[items.length - 1] += " " + lines[i].trim().replace(/^- /, "• ");
        i++;
      }
      out.push({ type: "ol", start, items });
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() !== "" && !lines[i].startsWith("```") && !/^(#|\||- |\d+\.\s)/.test(lines[i])) buf.push(lines[i++].trim());
    out.push({ type: "para", text: buf.join(" ") });
  }
  return out;
}

/** Splits text on `code` and **bold** spans. */
export function inlineParts(text: string): { kind: "text" | "code" | "bold"; text: string }[] {
  const parts: { kind: "text" | "code" | "bold"; text: string }[] = [];
  for (const seg of text.split(/(`[^`]+`|\*\*[^*]+\*\*)/)) {
    if (!seg) continue;
    if (seg.startsWith("`")) parts.push({ kind: "code", text: seg.slice(1, -1) });
    else if (seg.startsWith("**")) parts.push({ kind: "bold", text: seg.slice(2, -2) });
    else parts.push({ kind: "text", text: seg });
  }
  return parts;
}
