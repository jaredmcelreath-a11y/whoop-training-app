# Plan 12: User-Added Library Sources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship section 5 of the Plan 9 design: the owner adds a source to a rule by link, DOI or PubMed ID.
- The app checks it against PubMed and Crossref and sets its evidence badge from the study type.
- The source shows on that rule as "Added by You".
- A verified source can propose a rule change. Proposals wait in "Proposed Changes" until a Claude Code session resolves them with `scripts/proposals.ts`.
- The app never edits `RULES`.

**Architecture:**
- **Pure parsing:** turning input into an identifier, and a study type into a badge.
- **Lookups:** a fetch-injected lookup layer for NCBI E-utilities (`esearch` and `esummary`, JSON) and the Crossref works API.
- **Storage:** a `user_sources` table (migration 0010), with proposal fields.
- **UI:** a server action and Library UI.
- **CLI:** a small script for sessions.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` before using a Next API), TypeScript, Drizzle with PGlite and Neon, zod 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-22-plan9-owner-features-design.md`, section 5 and the Library sources items under "Calls Made After the Builder Check".

**Base:** branch `feat/plan12` from `feat/plan11`. Plan 11 adds migration 0009, so this plan's is 0010.

## Global Constraints

- **The app never changes `RULES`.** User sources live in the DB and never count toward a rule's badge.
- **Badges from type:**
  - meta-analysis or systematic review → `meta-analysis`;
  - randomized or controlled trial (any clinical-trial type) → `trial`;
  - guideline, practice guideline or consensus statement (or a title containing "position stand" or "consensus") → `consensus`;
  - another peer-reviewed journal article → `expert`.
- **Context only:** a Crossref `posted-content` (preprint) is `context`. Anything that can't be looked up is "context", is unverified, and can't propose a change.
- **Lookups:**
  - server-side only, in a session-protected server action;
  - an 8 s timeout per request;
  - no API keys;
  - a descriptive `User-Agent` / `mailto` for Crossref, which holds no personal email: use `mailto=` only if `CROSSREF_MAILTO` is set.
- **Tests never hit the network.** Fetch is injected, and fixtures hold invented metadata.
- **UI rules:** theme tokens, Title Case labels, at least 44 px targets, and no sideways scroll at 375 px.
- **Migration 0010 is additive.** Apply it to Neon before deploy.
- **Node:** `export PATH="$HOME/.local/node/bin:$PATH"`.

## Review Focus

1. **A pasted pubmed.ncbi.nlm.nih.gov URL, a doi.org URL, "doi: 10.x/…", a bare PMID, and a journal URL with a DOI in its path.** Expected: each resolves to the right identifier.
2. **PubMed or Crossref is down or slow.** Expected: the add fails with a clear message, nothing is saved, and the page doesn't hang more than about 8 s per lookup.
3. **A DOI found in Crossref but not PubMed.** Expected: verified. Its badge comes from the Crossref type and title ("expert" for a journal article), not "context".
4. **A rule id that isn't in `RULES`** (a crafted form post). Expected: refused.
5. **A proposal resolved twice by the script.** Expected: the second run reports that it is already resolved and changes nothing.

---

### Task 1: Identifiers and badges

**Files:**
- Create: `src/lib/library/source-id.ts` and `src/lib/library/source-id.test.ts`.

**Interfaces:**
- Produces:
  - `export type SourceId = { kind: "doi"; doi: string } | { kind: "pmid"; pmid: string }`.
  - `export function parseSourceId(input: string): SourceId | null`.
    - A DOI is `10.\d{4,9}/\S+`, lowercased, with trailing punctuation `.,;)` trimmed, found anywhere in the input. That covers `https://doi.org/…`, `doi:…`, a bare DOI, and publisher URLs containing `/10.xxxx/…`.
    - A PMID is `pubmed.ncbi.nlm.nih.gov/(\d{1,9})`, `PMID:? ?(\d{1,9})`, or an input of only 1–9 digits.
    - A DOI wins when both are present.
  - `export function evidenceFromPubTypes(types: readonly string[], title: string): Evidence | "context"`. It is case-insensitive:
    - "Meta-Analysis" or "Systematic Review" gives meta-analysis;
    - any type containing "Clinical Trial" or "Randomized Controlled Trial" gives trial;
    - "Guideline", "Practice Guideline" or "Consensus Development Conference", or a title matching `/position stand|consensus statement/i`, gives consensus;
    - otherwise expert.
  - `export function evidenceFromCrossref(type: string, title: string): Evidence | "context"`:
    - `posted-content` gives context;
    - `journal-article` gives the title rules above (position stand, consensus, then a title with "meta-analysis" or "systematic review" gives meta-analysis, "randomized" gives trial), else expert;
    - any other type gives context.

