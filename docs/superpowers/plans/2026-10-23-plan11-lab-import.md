# Plan 11: Lab Import From WHOOP Screenshots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship section 6 of the Plan 9 design.
- Screenshots of WHOOP Advanced Labs results, or pasted text, are read on the phone.
- The results are matched to known marker names and put into the existing editable rows, which act as the review table, with the draw date when found.
- Nothing is saved until the owner taps Save.

**Architecture:**
- **Text reader:** a pure, tolerant `parseLabText` turns recognized text into rows: marker, value, unit, reference range and flag. It matches against known marker names and falls back to the existing "Marker: value unit" parser.
- **Image reading:** text recognition runs in the browser with `tesseract.js`, loaded only when the owner picks a screenshot. No image is uploaded or stored.
- **Migration 0009:** adds a nullable `ref_range` to `lab_results`.

**Tech Stack:**
- Next.js 16 App Router (read `node_modules/next/dist/docs/` before using a Next API).
- TypeScript, Drizzle with PGlite and Neon, zod 4, Vitest.
- `tesseract.js@7.0.0` (Apache-2.0). It is the only new dependency, pinned exactly.

**Spec:** `docs/superpowers/specs/2026-10-22-plan9-owner-features-design.md`, section 6 and the Labs items under "Calls Made After the Builder Check".

## Global Constraints

- **No per-use paid AI.** Text recognition runs on the device. The screenshot never leaves the phone. Only tesseract's engine and language files are downloaded, from its CDN.
- **Review before saving.** Read results only fill the editable rows. Saving is the existing Save Panel action.
- **One draw date per import.** It covers every screenshot in that import. A date found in the text fills the date field, which stays editable.
- **The existing duplicate rules apply.** Within a panel, a later marker of the same name replaces the earlier one (`addLabPanel`).
- **The repo is public.** Tests and fixtures use invented marker values and no real screenshots.
- **UI rules:** theme tokens only, Title Case labels, at least 44 px tap targets, and no sideways scroll at 375 px.
- **Migration 0009 is additive and nullable.** Apply it to Neon before deploy.
- **Node:** `export PATH="$HOME/.local/node/bin:$PATH"`.

## Review Focus

1. **A marker name and its value on separate lines** (typical of card layouts). Expected: they pair up. A number belonging to the next marker is never taken.
2. **A screenshot of something unrelated, or a blurry one.** Expected: no rows are added, a "Couldn't read any results" message shows, and nothing crashes.
3. **Two screenshots that both show the same marker.** Expected: one row per marker. The later screenshot's value wins, and it is flagged in the unread or duplicate notes.
4. **Numbers with commas or a "<" / ">" prefix** ("<0.5", "1,200"). Expected: parsed as 0.5 and 1200, with the "<" kept in the flag ("Below 0.5").
5. **The paste box with the old "Marker: value unit" lines.** Expected: still parsed as before.

---

### Task 1: The tolerant lab text reader

**Files:**
- Create:
  - `src/lib/log/lab-markers.ts` (a starter list of common blood markers with aliases);
  - `src/lib/log/lab-text.ts`;
  - `src/lib/log/lab-text.test.ts`.

