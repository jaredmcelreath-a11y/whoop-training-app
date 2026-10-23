/**
 * Checks a source against the free official research indexes: NCBI E-utilities (PubMed) and the
 * Crossref works API. No keys. Each request gives up after LOOKUP_TIMEOUT_MS. `fetcher` is
 * injectable so tests never touch the network.
 */
import type { Evidence } from "@/lib/engine/rules/types";
import { evidenceFromCrossref, evidenceFromPubTypes, type SourceId } from "./source-id";

export type LookedUp = {
  title: string;
  authors: string;
  venue: string;
  year: number;
  doi: string | null;
  pmid: string | null;
  url: string;
  evidence: Evidence | "context";
  verified: true;
};
export type LookupFailure = { verified: false; reason: "not_found" | "unavailable" };
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const CROSSREF = "https://api.crossref.org/works";
const LOOKUP_TIMEOUT_MS = 8000;
const MAX_AUTHORS = 6;
const HEADERS = { "User-Agent": "Seventy3/1.0 (personal training app)" };

class NotFound extends Error {}

async function getJson(fetcher: Fetcher, url: string): Promise<Record<string, unknown>> {
  const res = await fetcher(url, { headers: HEADERS, signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
  if (res.status === 404) throw new NotFound();
  if (!res.ok) throw new Error(`lookup ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

const authorList = (names: string[]) =>
  names.length > MAX_AUTHORS ? `${names.slice(0, MAX_AUTHORS).join(", ")}, et al.` : names.join(", ");
const cleanTitle = (t: string) => t.trim().replace(/\.$/, "");

type Summary = {
  title?: string;
  authors?: { name: string }[];
  source?: string;
  pubdate?: string;
  pubtype?: string[];
  articleids?: { idtype: string; value: string }[];
};

async function pubmedSummary(fetcher: Fetcher, pmid: string): Promise<Summary> {
  const data = await getJson(fetcher, `${EUTILS}/esummary.fcgi?db=pubmed&retmode=json&id=${encodeURIComponent(pmid)}`);
  const rec = (data.result as Record<string, Summary> | undefined)?.[pmid];
  if (!rec || !rec.title) throw new NotFound();
  return rec;
}

async function byPmid(fetcher: Fetcher, pmid: string): Promise<LookedUp> {
  const s = await pubmedSummary(fetcher, pmid);
  const title = cleanTitle(s.title ?? "");
  return {
    title,
    authors: authorList((s.authors ?? []).map((a) => a.name)),
    venue: s.source ?? "",
    year: Number(/\d{4}/.exec(s.pubdate ?? "")?.[0] ?? 0),
    doi: s.articleids?.find((a) => a.idtype === "doi")?.value.toLowerCase() ?? null,
    pmid,
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    evidence: evidenceFromPubTypes(s.pubtype ?? [], title),
    verified: true,
  };
}

type Work = {
  title?: string[];
  author?: { given?: string; family?: string; name?: string }[];
  "container-title"?: string[];
  issued?: { "date-parts"?: number[][] };
  type?: string;
};

async function byDoi(fetcher: Fetcher, doi: string): Promise<LookedUp> {
  const mailto = process.env.CROSSREF_MAILTO ? `?mailto=${encodeURIComponent(process.env.CROSSREF_MAILTO)}` : "";
  const data = await getJson(fetcher, `${CROSSREF}/${encodeURIComponent(doi)}${mailto}`);
  const w = (data.message ?? {}) as Work;
  const title = cleanTitle(w.title?.[0] ?? "");
  if (!title) throw new NotFound();
  const authors = (w.author ?? []).map((a) => (a.family ? `${a.family}${a.given ? ` ${a.given[0]}` : ""}` : (a.name ?? ""))).filter(Boolean);
  // PubMed's study types are more specific than Crossref's, when it indexes the DOI.
  const search = await getJson(fetcher, `${EUTILS}/esearch.fcgi?db=pubmed&retmode=json&term=${encodeURIComponent(`${doi}[doi]`)}`);
  const ids = ((search.esearchresult as { idlist?: string[] } | undefined)?.idlist ?? []) as string[];
  let pmid: string | null = null;
  let evidence = evidenceFromCrossref(w.type ?? "", title);
  if (ids.length === 1) {
    pmid = ids[0];
    // PubMed refines a journal article's badge; anything else (a preprint) stays context.
    if (w.type === "journal-article") evidence = evidenceFromPubTypes((await pubmedSummary(fetcher, pmid)).pubtype ?? [], title);
  }
  return {
    title,
    authors: authorList(authors),
    venue: w["container-title"]?.[0] ?? "",
    year: w.issued?.["date-parts"]?.[0]?.[0] ?? 0,
    doi,
    pmid,
    url: `https://doi.org/${doi}`,
    evidence,
    verified: true,
  };
}

export async function lookupSource(id: SourceId, fetcher: Fetcher = fetch): Promise<LookedUp | LookupFailure> {
  try {
    return id.kind === "pmid" ? await byPmid(fetcher, id.pmid) : await byDoi(fetcher, id.doi);
  } catch (err) {
    return { verified: false, reason: err instanceof NotFound ? "not_found" : "unavailable" };
  }
}
