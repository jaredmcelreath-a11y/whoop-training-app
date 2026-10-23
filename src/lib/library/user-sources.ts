/**
 * The owner's own Library sources and the rule changes they propose. Stored apart from RULES:
 * nothing here changes a rule or its badge.
 */
import { and, asc, eq, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import { userSources } from "@/db/schema";
import { RULE_IDS } from "@/lib/engine/rules/catalog";
import type { LookedUp } from "./lookup";

export type Stance = "supports" | "contradicts" | "context";
export type UserSource = typeof userSources.$inferSelect;

const MAX_UNVERIFIED_TITLE = 200;

export async function addUserSource(
  db: Db,
  input: { ruleId: string; stance: Stance; note: string | null; propose: boolean; found: LookedUp | null; rawInput: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!(RULE_IDS as string[]).includes(input.ruleId)) return { ok: false, error: "Unknown rule" };
  const f = input.found;
  if (!f && input.propose) return { ok: false, error: "Only a verified study can propose a rule change" };
  if (f && (f.doi || f.pmid)) {
    const same = await db
      .select({ id: userSources.id })
      .from(userSources)
      .where(
        and(
          eq(userSources.ruleId, input.ruleId),
          or(f.doi ? eq(userSources.doi, f.doi) : undefined, f.pmid ? eq(userSources.pmid, f.pmid) : undefined),
        ),
      );
    if (same.length) return { ok: false, error: "Already added to this rule" };
  }
  const [row] = await db
    .insert(userSources)
    .values(
      f
        ? {
            ruleId: input.ruleId,
            title: f.title,
            authors: f.authors,
            venue: f.venue,
            year: f.year || null,
            url: f.url,
            doi: f.doi,
            pmid: f.pmid,
            evidence: f.evidence,
            verified: true,
            stance: input.stance,
            note: input.note,
            proposal: input.propose ? "open" : "none",
          }
        : {
            // Unverified: kept as a note to self, never as evidence.
            ruleId: input.ruleId,
            title: input.rawInput.trim().slice(0, MAX_UNVERIFIED_TITLE),
            url: /^https?:\/\//i.test(input.rawInput.trim()) ? input.rawInput.trim() : "",
            evidence: "context",
            verified: false,
            stance: "context",
            note: input.note,
          },
    )
    .returning({ id: userSources.id });
  return { ok: true, id: row.id };
}

/** Oldest first; all rules, or one. */
export async function listUserSources(db: Db, ruleId?: string): Promise<UserSource[]> {
  return db
    .select()
    .from(userSources)
    .where(ruleId ? eq(userSources.ruleId, ruleId) : undefined)
    .orderBy(asc(userSources.createdAt));
}

export async function openProposals(db: Db): Promise<UserSource[]> {
  return db.select().from(userSources).where(eq(userSources.proposal, "open")).orderBy(asc(userSources.createdAt));
}

/** Closes a proposal with what was decided. Resolving twice changes nothing. */
export async function resolveProposal(db: Db, id: string, resolution: string): Promise<"resolved" | "already" | "missing"> {
  const done = await db
    .update(userSources)
    .set({ proposal: "resolved", resolution, resolvedAt: new Date() })
    .where(and(eq(userSources.id, id), eq(userSources.proposal, "open")))
    .returning({ id: userSources.id });
  if (done.length) return "resolved";
  const [exists] = await db.select({ id: userSources.id }).from(userSources).where(eq(userSources.id, id));
  return exists ? "already" : "missing";
}

export async function deleteUserSource(db: Db, id: string): Promise<void> {
  await db.delete(userSources).where(eq(userSources.id, id));
}

const MAX_INPUT = 500;
const MAX_NOTE = 1000;
const STANCES: readonly Stance[] = ["supports", "contradicts", "context"];

/** The Library's "Add a Source" form, checked. */
export function parseAddSourceForm(
  fd: FormData,
): { ruleId: string; input: string; stance: Stance; note: string | null; propose: boolean } | { error: string } {
  const input = String(fd.get("input") ?? "").trim();
  const stance = String(fd.get("stance") ?? "") as Stance;
  const note = String(fd.get("note") ?? "").trim();
  if (!input) return { error: "Paste a link, DOI or PubMed ID." };
  if (input.length > MAX_INPUT) return { error: "That link is too long." };
  if (!STANCES.includes(stance)) return { error: "Pick whether it supports or contradicts the rule." };
  if (note.length > MAX_NOTE) return { error: "Keep the note under 1,000 characters." };
  return { ruleId: String(fd.get("ruleId") ?? ""), input, stance, note: note || null, propose: fd.get("propose") === "on" };
}