**Interfaces:**
- Produces:
  - `export const COMMON_MARKERS: readonly { name: string; aliases: string[] }[]`. It covers at least:
    - Ferritin, Iron, TIBC, Transferrin Saturation;
    - Hemoglobin, Hematocrit, RBC, WBC, Platelets, MCV;
    - Vitamin D (aliases "25-OH Vitamin D", "Vitamin D, 25-Hydroxy"), Vitamin B12, Folate;
    - TSH, Free T4, Free T3;
    - Total Testosterone, Free Testosterone, SHBG, Estradiol, Cortisol, DHEA-S;
    - hs-CRP (alias "C-Reactive Protein"), Homocysteine;
    - HbA1c (alias "Hemoglobin A1c"), Glucose, Insulin;
    - Total Cholesterol, LDL Cholesterol (alias "LDL-C"), HDL Cholesterol (alias "HDL-C"), Triglycerides, ApoB (alias "Apolipoprotein B"), Lp(a) (alias "Lipoprotein (a)");
    - ALT, AST, GGT, Albumin;
    - Creatinine, eGFR, BUN, Uric Acid, CK;
    - Sodium, Potassium, Magnesium, Calcium, Zinc;
    - Omega-3 Index.
  - `export type ReadResult = { marker: string; value: number; unit: string; flag?: string; refRange?: string }`.
  - `export function parseLabText(text: string, known: readonly string[]): { results: ReadResult[]; unread: string[]; drawnOn: string | null }`.
    - **Names:** `known` holds extra marker names (the owner's stored markers). They are matched together with `COMMON_MARKERS` names and aliases, using a normalized comparison: lowercase, with non-alphanumerics removed.
    - **Pairing:**
      - A line containing a known name starts a result.
      - The value is the first number after the name, on the same line or within the next 3 non-empty lines.
      - Stop at the next line that contains another known name.
    - **Value text:**
      - Commas are removed (`1,200` gives 1200).
      - A leading `<` or `>` sets the flag to "Below X" or "Above X".
    - **Unit:** the token or tokens directly after the value on its line, up to the end of the line or a range. If none, "".
    - **Reference range:** the first `a-b` or `a – b` pattern within the result's lines, with optional unit, kept as text (for example "30–100"). `< X` and `> X` ranges are kept too.
    - **Flag:** the first of these words in the result's lines, case-insensitive, normalized to Title Case: High, Low, Optimal, Normal, In Range, Out of Range, Borderline.
    - **Duplicates:** a repeated marker keeps the last value. "Duplicate: <name>" is added to `unread`.
    - **Fallback:** lines that fail the name pairing go through the existing `parseLabPaste`. Anything still unread goes to `unread`, but only lines that contain a digit, so the noise from screenshot labels doesn't flood it.
    - **`drawnOn`:** the first date in the text, normalized to YYYY-MM-DD. Accepted formats: "Mar 3, 2026", "March 3, 2026", "03/03/2026", "2026-03-03". Otherwise null.

- [ ] **Step 1: Write failing tests** in `lab-text.test.ts`. Use invented values, and write the fixtures as recognized-text strings.
  - `pairs a name and value on separate lines`: `"Ferritin\n120 ng/mL\nOptimal\nVitamin D\n32 ng/mL\n30 - 100"` gives `[{marker:"Ferritin",value:120,unit:"ng/mL",flag:"Optimal"},{marker:"Vitamin D",value:32,unit:"ng/mL",refRange:"30–100"}]`.
  - `same-line layout`: `"HbA1c 5.2 % Normal"` gives `{marker:"HbA1c",value:5.2,unit:"%",flag:"Normal"}`.
  - `never takes the next marker's number`: `"Ferritin\nIron\n85 ug/dL"` gives only Iron (85). Ferritin has no value, and "Ferritin" goes to `unread`.
  - `aliases and case`: `"25-OH VITAMIN D 41 ng/mL"` gives marker "Vitamin D".
  - `owner's stored names count`: `parseLabText("Invented Marker 7.5 mg/L", ["Invented Marker"])` gives that marker.
  - `commas and less-than`: `"Lp(a) <10 nmol/L\nCK 1,200 U/L"` gives Lp(a) 10 with flag "Below 10", and CK 1200.
  - `duplicate keeps last`: `"Ferritin 100 ng/mL\nFerritin 110 ng/mL"` gives one Ferritin at 110, and `unread` contains "Duplicate: Ferritin".
  - `old paste format still works`: `"Invented Thing: 4.2 mmol/L"` gives `{marker:"Invented Thing",value:4.2,unit:"mmol/L"}`.
  - `nothing readable`: `"WHOOP\nAdvanced Labs\nYour Results"` gives `results: []` and `unread: []`.
  - `finds the draw date`: `"Collected Mar 3, 2026"` gives `"2026-03-03"`. `"03/04/2026"` gives `"2026-03-04"`. With no date, null.
- [ ] **Step 2: Run** `npx vitest run src/lib/log/lab-text.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `lab-markers.ts` and `lab-text.ts`. Reuse `parseLabPaste` for the fallback.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(log): tolerant lab text reader with common markers`.

### Task 2: Reference range storage (migration 0009)

**Files:**
- Modify:
  - `src/db/schema.ts`;
  - `src/lib/log/validate.ts` (`LabInput`);
  - `src/lib/log/records.ts` (`addLabPanel`, `getLabPanel`);
  - `src/app/log/records-actions.ts` (`logLabPanel` reads `refRange`);
  - `src/app/log/labs/[id]/page.tsx` (a Range column).
- Create: `drizzle/0009_*.sql`.
- Test: `src/lib/log/records.test.ts` and `src/lib/log/validate.test.ts`.

**Interfaces:**
- Produces:
  - `labResults.refRange`: `text("ref_range")`, nullable.
  - `LabInput.results[].refRange`: `z.string().trim().max(40).optional()`.
  - `addLabPanel` stores it, and the conflict update sets it.
  - `getLabPanel` returns it.

- [ ] **Step 1: Write failing tests.**
  - `addLabPanel` with `refRange: "30–100"` stores and returns it.
  - A later duplicate marker in the same input replaces both the value and the range.
  - `LabInput` rejects a 41-character range.
- [ ] **Step 2: Run** `npx vitest run src/lib/log/records.test.ts src/lib/log/validate.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Generate the migration and check that it is a single `ADD COLUMN`.
  - Apply it locally: stop the dev server with `kill -INT`, run `env -u DATABASE_URL npm run db:migrate`, then restart in terminal tab c6.
- [ ] **Step 4: Run** `npx vitest run src/lib/log`. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(log): store lab reference ranges`.

### Task 3: Screenshot reading and the review rows

**Files:**
- Modify:
  - `package.json` and the lockfile (`npm install tesseract.js@7.0.0 --save-exact`);
  - `src/app/log/labs/lab-form.tsx`;
  - `src/app/log/labs/page.tsx` (passes the known marker names);
  - `src/app/log/records.module.css`.
- Create:
  - `src/app/log/labs/read-image.ts` (client-only);
  - `src/lib/log/lab-rows.ts` (pure row merging);
  - `src/lib/log/lab-rows.test.ts`.

**Interfaces:**
- Consumes: `parseLabText` and `ReadResult` (Task 1), and `refRange` saving (Task 2).
- Produces:
  - `export async function readImageText(files: readonly File[], onProgress?: (done: number, total: number) => void): Promise<string>` in `read-image.ts`.
    - It dynamically imports `tesseract.js` inside the function, so it is never in the main bundle.
    - It uses one English worker, recognizes each file in turn, and joins the texts with blank lines.
    - It terminates the worker in `finally`.
  - `export type FormRow = { key: number; marker: string; value: string; unit: string; flag: string; refRange: string }`.
  - `export function mergeRows(existing: readonly FormRow[], read: readonly ReadResult[], nextKey: () => number): FormRow[]`.
    - Blank existing rows are dropped.
    - A read marker that matches an existing row's marker (normalized) replaces that row's fields in place.
    - Other read markers are appended in order.
- **Form changes:**
  - A **"Read Screenshots"** file input (`accept="image/*" multiple`, styled as a 44 px button) beside the paste box. While reading, it shows "Reading 1 of 2…".
  - **"Parse Into Rows"** now uses `parseLabText(paste, known)`.
  - **Both paths:**
    - They set the date field when `drawnOn` is found. The date input becomes controlled, defaulting to today.
    - They show "Found N results. Check them before saving."
    - If `results` is empty, they show "Couldn't read any results. Try a clearer screenshot or type them in."
    - They list `unread` as now.
  - **Each row gains** a "Range (optional)" input named `refRange`.
  - **The page passes `known`:** `listMarkers(db)` names.

- [ ] **Step 1: Write failing tests** for `mergeRows`:
  - a blank row is dropped;
  - "ferritin" read onto an existing "Ferritin" row replaces its value and keeps its key;
  - new markers append with fresh keys, in order.
- [ ] **Step 2: Run** `npx vitest run src/lib/log/lab-rows.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then `npm install tesseract.js@7.0.0 --save-exact`.
  - Confirm that `npx next build` keeps tesseract out of the shared first-load chunks. It may appear only in the lab route's lazy chunk.
- [ ] **Step 4: Run**:
  - `npx vitest run src/lib/log`;
  - `npx tsc --noEmit`;
  - `npx eslint src`;
  - `DATABASE_URL="postgresql://build:check@127.0.0.1:1/none" npx next build`.

  Expected: PASS, and the build compiles.
- [ ] **Step 5: Manual check.**
  - Restart the dev server.
  - `curl /log/labs` returns 200, with "Read Screenshots" and "Range" in the markup and no `Error:`.
  - Image reading itself is checked by the owner on a real WHOOP screenshot. Record that in the ledger as not verified here.
- [ ] **Step 6: Commit** with message `feat(log): read lab screenshots on the device into reviewable rows`.
