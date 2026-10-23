import { describe, expect, it } from "vitest";
import { evidenceFromCrossref, evidenceFromPubTypes, parseSourceId } from "./source-id";

describe("parseSourceId", () => {
  it.each([
    ["https://doi.org/10.1249/MSS.0000000000002585", { kind: "doi", doi: "10.1249/mss.0000000000002585" }],
    ["doi: 10.7717/peerj.14142.", { kind: "doi", doi: "10.7717/peerj.14142" }],
    ["https://journals.example.org/article/10.1007/s40279-022-01784-y/fulltext", { kind: "doi", doi: "10.1007/s40279-022-01784-y" }],
    ["https://pubmed.ncbi.nlm.nih.gov/36334240/", { kind: "pmid", pmid: "36334240" }],
    ["PMID: 36199287", { kind: "pmid", pmid: "36199287" }],
    ["36199287", { kind: "pmid", pmid: "36199287" }],
  ])("%s", (input, id) => expect(parseSourceId(input)).toEqual(id));

  it("finds nothing in plain text", () => {
    expect(parseSourceId("a blog post")).toBeNull();
    expect(parseSourceId("")).toBeNull();
  });

  it("prefers the DOI when both are present", () => {
    expect(parseSourceId("PMID 36199287 doi:10.7717/peerj.14142")).toEqual({ kind: "doi", doi: "10.7717/peerj.14142" });
  });
});

describe("evidenceFromPubTypes", () => {
  it("maps PubMed study types to badges", () => {
    expect(evidenceFromPubTypes(["Journal Article", "Meta-Analysis"], "x")).toBe("meta-analysis");
    expect(evidenceFromPubTypes(["Systematic Review"], "x")).toBe("meta-analysis");
    expect(evidenceFromPubTypes(["Randomized Controlled Trial"], "x")).toBe("trial");
    expect(evidenceFromPubTypes(["Clinical Trial, Phase II"], "x")).toBe("trial");
    expect(evidenceFromPubTypes(["Practice Guideline"], "x")).toBe("consensus");
    expect(evidenceFromPubTypes(["Journal Article"], "ACSM Position Stand on Something")).toBe("consensus");
    expect(evidenceFromPubTypes(["Journal Article"], "An invented observation")).toBe("expert");
  });
});

describe("evidenceFromCrossref", () => {
  it("maps Crossref types and titles to badges", () => {
    expect(evidenceFromCrossref("posted-content", "A Meta-Analysis of Things")).toBe("context");
    expect(evidenceFromCrossref("journal-article", "A Systematic Review and Meta-Analysis of Things")).toBe("meta-analysis");
    expect(evidenceFromCrossref("journal-article", "A Randomized Trial of Things")).toBe("trial");
    expect(evidenceFromCrossref("journal-article", "Consensus Statement on Things")).toBe("consensus");
    expect(evidenceFromCrossref("journal-article", "Things in Athletes")).toBe("expert");
    expect(evidenceFromCrossref("book-chapter", "Things")).toBe("context");
  });
});

describe("parseSourceId: publisher links (review I1)", () => {
  it.each([
    ["https://www.tandfonline.com/doi/abs/10.1080/02640414.2019.1645265?journalCode=rjsp20", { kind: "doi", doi: "10.1080/02640414.2019.1645265" }],
    ["https://onlinelibrary.wiley.com/doi/full/10.1111/sms.13456#sec1", { kind: "doi", doi: "10.1111/sms.13456" }],
    ["https://journals.physiology.org/doi/pdf/10.1152/japplphysiol.00001.2019?download=true", { kind: "doi", doi: "10.1152/japplphysiol.00001.2019" }],
    ["https://link.springer.com/content/pdf/10.1007/s40279-019-01147-0.pdf", { kind: "doi", doi: "10.1007/s40279-019-01147-0" }],
    ["https://doi.org/10.1234/ABC/full/html", { kind: "doi", doi: "10.1234/abc" }],
    ["“10.1249/MSS.0000000000002585”", { kind: "doi", doi: "10.1249/mss.0000000000002585" }],
    ["https://doi.org/10.1016%2FS0140-6736(20)30183-5", { kind: "doi", doi: "10.1016/s0140-6736(20)30183-5" }],
    ["https://www.ncbi.nlm.nih.gov/pubmed/36334240", { kind: "pmid", pmid: "36334240" }],
    ["https://pubmed.ncbi.nlm.nih.gov/?term=36334240", { kind: "pmid", pmid: "36334240" }],
  ])("%s", (input, id) => expect(parseSourceId(input)).toEqual(id));
});

describe("preprints stay context (review I2)", () => {
  it("treats a PubMed preprint as context", () => {
    expect(evidenceFromPubTypes(["Preprint"], "A Randomized Trial of Things")).toBe("context");
  });
});
