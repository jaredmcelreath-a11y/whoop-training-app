/**
 * Turning what the owner pastes (a link, DOI or PubMed ID) into an identifier the app can look
 * up, and a study's type into an evidence badge on the Library's scale. Pure.
 */
import type { Evidence } from "@/lib/engine/rules/types";

export type SourceId = { kind: "doi"; doi: string } | { kind: "pmid"; pmid: string };

const DOI = /\b(10\.\d{4,9}\/\S+)/i;
/** Page names a publisher link can add after the DOI. */
const PAGE_SUFFIX = /(\/(fulltext|full|abstract|abs|pdf|epdf|html|references|figures)\/?|\.pdf)$/i;

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** In a link, only the path can hold the DOI: a query string or #fragment is never part of it. */
function doiHaystack(text: string): string {
  try {
    const u = new URL(text);
    return decode(u.pathname);
  } catch {
    return text;
  }
}

/** A DOI anywhere in the input wins; otherwise a PubMed link, "PMID 123", or a bare number. */
export function parseSourceId(input: string): SourceId | null {
  const text = decode(input.trim());
  const doi = DOI.exec(doiHaystack(text));
  if (doi) {
    let clean = doi[1].replace(/[?#].*$/, "").replace(/[.,;)\]”’"'>]+$/, "");
    while (PAGE_SUFFIX.test(clean)) clean = clean.replace(PAGE_SUFFIX, "");
    return { kind: "doi", doi: clean.toLowerCase() };
  }
  const pmid =
    /(?:pubmed\.ncbi\.nlm\.nih\.gov|ncbi\.nlm\.nih\.gov\/pubmed)\/(\d{1,9})/i.exec(text) ??
    /[?&]term=(\d{1,9})(?:&|$)/i.exec(text) ??
    /\bPMID:?\s*(\d{1,9})\b/i.exec(text) ??
    /^(\d{1,9})$/.exec(text);
  return pmid ? { kind: "pmid", pmid: pmid[1] } : null;
}

const CONSENSUS_TITLE = /position stand|consensus statement|consensus/i;

/** A PubMed record's publication types (and title) to a badge. */
export function evidenceFromPubTypes(types: readonly string[], title: string): Evidence | "context" {
  const t = types.map((x) => x.toLowerCase());
  // A preprint isn't peer reviewed yet, whatever kind of study it is.
  if (t.includes("preprint")) return "context";
  if (t.some((x) => x === "meta-analysis" || x === "systematic review")) return "meta-analysis";
  if (t.some((x) => x.includes("clinical trial") || x.includes("randomized controlled trial"))) return "trial";
  if (t.some((x) => x === "guideline" || x === "practice guideline" || x === "consensus development conference")) return "consensus";
  if (CONSENSUS_TITLE.test(title)) return "consensus";
  return "expert";
}

/** A Crossref work's type (and title) to a badge, for DOIs PubMed doesn't index. Preprints are context. */
export function evidenceFromCrossref(type: string, title: string): Evidence | "context" {
  if (type !== "journal-article") return "context";
  if (CONSENSUS_TITLE.test(title)) return "consensus";
  if (/meta-analy|systematic review/i.test(title)) return "meta-analysis";
  if (/randomi[sz]ed/i.test(title)) return "trial";
  return "expert";
}
