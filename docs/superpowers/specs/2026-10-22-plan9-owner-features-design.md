# Plan 9: Owner Features, Batch 2 (Design)

**Status:** Draft for owner review. The logo is deliberately left out and comes last.
**Builds on:** `2026-10-20-training-app-design.md` (the app) and `2026-10-22-visual-redesign-design.md` (the visual rules).

## Why

The owner trains for a half Ironman about a year out on a plan that adapts daily to WHOOP data. After using the app daily, they asked for six changes. Each one makes the daily loop faster or more trustworthy:

- see the three WHOOP numbers at a glance;
- tick off workouts as they happen;
- know when and why the plan changed a workout;
- log lifting without fighting the form;
- grow the evidence base;
- get WHOOP lab results in without retyping them.

## Goals

1. **Three rings on Today.** Recovery stays large, with sleep and strain smaller on either side. The strain ring shows a target band from today's planned training. HRV and resting HR move into the chip row.
2. **Workout check-off** on Today and Plan, for days with one or more workouts.
3. **Change indicator:** a red dot on any workout the plan changed, plus a "before" view.
4. **Strength log redesign:** sets are pre-filled from the plan, each set has its own weight and reps, and rep ranges and progression are updated from the strength research.
5. **User-added Library sources:**
   - The app verifies them against free official databases.
   - Rule changes happen only in a Claude Code session with the owner.
6. **Lab import from WHOOP app screenshots,** read on the device, with a review step before anything is saved.

## Non-Goals

- **The new logo, app icon and favicon.** These come after Plan 9, in their own design. The owner rejected four first sketches: a runner, a swimmer, a bike, and a three-arc ring.
- **WHOOP's own Strain Coach target.** It isn't available through the WHOOP API the app uses.
- **A WHOOP labs API.** None exists as far as we found, so labs come in by screenshot or paste.
- **Any per-use paid AI.** That includes AI reading of studies or lab screenshots.

## Anti-Goals (Failure Even If It "Works")

- **No silent rule changes.** A rule's numbers never change without the owner and a Claude Code session reviewing the source. The app never edits `RULES`.
- **No silent lab saves.** No lab value is saved from a screenshot or paste without the owner seeing it in a review table first.
- **No invented strain target.** A target that pretends to be precise is a failure. While there isn't enough history, the band is labeled an estimate.
- **No fake progress from check-off.** A manual check must never record training that didn't happen as if it came from data. A manual check is marked as manual.
- **No owner health data in the repo.** That covers lab values, screenshots and personal numbers. The repo is public, so tests use invented values.

## Global Constraints (Unchanged From Earlier Plans)

- **UI rules:**
  - Theme tokens only. No emoji. Title Case labels.
  - At 375 px there is no sideways scroll, and every tap target is at least 44 px.
- **Rules and evidence:**
  - Every rule number lives in `RULES`, with sources and an honest evidence badge.
  - Policy tests (numbers come from params, and the badge equals the strongest supporting citation) keep passing.
- **Migrations** are additive and are applied to Neon before the deploy that reads them.
- **Past days** (Plan 8) stay read-only. Viewing never writes.

---

## 1. Three Rings on Today

**Decided by the owner:**
- Recovery stays the large center ring, the same size as now, with its band color.
- Sleep is a smaller ring on the left and strain a smaller ring on the right.
- The strain ring shows today's target as a band, the way WHOOP does, and the target comes from today's planned training.
- HRV and resting HR become chips next to weight, replacing the old Sleep and Strain chips. The separate HRV card goes away, which frees a row.

**Agreed details:**
- **Sleep ring:** shows WHOOP sleep performance % (`sleeps.performance_pct`). Hours asleep and need appear as a small caption under it.
- **Strain ring:** shows day strain on WHOOP's 0–21 scale, with the target band shaded on the ring.
- **Past days:** show the same three rings for that day, with the target band for what was planned that day.
- **Missing values:** a missing or unscored value shows the existing Pending / Not Scored / No Data wording. It never shows 0.

