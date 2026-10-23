import { describe, expect, it } from "vitest";
import { lookupSource, type Fetcher } from "./lookup";

// Invented metadata; the URLs are the real API shapes, but nothing here hits the network.
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function fake(routes: Record<string, () => Response>): { fetcher: Fetcher; urls: string[] } {
  const urls: string[] = [];
  const fetcher: Fetcher = async (url) => {
    urls.push(String(url));
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    return key ? routes[key]() : json({}, 404);
  };
  return { fetcher, urls };
}

const summary = (pmid: string, extra: Record<string, unknown> = {}) =>
  json({
    result: {
      uids: [pmid],
      [pmid]: {
        title: "An Invented Meta-Analysis of Training.",
        authors: [{ name: "Doe J" }, { name: "Roe R" }],
        source: "Invented J Sports",
        pubdate: "2024 Mar 3",
        pubtype: ["Journal Article", "Meta-Analysis"],
        articleids: [{ idtype: "doi", value: "10.9999/invented.1" }],
        ...extra,
      },
    },
  });

const crossref = (type = "journal-article", title = "Invented Training Outcomes in Athletes") =>
  json({
    message: {
      title: [title],
      author: [{ given: "Jane", family: "Doe" }, { given: "Rob", family: "Roe" }],
      "container-title": ["Invented Journal"],
      issued: { "date-parts": [[2023, 5]] },
      type,
    },
  });

describe("lookupSource", () => {
  it("reads a PubMed record", async () => {
    const { fetcher } = fake({ "esummary.fcgi": () => summary("123") });
    expect(await lookupSource({ kind: "pmid", pmid: "123" }, fetcher)).toEqual({
      title: "An Invented Meta-Analysis of Training",
      authors: "Doe J, Roe R",
      venue: "Invented J Sports",
      year: 2024,
      doi: "10.9999/invented.1",
      pmid: "123",
      url: "https://pubmed.ncbi.nlm.nih.gov/123/",
      evidence: "meta-analysis",
      verified: true,
    });
  });

  it("uses PubMed's study type for a DOI it indexes", async () => {
    const { fetcher } = fake({
      "api.crossref.org": () => crossref(),
      "esearch.fcgi": () => json({ esearchresult: { idlist: ["456"] } }),
      "esummary.fcgi": () => summary("456", { pubtype: ["Randomized Controlled Trial"] }),
    });
    const r = await lookupSource({ kind: "doi", doi: "10.9999/invented.2" }, fetcher);
    expect(r).toMatchObject({ verified: true, evidence: "trial", pmid: "456", doi: "10.9999/invented.2", url: "https://doi.org/10.9999/invented.2" });
  });

  it("verifies a DOI that only Crossref knows, badged from its type", async () => {
    const { fetcher } = fake({ "api.crossref.org": () => crossref(), "esearch.fcgi": () => json({ esearchresult: { idlist: [] } }) });
    expect(await lookupSource({ kind: "doi", doi: "10.9999/invented.3" }, fetcher)).toEqual({
      title: "Invented Training Outcomes in Athletes",
      authors: "Doe J, Roe R",
      venue: "Invented Journal",
      year: 2023,
      doi: "10.9999/invented.3",
      pmid: null,
      url: "https://doi.org/10.9999/invented.3",
      evidence: "expert",
      verified: true,
    });
  });

  it("reports a DOI nobody knows as not found", async () => {
    const { fetcher } = fake({});
    expect(await lookupSource({ kind: "doi", doi: "10.9999/nope" }, fetcher)).toEqual({ verified: false, reason: "not_found" });
  });

  it("reports a network failure as unavailable", async () => {
    const fetcher: Fetcher = async () => {
      throw new Error("offline");
    };
    expect(await lookupSource({ kind: "pmid", pmid: "1" }, fetcher)).toEqual({ verified: false, reason: "unavailable" });
  });

  it("shortens long author lists", async () => {
    const authors = Array.from({ length: 8 }, (_, i) => ({ name: `Author${i} A` }));
    const { fetcher } = fake({ "esummary.fcgi": () => summary("789", { authors }) });
    const r = await lookupSource({ kind: "pmid", pmid: "789" }, fetcher);
    expect(r).toMatchObject({ authors: "Author0 A, Author1 A, Author2 A, Author3 A, Author4 A, Author5 A, et al." });
  });

  it("only calls the two official services", async () => {
    const { fetcher, urls } = fake({ "api.crossref.org": () => crossref(), "esearch.fcgi": () => json({ esearchresult: { idlist: [] } }) });
    await lookupSource({ kind: "doi", doi: "10.9999/invented.4" }, fetcher);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u.startsWith("https://eutils.ncbi.nlm.nih.gov/") || u.startsWith("https://api.crossref.org/")).toBe(true);
  });

  it("keeps a preprint as context even when PubMed indexes it (review I2)", async () => {
    const { fetcher } = fake({
      "api.crossref.org": () => crossref("posted-content", "A Randomized Trial of Invented Things"),
      "esearch.fcgi": () => json({ esearchresult: { idlist: ["999"] } }),
      "esummary.fcgi": () => summary("999", { pubtype: ["Randomized Controlled Trial"] }),
    });
    expect(await lookupSource({ kind: "doi", doi: "10.1101/invented.5" }, fetcher)).toMatchObject({ verified: true, evidence: "context" });
  });
});
