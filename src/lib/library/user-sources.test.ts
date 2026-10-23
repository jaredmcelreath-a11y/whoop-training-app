import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { userSources } from "@/db/schema";
import type { LookedUp } from "./lookup";
import { addUserSource, deleteUserSource, listUserSources, openProposals, parseAddSourceForm, resolveProposal } from "./user-sources";

// Invented study metadata.
const found = (doi = "10.9999/invented.1"): LookedUp => ({
  title: "An Invented Trial",
  authors: "Doe J",
  venue: "Invented J",
  year: 2024,
  doi,
  pmid: null,
  url: `https://doi.org/${doi}`,
  evidence: "trial",
  verified: true,
});
const base = { ruleId: "strength.repRange", stance: "supports" as const, note: "Try 8-12", propose: false, rawInput: "doi:10.9999/invented.1" };

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await db.delete(userSources);
});

describe("addUserSource", () => {
  it("saves a verified source, with an open proposal when asked", async () => {
    const r = await addUserSource(db, { ...base, propose: true, found: found() });
    expect(r.ok).toBe(true);
    const [row] = await listUserSources(db, "strength.repRange");
    expect(row).toMatchObject({ title: "An Invented Trial", evidence: "trial", verified: true, stance: "supports", proposal: "open", note: "Try 8-12" });
    expect((await openProposals(db)).map((p) => p.title)).toEqual(["An Invented Trial"]);
  });

  it("refuses a rule that doesn't exist", async () => {
    expect(await addUserSource(db, { ...base, ruleId: "made.up", found: found() })).toEqual({ ok: false, error: "Unknown rule" });
  });

  it("keeps an unverifiable source as context only, and can't propose from it", async () => {
    expect(await addUserSource(db, { ...base, propose: true, found: null, rawInput: "a blog post" })).toEqual({
      ok: false,
      error: "Only a verified study can propose a rule change",
    });
    const r = await addUserSource(db, { ...base, stance: "contradicts", found: null, rawInput: "a blog post" });
    expect(r.ok).toBe(true);
    expect((await listUserSources(db))[0]).toMatchObject({ title: "a blog post", stance: "context", evidence: "context", verified: false, proposal: "none" });
  });

  it("refuses the same study twice on one rule, allows it on another", async () => {
    await addUserSource(db, { ...base, found: found() });
    expect(await addUserSource(db, { ...base, found: found() })).toEqual({ ok: false, error: "Already added to this rule" });
    expect((await addUserSource(db, { ...base, ruleId: "strength.volume", found: found() })).ok).toBe(true);
  });
});

describe("proposals", () => {
  it("resolves once, keeps the reason, and reports a repeat", async () => {
    const r = await addUserSource(db, { ...base, propose: true, found: found() });
    if (!r.ok) throw new Error(r.error);
    expect(await resolveProposal(db, r.id, "Range kept; study used untrained people")).toBe("resolved");
    expect(await resolveProposal(db, r.id, "again")).toBe("already");
    expect((await listUserSources(db))[0]).toMatchObject({ proposal: "resolved", resolution: "Range kept; study used untrained people" });
    expect(await openProposals(db)).toEqual([]);
    expect(await resolveProposal(db, "00000000-0000-4000-8000-000000000000", "x")).toBe("missing");
  });

  it("deletes a source", async () => {
    const r = await addUserSource(db, { ...base, found: found() });
    if (!r.ok) throw new Error(r.error);
    await deleteUserSource(db, r.id);
    expect(await listUserSources(db)).toEqual([]);
  });
});

describe("parseAddSourceForm", () => {
  const form = (fields: Record<string, string>) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  };
  it("reads a complete form", () => {
    expect(parseAddSourceForm(form({ ruleId: "strength.repRange", input: " doi:10.1/x ", stance: "contradicts", note: "", propose: "on" }))).toEqual({
      ruleId: "strength.repRange",
      input: "doi:10.1/x",
      stance: "contradicts",
      note: null,
      propose: true,
    });
  });
  it("needs a link or ID, and a known stance", () => {
    expect(parseAddSourceForm(form({ ruleId: "x", input: "  ", stance: "supports" }))).toHaveProperty("error");
    expect(parseAddSourceForm(form({ ruleId: "x", input: "123", stance: "maybe" }))).toHaveProperty("error");
  });
  it("caps the note", () => {
    expect(parseAddSourceForm(form({ ruleId: "x", input: "123", stance: "supports", note: "n".repeat(1001) }))).toHaveProperty("error");
    expect(parseAddSourceForm(form({ ruleId: "x", input: "123", stance: "supports" }))).toMatchObject({ propose: false });
  });
});