- [ ] **Step 1: Write failing tests:**
  - **Inputs and their identifiers:**
    - `"https://doi.org/10.1249/MSS.0000000000002585"` gives doi `10.1249/mss.0000000000002585`;
    - `"doi: 10.7717/peerj.14142."` gives doi `10.7717/peerj.14142`;
    - `"https://journals.example.org/article/10.1007/s40279-022-01784-y/fulltext"` gives that DOI;
    - `"https://pubmed.ncbi.nlm.nih.gov/36334240/"` gives pmid 36334240;
    - `"PMID: 36199287"` gives a pmid;
    - `"36199287"` gives a pmid;
    - `"a blog post"` gives null.
  - **Badges, each rule above:** for example `["Journal Article","Meta-Analysis"]` gives meta-analysis; `["Randomized Controlled Trial"]` gives trial; `["Journal Article"]` with title "…Position Stand…" gives consensus; `["Journal Article"]` gives expert.
  - **Crossref:** `("posted-content", …)` gives context; `("journal-article", "A Systematic Review and Meta-Analysis of …")` gives meta-analysis; `("book-chapter", …)` gives context.
- [ ] **Step 2: Run** `npx vitest run src/lib/library/source-id.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(library): source identifiers and evidence from study type`.

### Task 2: Lookup against PubMed and Crossref

**Files:**
- Create: `src/lib/library/lookup.ts` and `src/lib/library/lookup.test.ts`.

**Interfaces:**
- Consumes: `SourceId`, `evidenceFromPubTypes`, `evidenceFromCrossref` (Task 1).
- Produces:
  - `export type LookedUp = { title: string; authors: string; venue: string; year: number; doi: string | null; pmid: string | null; url: string; evidence: Evidence | "context"; verified: true }`.
  - `export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>`.
  - `export async function lookupSource(id: SourceId, fetcher: Fetcher = fetch): Promise<LookedUp | { verified: false; reason: "not_found" | "unavailable" }>`.
    - **PMID:**
      - `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=<pmid>` gives `result[pmid]`.
      - From it: `title`, `authors[].name` (first 6 joined with ", ", plus ", et al." past 6), `source` as the venue, the year from `pubdate`, `pubtype[]` for the badge, and the DOI from `articleids` where `idtype === "doi"`.
      - The url is `https://pubmed.ncbi.nlm.nih.gov/<pmid>/`.
    - **DOI:**
      - First Crossref: `https://api.crossref.org/works/<encodeURIComponent(doi)>` gives `message`. From it: `title[0]`, `author[]` (`family` + initial of `given`), `container-title[0]` as the venue, the year from `issued.date-parts[0][0]`, and `type`.
      - Then PubMed `esearch.fcgi?db=pubmed&retmode=json&term=<doi>[doi]`. If exactly one id comes back, take its `esummary` pubtypes for the badge, since they are more specific. Otherwise use `evidenceFromCrossref`.
      - The url is `https://doi.org/<doi>`.
    - **Failures:**
      - A 404 or empty result gives `not_found`.
      - A network error, a timeout (`AbortSignal.timeout(8000)` on each request) or a non-404 error gives `unavailable`.
    - **Crossref request headers:** `User-Agent: Seventy3/1.0 (personal training app)`. Append `?mailto=<CROSSREF_MAILTO>` only when that env var is set.

- [ ] **Step 1: Write failing tests** with a fake `Fetcher` that maps URLs to invented JSON responses:
  - a PMID lookup gives the title, venue, year, DOI and the badge from `pubtype`;
  - a DOI found in Crossref and in PubMed gives the PubMed badge;
  - a DOI found in Crossref only (esearch count 0) gives `verified: true` with the Crossref-type badge (Review Focus 3);
  - a Crossref 404 gives `not_found`;
  - a fetcher that throws gives `unavailable`;
  - more than 6 authors get ", et al.";
  - every fetched URL starts with `https://eutils.ncbi.nlm.nih.gov/` or `https://api.crossref.org/`.
- [ ] **Step 2: Run** `npx vitest run src/lib/library/lookup.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(library): look up sources in PubMed and Crossref`.

### Task 3: Storage and proposals (migration 0010)

**Files:**
- Modify: `src/db/schema.ts`.
- Create:
  - `drizzle/0010_*.sql`;
  - `src/lib/library/user-sources.ts`;
  - `src/lib/library/user-sources.test.ts`.

**Interfaces:**
- Consumes: `LookedUp` (Task 2) and `RULE_IDS` (catalog).
- Produces:
  - **`userSources` table:**
    - `id`, `ruleId` (text, not null), `title`, `authors`, `venue`, `year` (integer), `url`, `doi` (nullable), `pmid` (nullable);
    - `evidence` (text: an `Evidence` or "context");
    - `verified` (boolean);
    - `stance` (`"supports" | "contradicts" | "context"`);
    - `note` (text, nullable);
    - `proposal` (`"none" | "open" | "resolved"`, default "none");
    - `resolution` (text, nullable);
    - `createdAt`, `resolvedAt` (nullable).
  - `export async function addUserSource(db, input: { ruleId: string; stance: "supports" | "contradicts" | "context"; note: string | null; propose: boolean; found: LookedUp | null; rawInput: string }): Promise<{ ok: true; id: string } | { ok: false; error: string }>`.
    - It refuses an unknown `ruleId`.
    - When `found` is null (unverified), it saves the stance as "context", evidence "context", `verified: false`, the title as the raw input (trimmed to 200), and `propose` is refused.
    - A duplicate (the same rule and the same DOI or PMID) is refused with "Already added to this rule".
  - `export async function listUserSources(db, ruleId?: string)`, oldest first.
  - `export async function openProposals(db)`.
  - `export async function resolveProposal(db, id: string, resolution: string): Promise<"resolved" | "already" | "missing">`.
  - `export async function deleteUserSource(db, id: string)`.

