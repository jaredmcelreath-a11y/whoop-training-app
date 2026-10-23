/**
 * Reads lab results out of recognized screenshot text or pasted text. Pure and tolerant: a known
 * marker name at the start of a line begins a result, its value is the first plausible number
 * after it (same line or the next few lines, never past the next marker), and a unit, reference
 * range and flag are picked up when present. Pasted text may also use "Marker: value unit".
 */
import { COMMON_MARKERS } from "./lab-markers";
import { parseLabPaste } from "./lab-paste";

export type ReadResult = { marker: string; value: number; unit: string; flag?: string; refRange?: string };
export type LabRead = { results: ReadResult[]; unread: string[]; drawnOn: string | null };

/** How many lines after a marker's name its value may sit on. */
const VALUE_WINDOW = 3;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * "25-OH Vitamin D" matches "25 oh vitamin-d" too: separators are optional, case ignored. The
 * name must start the line (after bullets), and must not run on into a compound name: "HDL" in
 * "Non-HDL" or "AST" in "AST/ALT Ratio" is not that marker.
 */
function nameRegex(alias: string): RegExp {
  const parts = alias.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(escape);
  return new RegExp(`^[^a-z0-9]*${parts.join("[^a-z0-9]*")}(?![a-z0-9])(?!\\s*/\\s*[a-z])`, "i");
}

type Matcher = { name: string; re: RegExp };

function matchers(known: readonly string[]): Matcher[] {
  const out: Matcher[] = [];
  for (const m of COMMON_MARKERS) for (const a of [m.name, ...m.aliases]) out.push({ name: m.name, re: nameRegex(a) });
  for (const k of known) if (k.trim()) out.push({ name: k.trim(), re: nameRegex(k) });
  return out;
}

/** The marker named at the start of the line (the longest name wins), and where it ends. */
function findName(line: string, ms: readonly Matcher[]): { name: string; end: number } | null {
  let best: { name: string; end: number } | null = null;
  for (const m of ms) {
    const hit = m.re.exec(line);
    if (hit && (!best || hit[0].length > best.end)) best = { name: m.name, end: hit[0].length };
  }
  return best;
}

const NUMBER = /([<>≤≥])?\s*(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)/g;
const RANGE = /(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)|([<>]=?|≤|≥)\s*(\d+(?:\.\d+)?)/g;
const FLAG = /\b(out of range|in range|high|low|optimal|normal|borderline)\b/i;
const REF_WORD = /\b(ref|reference|range)\b/i;
/** Words that can follow a value as its unit; any other plain word marks a count ("4 Biomarkers"). */
const UNIT_WORDS = new Set(["mmol", "nmol", "pmol", "umol", "µmol", "ratio", "units", "cells", "index", "sec", "secs", "mg", "ng", "pg", "ug", "µg", "iu", "miu", "fl", "pct"]);

const titleWords = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** A token that reads as a lab unit: "ng/mL", "%", "pg", "U/L", "x10E3/uL". */
function unitLike(token: string): boolean {
  if (FLAG.test(token)) return false;
  if (/[/%µμ]/.test(token)) return true;
  return /^[a-z]{1,5}$/i.test(token) && (token.length <= 3 || UNIT_WORDS.has(token.toLowerCase()));
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function realDate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** Every date in the text (ISO, US m/d/y, or "Mar 3, 2026") with its span. */
function dates(text: string): { date: string; start: number; end: number }[] {
  const found: { date: string; start: number; end: number }[] = [];
  const add = (m: RegExpMatchArray, d: string | null) => {
    if (d) found.push({ date: d, start: m.index!, end: m.index! + m[0].length });
  };
  for (const m of text.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) add(m, realDate(+m[1], +m[2], +m[3]));
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g)) add(m, realDate(+m[3], +m[1], +m[2]));
  for (const m of text.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})\b/gi))
    add(m, realDate(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2]));
  return found.sort((a, b) => a.start - b.start);
}

/**
 * The first number in a result's text that can be its value. Skipped: times ("9:41"), dates,
 * either end of a range ("30 - 400"), numbers on a reference line ("Ref < 1.0"), numbers glued
 * to a name ("D3", "25-OH"), and counts followed by a plain word ("4 Biomarkers").
 */