**Strain target (agreed approach):**
- **Learned from the owner's own history.** For today's planned sessions, find past days whose planned training was similar. Take the WHOOP day strain on those days, and show their typical range as the band. A suggested starting point is the interquartile range of matching days.
- **Defining "similar":** at minimum, the main session's kind (rest, swim, bike, run, strength, brick or multi-session day) and intensity bucket (easy/Z1-Z2 vs hard), with duration close. The exact similarity measure is the builder's call; it must be explained in the rule's `why`.
- **Not enough history:** fall back to a starting range per day type. That range must be labeled "Estimate" in the UI and on the rule. It is practice-level evidence, honestly badged.
- **Recovery changes:** if recovery changed today's workouts, the target follows the adapted sessions, not the original plan.
- **New rule:** this needs a new `RULES` entry (for example `strain.dailyTarget`) with its params (minimum matching days, look-back window, fallback ranges). WHOOP's published description of strain and its 0–21 scale is context.

## 2. Workout Check-Off

**Decided by the owner:**
- On multi-workout days, you check each workout off as you finish it.
- Today's Session shows the first unfinished workout. Checking it moves on to the next one.
- A check shows on the Plan page too.

**Agreed details:**
- **What counts as done:** a manual check is a third way to complete a session. The existing ways stay: a matching logged entry, or a matching WHOOP workout.
- **Stored separately:** the app records whether a completion was manual, so stats and adherence can tell them apart.
- **Finished workouts stay visible** on Today as a one-line row with a check, above the current one. When everything is done, the card says the day is done.
- **Unchecking:** tapping a manual check again undoes it. A completion that came from a logged entry or WHOOP can't be unchecked that way.
- **On Plan:** each day shows the same checks, and you can check off from there too, for example if you forgot on the day. Future days can't be checked. Past days can be, so a forgotten workout can still be recorded.
- **No forced logging:** a plain check is enough. The card keeps its existing "Log" link for details.
- **Past-day view:** the Plan 8 read-only rule still applies to *viewing*. A check is a deliberate action, not a view, so it may write.

## 3. Red Dot and "Before" View for Changed Workouts

**Decided by the owner:**
- A small red dot in the top-right corner of any workout card that the plan changed.
- Tapping the workout shows what it was before the change.