- [ ] **Step 1: Write failing tests:**
  - adding with a verified lookup and `propose: true` gives an open proposal;
  - an unknown rule is refused;
  - an unverified source is saved as context, and propose is refused;
  - a duplicate DOI on the same rule is refused, and on another rule it's allowed;
  - `resolveProposal` twice gives "resolved", then "already", and the resolution text is kept (Review Focus 5);
  - an unknown id gives "missing";
  - `openProposals` excludes resolved ones;
  - delete removes the source.
- [ ] **Step 2: Run** `npx vitest run src/lib/library/user-sources.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Generate the migration and check that it is one `CREATE TABLE`.
  - Apply it locally: stop the dev server with `kill -INT`, run `env -u DATABASE_URL npm run db:migrate`, then restart in terminal tab c6.
- [ ] **Step 4: Run** `npx vitest run src/lib/library`. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(library): store user sources and proposals`.

### Task 4: Library UI and the add action

**Files:**
- Create:
  - `src/app/plan/library/source-actions.ts`;
  - `src/app/plan/library/add-source-form.tsx` (client).
- Modify: `src/app/plan/library/page.tsx` and `src/app/plan/plan.module.css`.
- Test: `src/lib/library/user-sources.test.ts` (the action's pure input parsing).

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `export function parseAddSourceForm(fd: FormData): { ruleId: string; input: string; stance: "supports" | "contradicts" | "context"; note: string | null; propose: boolean } | { error: string }`, in `user-sources.ts`.
    - The input is required (at most 500 characters), and so is the stance.
    - The note is at most 1000 characters.
    - `propose` is true when `fd.get("propose") === "on"`.
  - `addSourceAction(prev, fd)` (`"use server"`, `requireSession()`):
    - parse the form;
    - `parseSourceId`;
    - `lookupSource` when there's an identifier;
    - **unavailable:** returns "Couldn't reach PubMed or Crossref. Try again later." and saves nothing;
    - **not_found or no identifier:** saves it as unverified context, with the message "Saved as context: it couldn't be verified as a published study.";
    - otherwise saves it, then `revalidatePath("/plan/library")`.
  - `deleteSourceAction(id)`.
- **UI:**
  - **Each rule** gets an "Add a Source" `<details>`: a link/DOI/PMID input, a stance select (Supports / Contradicts / Context), an optional note, and a "Propose a Rule Change" checkbox.
  - **Under its Sources,** each user source shows "Added by You", its evidence badge (or "context"), "Contradicts" when that's the stance, "Unverified" when it couldn't be verified, and a delete button.
  - **"Proposed Changes" card** at the top of the Library, when any are open: rule id link, title, the owner's note, and the date.

- [ ] **Step 1: Write failing tests** for `parseAddSourceForm`: a missing input is an error; a bad stance is an error; propose "on" gives true; a note over 1000 characters is an error.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/lib/library src/lib/ui`, `npx tsc --noEmit` and `npx eslint src`. Expected: PASS and clean, including the options-case and colors tests.
- [ ] **Step 5: Manual check.** Restart the dev server. `curl /plan/library` returns 200, with "Add a Source" in the markup and no `Error:`.
- [ ] **Step 6: Commit** with message `feat(library): add your own sources to a rule`.

### Task 5: The proposals script for sessions

**Files:**
- Create: `scripts/proposals.ts`.
- Modify: `docs/superpowers/specs/2026-10-22-plan9-owner-features-design.md` (append a short "How a session resolves proposals" note).

**Interfaces:**
- Consumes: `openProposals` and `resolveProposal` (Task 3).
- Produces:
  - `npx tsx --env-file=<env> scripts/proposals.ts list` prints each open proposal: id, rule id, title, url, stance, note and date.
  - `… resolve <id> "<what was decided>"` prints `resolved`, `already resolved` or `no such proposal`, and exits 0, 0 or 1.
  - It uses `loadEnvConfig` and `getDb` like `scripts/seed-baseline.ts`.

- [ ] **Step 1: Write** the script.
- [ ] **Step 2: Verify** against the local DB:
  1. Stop the dev server (PGlite is single-process).
  2. Add a proposal with a tiny tsx one-off that calls `addUserSource` with an invented looked-up record.
  3. Run `list`.
  4. Run `resolve` twice: expect `resolved`, then `already resolved`.
  5. Delete the test row.
  6. Restart the dev server.
- [ ] **Step 3: Commit** with message `feat(library): proposals script for resolving rule changes in a session`.