function findValue(text: string): { sign: string | undefined; value: number; start: number; end: number } | null {
  const spans = dates(text);
  for (const m of text.matchAll(NUMBER)) {
    const start = m.index!;
    const digits = start + m[0].indexOf(m[2]);
    const end = start + m[0].length;
    const before = text.slice(0, digits);
    const after = text.slice(end);
    const lineBefore = before.slice(before.lastIndexOf("\n") + 1);
    if (/[a-z]$/i.test(before) || /\d:$/.test(before) || /^:\d/.test(after)) continue;
    if (/^-[a-z]/i.test(after)) continue;
    if (spans.some((s) => digits >= s.start && digits < s.end)) continue;
    if (/^\s*[-–—]\s*\d/.test(after) || /\d\s*[-–—]\s*$/.test(before)) continue;
    if (REF_WORD.test(lineBefore)) continue;
    const word = /^\s*([a-z]+)\b/i.exec(after.split("\n")[0]);
    if (word && !unitLike(word[1]) && !FLAG.test(word[1])) continue;
    return { sign: m[1], value: Number(m[2].replace(/,/g, "")), start, end };
  }
  return null;
}

/**
 * One text's results. `loose` (pasted text) also accepts any "Marker: value unit" line and
 * reports lines it couldn't read; a screenshot reads only lines that start with a known marker,
 * so other screens add nothing.
 */
export function parseLabText(text: string, known: readonly string[], { loose = false }: { loose?: boolean } = {}): LabRead {
  const ms = matchers(known);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const byName = new Map<string, ReadResult>();
  const unread: string[] = [];
  const keep = (r: ReadResult) => {
    if (byName.has(r.marker)) unread.push(`Duplicate: ${r.marker}`);
    byName.set(r.marker, r);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const hit = findName(line, ms);
    if (!hit) {
      if (!loose || dates(line).length) continue;
      const pasted = parseLabPaste(line).parsed;
      if (pasted.length) pasted.forEach((p) => keep({ marker: p.marker, value: p.value, unit: p.unit }));
      // Only lines that look like a result are worth reporting; labels are not.
      else if (/\d/.test(line) && /[a-z]/i.test(line)) unread.push(line);
      continue;
    }

    // The result's lines: the rest of this line, then up to VALUE_WINDOW lines before the next name.
    const seg = [line.slice(hit.end)];
    let last = i;
    for (let j = i + 1; j < lines.length && j <= i + VALUE_WINDOW && !findName(lines[j], ms); j++) {
      seg.push(lines[j]);
      last = j;
    }
    const joined = seg.join("\n");
    const v = findValue(joined);
    if (!v) {
      unread.push(line);
      continue;
    }
    // The unit follows the value on its line, or sits alone on the next line.
    const rest = joined.slice(v.end).split("\n");
    const sameLine = /^\s*(\S+)/.exec(rest[0])?.[1];
    const nextLine = rest.length > 1 && rest[0].trim() === "" ? rest[1].trim() : "";
    const unit = sameLine && unitLike(sameLine) ? sameLine : unitLike(nextLine) ? nextLine : "";
    const range = [...joined.matchAll(RANGE)].find((m) => m.index! + m[0].length <= v.start || m.index! >= v.end);
    const word = FLAG.exec(joined);
    const r: ReadResult = { marker: hit.name, value: v.value, unit };
    if (v.sign) r.flag = `${v.sign === "<" || v.sign === "≤" ? "Below" : "Above"} ${v.value}`;
    else if (word) r.flag = titleWords(word[1]);
    if (range) r.refRange = range[1] !== undefined ? `${range[1]}–${range[2]}` : `${range[3]}${range[4]}`;
    keep(r);
    i = last;
  }
  return { results: [...byName.values()], unread, drawnOn: dates(text)[0]?.date ?? null };
}

/**
 * Several screenshots, each read on its own (so a value cut off at the bottom of one never
 * pairs with the next one's status bar), merged: a marker seen again keeps the later value and
 * is noted; the draw date is the first one found.
 */
export function parseLabTexts(texts: readonly string[], known: readonly string[]): LabRead {
  const byName = new Map<string, ReadResult>();
  const unread: string[] = [];
  let drawnOn: string | null = null;
  for (const t of texts) {
    const r = parseLabText(t, known);
    for (const x of r.results) {
      if (byName.has(x.marker)) unread.push(`Duplicate: ${x.marker}`);
      byName.set(x.marker, x);
    }
    unread.push(...r.unread);
    drawnOn ??= r.drawnOn;
  }
  return { results: [...byName.values()], unread, drawnOn };
}