**Agreed details:**
- **Every change gets the dot** (owner's answer). That includes yellow-day trims, pain swaps and sleep-debt notes that actually change the session. A "not enough data" note is not a change and gets no dot.
- **The "before" view** shows the stored planned session (title, duration, intensity, prescription) next to the adapted one, plus each reason line with its Why link. Example: "Before: Tempo run 50 min. Now: Easy run 40 min. Recovery 48% (yellow)."
- **Where it shows:** on Today and on that day in Plan, including past days.
- **Source of "before":** adaptation already happens at read time, and stored `planned_sessions` rows are never overwritten. So the stored row *is* the "before", and no new storage is needed for today.
- **Past days:** the reasons come from `recommendation_log`, so the "after" is reconstructed from that day's logged reasons, not by re-running adaptation. A past day never re-adapts (Plan 8).
- **Color:** the red is a theme token. If no suitable token exists, the builder adds one to every theme.

**Owner's question, answered here:** the owner asked how workouts change with recovery. The rules, in order:
1. Pain or a restricted joint swaps runs and drops plyometrics.
2. Red recovery means easy work of 40 min or less, or mobility in place of lifting.
3. Three red days in a row cut endurance to 60%.
4. Yellow recovery, or a low-HRV or high-resting-HR trend, cuts to 80% and makes hard work easy.
5. Sleep debt of 90+ min over 3 days moves hard sessions later in the week.

Green days never add work.

## 4. Strength Log Redesign

**The owner's complaints:**
- "Pick an Exercise" and "New exercise name" look like the same step.
- Weight and reps are hidden until after you tap Add.
- There's no clear way to change the weight or reps between sets.

**Decided by the owner:**
- The session opens already filled in from today's plan. Each exercise is a card with its sets laid out, a suggested weight, a rep target, and last time's sets.
- **Per-set entry:** every set has its own weight and reps, and both are editable. Values carry from one set to the next, so a change takes one tap. A check marks the set done.
- **Adding exercises:** "Add Exercise" opens a searchable list, with "Create New" at the bottom. The category is worked out for you, from the default catalog by name, else a simple keyword guess the owner can change. The separate name box on the main screen goes away.
- **No reps-in-reserve input** (owner's answer). Suggestions go by the reps actually hit.

**Rule updates, from the strength research** (`.superpowers/research/strength-training.md`, which is local; its citations move into `RULES`):
- **`strength.repRange`** widens from 10–12 to two ranges: about 6–10 for big machine compound lifts and about 10–15 for isolation lifts. It keeps "stop 1–3 reps short of failure".
- **`strength.progression`** becomes double progression: when every set reaches the top of the range, add the smallest step. Steps scale to the lift (about 2.5–5%, rounded to the machine's increment).
- **Calibration for unknown weights:** for an exercise with no history, spend the first 1–2 sessions finding a working weight. The card says "start light, stop with about 3 reps left", and no weight is suggested.
- **Weekly volume** (`strength.volume`) should land in about 10–20 hard sets per muscle per week, starting near 10–12. Check that the existing templates sit in this band and adjust them if not.
- **Evidence badges** follow the research file. ACSM 2026 counts as consensus. The Lopez 2021, Refalo 2023 and Schoenfeld 2017 meta-analyses are meta-analysis. The calibration procedure is practice.

**Owner's question, answered here:** the owner asked whether core and lower-leg sessions are "ever not easy". Those kinds carry intensity `easy` as a placeholder, and "Easy" reads oddly for them. The fix is to show the session kind instead (for example "Core · 20 min") wherever the intensity label would say Easy on a non-endurance session.

## 5. User-Added Library Sources

**Decided by the owner:**
- A source can change rules when it applies, but only once it's verified as credible.
- **The split:**
  - **The app verifies:** it checks the source is real and peer-reviewed and sets the evidence level.
  - **Rule changes happen in a Claude Code session** with the owner, never automatically.
- The owner will usually double-check a source in a session before adding it.

**Agreed details:**
- **Input:** a link, DOI or PubMed ID.
- **Lookup:** the app looks the source up in PubMed (NCBI E-utilities) and Crossref. Both are free and need no key for this volume. That gives the title, authors, journal, year and publication type.
- **Evidence badge from study type,** on the existing scale:
  - meta-analysis or systematic review → meta-analysis;
  - randomized or controlled trial → trial;
  - guideline or position stand → consensus;
  - other peer-reviewed article → expert.
- **Unverifiable sources** can only be saved as "context". That covers anything not found in PubMed or Crossref: a blog, a podcast, a news article. A context source never counts toward a badge or a rule change.
- **Attaching to a rule:** the owner picks the rule the source relates to, and whether it supports or contradicts it. The source appears in that rule's Library entry, marked "Added by You".
- **Proposed changes:** a verified source marked as changing a rule goes into a "Proposed Changes" list in the Library, with the owner's note on what should change.
  - In a Claude Code session, the source is read and weighed against the rule's other evidence.
  - Then either `RULES` is updated with tests, or the proposal is closed with a written reason.
  - The session marks the proposal resolved.
- **Storage:** user sources are stored in the DB, not in `catalog.ts`. So the shared `RULES` and their policy tests stay the single source of truth, and the badge rule ("equals the strongest supporting citation") is computed only over `RULES` citations until a session promotes a source into `RULES`.

## 6. Lab Import From WHOOP Screenshots

**Decided by the owner:**
- Labs come from the WHOOP app (WHOOP Advanced Labs).
- The owner will import them as screenshots from the WHOOP app. Pasted text is also accepted.

**Agreed details:**
- **Reading the image:**
  - Screenshots are read on the device, in the browser, with a free text-recognition library. The builder chooses which; Tesseract.js is the obvious one.
  - No image is uploaded or stored. The screenshot never leaves the phone.
  - The iPhone's Live Text copy-and-paste path also works, through the paste box.
- **Matching:**
  - The recognized text is matched against known marker names: the markers already stored, plus a starting list.
  - Each line pulls out the value, unit, reference range and flag where they're present.
  - The existing "Marker: value unit" paste format keeps working.
- **Review table before saving:**
  - It lists marker, value, unit, range and the draw date. The date is taken from the screenshot if present, else asked for.
  - Each row is editable or removable. Lines that couldn't be read show separately.
  - Saving uses the existing lab panel storage and its duplicate rules.
- **No sample screenshot was provided.** The reader is designed to be tolerant, and it is tuned when the owner first uses it on real screenshots.
- **Tests** use invented marker values only.

---

## Calls Made After the Builder Check

These were settled by the designer, not the owner. The owner can override any of them.

**Check-off (section 2):**
- **A manual check means "I did it".** It counts as done everywhere a completion counts: adherence, weekly totals, load history, and the regeneration and deletion guards.
- **Storage:** a nullable `completed_manual` boolean on `planned_sessions`, alongside `status='done'`. `completed_ref` stays null.
- **Upgrades:** a later logged entry or WHOOP workout that matches upgrades the check by setting `completed_ref`, and the manual flag is cleared.
- **The Log link stays on a manually checked session.** Logging it upgrades the check rather than double-counting.

**Red dot (section 3):**
- **When the dot shows:** if and only if the adapted session's `adjusted` is true. That is the engine's own flag, so there's no new diff. "Not enough data" leaves `adjusted` false.
- **Swaps:** a swap that changes the kind (run → ride) is the same card, with a dot.
- **Removed sessions:** a session the engine removes appears as a "Removed" row with a dot, showing its "before".
- **Past days:**
  - Add an additive nullable `adapted` jsonb snapshot (title, kind, duration, intensity) to the per-session `recommendation_log` rows written for today.
  - On a past day, "now" comes from that snapshot.
  - For days logged before the migration, the "before" view shows the stored session plus the logged reason text only.

**Strain target (section 1):**
- **Matching uses each past day's stored plan rows.** Skipped sessions, unscored strain and days with no planned rows are excluded.
- **Today's target** matches on today's *adapted* sessions.
- **The fallback ranges are the main path at first,** since there's only a few weeks of history. The learned range takes over per day type once there are enough matching days (a rule param).

**Strength (section 4):**
- **Existing storage:** `strength_sets` already stores weight and reps per set, so no new set storage is needed.
- **The suggested weight** comes from the most recent session of that exercise.
- **Progression trigger:** "every set reached the top of the range" in that most recent session.
- **Load step:** one global default increment (a rule param), with a nullable per-exercise override column on `exercises` for later.
- **Compound vs isolation:** a nullable `pattern` column on `exercises`. It is filled from the default catalog by name, else a keyword guess, and the owner can edit it.
- **The research file:** it lives locally at `.superpowers/research/strength-training.md`, and its citations and badges are used as given. Its key sources:
  - ACSM 2026 position stand (consensus);
  - Lopez 2021 network meta-analysis;
  - Refalo 2023 and Robinson 2024 on proximity to failure;
  - Schoenfeld 2017 and Pelland 2026 on volume;
  - Plotkin 2022 on progression (trial);
  - the calibration procedure (practice).

**Library sources (section 5):**
- **Lookups run server-side,** in a session-protected server action.
- **Link resolution:** links are reduced to a DOI or PMID by parsing common doi.org, pubmed and journal-URL patterns. Anything else counts as unverifiable.
- **Crossref items** typed as preprint or posted-content are forced to "context".
- **Contradicting sources** show in the same rule entry, labeled "Contradicts".
- **Resolving proposals:** a Claude Code session reads and resolves Proposed Changes through a small script (`scripts/proposals.ts`, which lists and resolves them), documented in the plan.

**Labs (section 6):**
- **Marker names:** the starting list is the markers already stored, plus a list of common blood markers. The builder writes this list, and it holds no owner values.
- **Draw date:** one per import, covering all screenshots in that import.
- **Duplicates:** the existing panel and marker uniqueness rules apply as they are.

**Rings (section 1):**
- **HRV chip:** keeps the "↑/↓ vs 30-day avg" hint from today's HRV card, so the trend stays visible.
- **Sleep ring color:** neutral. It uses the sleep color token and has no threshold bands.

## Left to the Builder

- **Splitting into plans:** the six pieces are independent. The builder may split them into separate implementation plans. A suggested order:
  1. check-off;
  2. red dot;
  3. rings;
  4. strength log;
  5. labs;
  6. sources.
- **Strain target details:** the exact similarity measure and the fallback ranges, explained in the rule.
- **Text-recognition library** and its loading strategy. Load it only on the lab page, never in the main bundle.
- **Schema shapes:** manual completion flag, user sources and proposals. They must be additive and nullable where they extend existing tables.
- **Exact red token** and ring sizes, within the visual design rules.

## How a Session Resolves Proposals (Added in Plan 12)

1. Run `npx tsx scripts/proposals.ts list`. This reads production when `.env.production.local` holds `DATABASE_URL`. Check the `Database:` line it prints first. A checkout without that file reads the local database instead.
2. For each proposal:
   - read the study;
   - weigh it against the rule's existing citations;
   - either change the rule in `src/lib/engine/rules/catalog.ts` (with its params, citations, badge and tests passing), or decide it doesn't change anything.
3. Run `npx tsx scripts/proposals.ts resolve <id> "<what was decided and why>" --prod`. The `--prod` flag is required on Neon; use `--local` on the local database. The decision then shows under that source in the Library.
