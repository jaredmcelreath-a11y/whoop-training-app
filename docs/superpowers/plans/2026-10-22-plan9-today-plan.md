# Plan 9: Check-Off, Change Dot, and Three Rings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship sections 1 to 3 of the Plan 9 design, on the Today and Plan screens:
- three rings with a strain target;
- workout check-off;
- a red dot and "before" view on changed workouts.

**Architecture:**
- **One migration** adds a manual-completion flag and an adapted-session snapshot.
- **Engine:** a new pure strain-target engine with its own rule.
- **Service layer:** small changes to check off, upgrade, and read logged changes.
- **UI:** the Today and Plan session cards gain a check button, a change dot and a before/now panel. Today's top section becomes three rings plus HRV, Resting HR and Weight chips.

**Tech Stack:**
- Next.js 16 App Router with `cacheComponents` (read `node_modules/next/dist/docs/` before using a Next API);
- TypeScript, Drizzle, PGlite in tests and Neon in prod, zod 4, Vitest, CSS modules with theme tokens.

**Spec:** `docs/superpowers/specs/2026-10-22-plan9-owner-features-design.md`, sections 1 to 3 and "Calls Made After the Builder Check". Sections 4 to 6 (strength, sources, labs) are Plans 10 to 12.

## Global Constraints

- **UI rules:**
  - Theme tokens only (`--low` for the change dot, `--sleep` for the sleep ring, `--info` for the strain ring). No color literals outside `globals.css`.
  - No emoji. Title Case labels.
  - At 375 px there is no sideways scroll, and every tap target is at least 44 px.
- **Rules:**
  - Every number lives in `RULES`, with sources and an honest badge.
  - Policy tests keep passing: numbers come from params, the `REQUIRED` param names list gains the new rule, and the badge equals the strongest supporting citation.
- **Migration 0007 is additive.** It is applied locally with `env -u DATABASE_URL npm run db:migrate`, and applied to Neon before the deploy that reads it.
- **Past days stay read-only to view** (Plan 8). A check is a deliberate action and may write; viewing never does.
- **A missing or unscored value** shows Pending / Not Scored / No Data, never 0.
- **The repo is public.** Tests use invented values.
- **Node:** `export PATH="$HOME/.local/node/bin:$PATH"`.

## Review Focus

1. **A manual check, then a WHOOP workout or log that matches the same session.** Expected: the session is upgraded to the real ref, the manual flag is cleared, and it counts once in adherence.
2. **Unchecking a session that was completed by a log or WHOOP.** Expected: refused, and the session stays done.
3. **Checking a session on a future date.** Expected: refused.
4. **A pain-hold day where a run becomes a ride.** Expected: one card with a dot. "Before" shows the run and "Now" shows the ride with its reason.
5. **A past day logged before migration 0007, so there is no snapshot.** Expected: the dot and reason text show, "Now" is omitted, and nothing crashes.
6. **Strain target with no matching history.** Expected: the fallback band, labeled "Estimate". With enough matching days, the learned band shows with no label.

---

### Task 1: Migration 0007 and check-off service

**Files:**
- Modify:
  - `src/db/schema.ts`;
  - `src/lib/plan/service.ts` (`markCompletion`, plus new `setManualDone`).
- Create: `drizzle/0007_*.sql`, via `npx drizzle-kit generate`.
- Test: `src/lib/plan/service.test.ts`.

**Interfaces:**
- Produces:
  - `plannedSessions.completedManual`: a `boolean("completed_manual").notNull().default(false)` column.
  - `recommendationLog.adapted`: a nullable `jsonb("adapted")` column, of type `AdaptedSnapshot | null`.
  - `export type AdaptedSnapshot = { kind: SessionKind; title: string; durationMin: number; intensity: SessionIntensity }` in `service.ts`.
  - `export async function setManualDone(db: Db, sessionId: string, done: boolean, today: string): Promise<"done" | "undone" | "refused">`.
  - `DaySession` gains `completedManual: boolean`. It is set in `getDayPlan`, `holdDayView` and `storedDaySessions`.

- [ ] **Step 1: Write failing tests** in a `describe("manual check-off")` block in `service.test.ts`. Rows are hand-placed, like the existing `plan(day, kinds)` helper.
  - `checks a planned session`:
    - `setManualDone(db, id, true, TODAY)` returns `"done"`.
    - The row has `status "done"`, `completedManual true` and `completedRef null`.
  - `unchecks only a manual completion`:
    - Unchecking a manual row returns `"undone"`, and the row is back to `status "planned"` with `completedManual false`.
    - On a row with `completedRef "cardio:x"`, it returns `"refused"` and the row is unchanged.
  - `refuses a future date`: a row on `addDays(TODAY, 1)` returns `"refused"` and stays `planned`.
  - `allows a past date`: a row on `addDays(TODAY, -3)` returns `"done"`.
  - `a later match upgrades a manual check`:
    - Check a run row manually.
    - Insert a matching `cardioEntries` run that day.
    - After `markCompletion(db, day, TZ)`, the row has `completedRef "cardio:<id>"`, `completedManual false` and `status "done"`.
  - `a manual check blocks regeneration`: a manually checked future-week day is kept by `regenerateFuture`. This is already covered by `status <> 'planned'`; assert it.
- [ ] **Step 2: Run** `npx vitest run src/lib/plan/service.test.ts -t "manual check-off"`. Expected: FAIL (`setManualDone` is not defined).
- [ ] **Step 3: Implement.**
  - Add both columns, then run `npx drizzle-kit generate`. Check that the SQL is only two `ADD COLUMN` statements.
  - **`setManualDone`:**
    - It is refused when `localDate > today`.
    - Checking only updates rows with `status = 'planned'`.
    - Unchecking only updates rows with `completed_manual = true AND completed_ref IS NULL`.
    - Each is one guarded `UPDATE … RETURNING`.
  - **`markCompletion`:**
    - `open` also includes rows with `completedManual && completedRef === null`.
    - The guarded update matches `(status = 'planned' OR completed_manual) AND completed_ref IS NULL`, and sets `{ status: "done", completedRef: ref, completedManual: false }`.
- [ ] **Step 4: Run** `npx vitest run src/lib/plan`. Expected: PASS.
- [ ] **Step 5: Apply locally.**
  1. Stop the dev server with `kill -INT`.
  2. Run `env -u DATABASE_URL npm run db:migrate`.
  3. Restart the dev server.
- [ ] **Step 6: Commit** with message `feat(plan): manual check-off with upgrade to logged completions`.

### Task 2: Check-off on Today and Plan

**Files:**
- Create:
  - `src/app/plan-actions.ts` (a server action);
  - `src/components/check-button.tsx` (client);
  - `src/components/check-button.module.css`.
- Modify:
  - `src/app/today-training.tsx`;
  - `src/app/today.module.css`;
  - `src/app/plan/page.tsx`;
  - `src/app/plan/plan.module.css`;
  - `src/lib/plan/today-view.ts`.
- Test: `src/lib/plan/today-view.test.ts`.

**Interfaces:**
- Consumes: `setManualDone`, and `DaySession.completedManual` (Task 1).
- Produces:
  - `export async function toggleDoneAction(sessionId: string, done: boolean): Promise<void>`. It is `"use server"`, calls `requireSession()`, uses `today = localDate(new Date(), OWNER_TZ)`, and runs `revalidatePath("/")` and `revalidatePath("/plan")`.
  - `export function splitDay<S extends { kind: string; status: string; completedRef: string | null }>(sessions: readonly S[]): { done: S[]; current: S | null; later: S[] }` in `today-view.ts`.
  - `export function canUncheck(s: { completedManual: boolean; completedRef: string | null }): boolean` in `today-view.ts`.
  - `export function sessionMetaLabel(kind: string, intensity: string): string | null` in `src/lib/plan/view.ts`.
    - It returns `INTENSITY_LABEL[intensity]` for swim, bike and run.
    - It returns `null` for `easy` on strength, lower_leg, core and mobility, so the card shows the kind and duration only.
    - It returns `"Strength"` for intensity `strength`.
    - This answers the owner's "are they ever not easy" question.

- [ ] **Step 1: Write failing tests** in `today-view.test.ts` and `view.test.ts`.
  - **`splitDay`:**
    - It ignores rest rows.
    - For `[run done, strength planned, core planned]` it returns `done` = [run], `current` = strength, `later` = [core].
    - When all are done, `current` is null.
  - **`canUncheck`:**
    - `{true, null}` gives true.
    - `{false, null}` gives false.
    - `{false, "whoop:1"}` gives false.
  - **`sessionMetaLabel`:**
    - `("core","easy")` gives null.
    - `("lower_leg","easy")` gives null.
    - `("run","easy")` gives `"Easy"`.
    - `("bike","z2")` gives `"Zone 2"`.
- [ ] **Step 2: Run** `npx vitest run src/lib/plan/today-view.test.ts src/lib/plan/view.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the helpers, then the UI.
  - **`CheckButton({ sessionId, done, locked })`:**
    - A 44 px circular toggle with `aria-pressed` and an `aria-label` of "Mark Done" or "Mark Not Done".
    - It calls `toggleDoneAction` inside `useTransition`.
    - It is disabled when `locked` is true (done via a log or WHOOP), showing a filled check.
  - **Today card** (`TodayTraining`):
    - Done sessions appear first as one-line rows: check, title, and "Done" (or "Done · Logged" when `completedRef`).
    - Then the `current` session as the full row with a `CheckButton`.
    - Then `later` sessions as one-line "Up Next" rows.
    - When `current` is null and there was work, the card shows "All Done for Today" (past days: "All Done").
    - Past days render the same, and the check stays available.
  - **Plan page:** each non-rest `Session` row gets a `CheckButton` beside its summary, but not on dates after today. It replaces the static "Done" badge, keeping "Skipped".
  - **Both cards** use `sessionMetaLabel` in place of the raw `INTENSITY_LABEL` lookup.
- [ ] **Step 4: Run** the tests, `npx tsc --noEmit` and `npx eslint src`. Expected: PASS and clean.
- [ ] **Step 5: Manual check.** `curl -b "session=…" localhost:3000/` and `/plan` return 200, with `aria-label="Mark Done"` in the markup.
- [ ] **Step 6: Commit** with message `feat(today): check off workouts on Today and Plan`.

### Task 3: Change dot and before/now view

**Files:**
- Modify:
  - `src/lib/plan/service.ts` (snapshot on log rows, plus new `loggedChanges`);
  - `src/app/today-training.tsx`;
  - `src/app/plan/page.tsx`;
  - `src/app/today.module.css`;
  - `src/app/plan/plan.module.css`.
- Create: `src/components/change-view.tsx` (server component) and `src/components/change-view.module.css`.
- Test: `src/lib/plan/service.test.ts`.

**Interfaces:**
- Consumes: `AdaptedSnapshot` and `recommendationLog.adapted` (Task 1).
- Produces:
  - `export async function loggedChanges(db: Db, date: string): Promise<Map<string, { now: AdaptedSnapshot | null; reasons: { ruleId: string; text: string }[] }>>`. It is read-only and keyed by `plannedSessionId`. It skips rows whose `effect` is `NOT_ENOUGH_DATA` or "No session changed".
  - `ChangeView({ before, now, reasons })`, where `before` and `now` are `AdaptedSnapshot`. It renders "Before" and "Now" lines and the reason list with `/plan/library#<ruleId>` Why links. When `now` is null, it omits the "Now" line.

- [ ] **Step 1: Write failing tests.**
  - `getDayPlan stores the adapted snapshot on changed sessions`:
    - Seed a red-recovery day, as the existing red-day test does.
    - After `getDayPlan`, that session's `recommendation_log` rows have `adapted` equal to the adapted `{kind, title, durationMin, intensity}`.
  - `a pain-hold swap snapshots the new kind`:
    - Seed today's run row plus an active pain hold, as the existing pain-hold test does.
    - After `getDayPlan`, the session's log row has `adapted.kind` `"bike"`, and the stored row is still `kind "run"`. That stored row is the "Before".
  - `loggedChanges reads a past day without writing`:
    - Insert log rows for a past date: one with `adapted`, one legacy row with `adapted: null`, and one `NOT_ENOUGH_DATA` row.
    - The map has the two changed sessions with their reasons, `now` is null for the legacy one, and the `NOT_ENOUGH_DATA` row is absent.
    - Row counts in `recommendation_log` and `planned_sessions` are unchanged.
- [ ] **Step 2: Run** `npx vitest run src/lib/plan/service.test.ts -t "snapshot|loggedChanges"`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **In `getDayPlan`:** set `adapted` on per-session log rows only when `s.adjusted`. Include `adapted` in the `onConflictDoUpdate` set.
  - **The dot shows when:**
    - **Today:** `s.adjusted`.
    - **Plan future days under a hold:** `holdDayView`'s `adjusted`.
    - **Past days:** `loggedChanges(db, date).has(s.id)`, on both the Today past-day view and Plan's past days.
  - **The dot itself:** an 8 px `--low` circle, absolutely positioned top-right of the session card, with `aria-label="Changed by the Plan"`.
  - **Tapping:** the session's existing `<details>` (Plan) or a new `<details>` (Today) opens `ChangeView`.
    - "Before" comes from the stored row.
    - "Now" is the adapted session (today), else the logged snapshot.
    - The existing "Adjusted" badge text stays.
  - **Ruling:** the engine never removes a session (it maps one-to-one), so there is no "Removed" row. This is noted in the ledger.
- [ ] **Step 4: Run** `npx vitest run src/lib/plan src/lib/ui`, `npx tsc --noEmit` and `npx eslint src`. Expected: PASS and clean. The no-color-literal UI test passes.
- [ ] **Step 5: Commit** with message `feat(plan): red dot and before/now view on changed workouts`.

### Task 4: Strain target engine and rule

**Files:**
- Create: `src/lib/engine/strain-target.ts` and `src/lib/engine/strain-target.test.ts`.
- Modify:
  - `src/lib/engine/rules/catalog.ts` (new rule);
  - `src/lib/engine/rules/catalog.test.ts` (`REQUIRED`);
  - `src/lib/plan/view.ts` (`AREA_LABEL` gains `strain: "Strain"`).

**Interfaces:**
- Produces:
  - `export type DayType = "rest" | "easy" | "long" | "hard" | "strength"`.
  - `export function dayType(sessions: readonly { kind: string; intensity: string; durationMin: number; details: Record<string, unknown> }[]): DayType`.
    - No non-rest sessions gives `"rest"`.
    - Any swim, bike or run with intensity tempo, threshold or intervals gives `"hard"`.
    - Any endurance session with `details.long === true` gives `"long"`.
    - Any endurance session gives `"easy"`.
    - Otherwise `"strength"`.
    - The order of checks is exactly this.
  - `export type StrainTarget = { low: number; high: number; estimate: boolean; type: DayType; days: number }`.
  - `export function strainTarget(type: DayType, history: readonly { type: DayType; strain: number }[]): StrainTarget`.
    - If at least `minDays` history entries match `type`, it uses their 25th to 75th percentile (linear interpolation), rounded to 1 decimal, with `estimate: false`.
    - Otherwise it uses `fallback[type]` with `estimate: true`.
- **Rule `"strain.dailyTarget"`:**
  - `area: "strain"`;
  - `evidence: "practice"`.
  - **Params** (exact values):
    - `minDays: 4`;
    - `lookbackDays: 56`;
    - `fallback`: `{ rest: [4, 8], easy: [8, 11], long: [12, 15], hard: [11, 14], strength: [7, 10] }`.
  - **Statement:** "Today's strain target is the middle half (25th to 75th percentile) of your WHOOP day strain on past days with the same kind of planned training. Until there are at least 4 such days in the last 56 days, a starting range per day type is used and labeled as an estimate."
  - **Why:** "There's no study for a day-strain target, so the app learns your own typical strain for each kind of day. The starting ranges sit in WHOOP's light-to-strenuous bands."
  - **Citations:** WHOOP's public strain explainer, as `ctx(...)`. Verify the URL resolves before adding it. If no stable WHOOP page is found, use no citation, and the Library shows "No direct study".
  - **Caveat:** "WHOOP's own Strain Coach target is not available to this app, so this is the app's estimate, not WHOOP's."

- [ ] **Step 1: Write failing tests** in `strain-target.test.ts`.
  - **`dayType`:**
    - `[rest]` gives rest.
    - `[run tempo 40]` gives hard.
    - `[bike z2 180 long]` gives long.
    - `[run easy 30, core easy 15]` gives easy.
    - `[strength, core]` gives strength.
    - `[run intervals, bike long]` gives hard (hard wins).
  - **`strainTarget`:**
    - With 3 matching days, it returns the fallback `easy` as `{low: 8, high: 11, estimate: true}`.
    - With matching strains `[8, 9, 10, 11, 12]`, it returns `{low: 9, high: 11, estimate: false, days: 5}`.
    - Non-matching types are ignored.
  - **Catalog:** the policy tests pass with the new rule (run the whole `catalog.test.ts`).
- [ ] **Step 2: Run** `npx vitest run src/lib/engine/strain-target.test.ts src/lib/engine/rules`. Expected: FAIL.
- [ ] **Step 3: Implement** the rule and functions. Every number comes from `RULES["strain.dailyTarget"].params`.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(engine): strain target from planned day type`.

### Task 5: Strain history service and Today summary fields

**Files:**
- Modify:
  - `src/lib/today.ts` (sleep `performancePct`);
  - `src/lib/plan/service.ts` (new `getStrainTarget`).
- Test: `src/lib/today.test.ts` and `src/lib/plan/service.test.ts`.

**Interfaces:**
- Consumes: `dayType` and `strainTarget` (Task 4), and `noonOf` (`src/app/today-date.ts`; move it to `src/lib/log/dates.ts` and re-export it so `lib` doesn't import from `app`).
- Produces:
  - `TodaySummary.sleep` gains `performancePct: number | null`. It is null unless the sleep is SCORED.
  - `export async function getStrainTarget(db: Db, date: string, sessions: readonly { kind: string; intensity: string; durationMin: number; details: Record<string, unknown> }[], tz: string): Promise<StrainTarget>`.
    - It is read-only.
    - History is every date in `[date − lookbackDays, date − 1]` that has stored `planned_sessions` rows, with no row `status = 'skipped'`.
    - Each date's strain is the SCORED `cycles.strain` of the latest cycle with `start <= noonOf(d, tz)`. Dates with no scored cycle are skipped.
    - The type comes from `dayType` of that date's stored rows.

- [ ] **Step 1: Write failing tests.**
  - `today.test.ts`: a scored sleep with `performancePct: 88` gives `t.sleep.performancePct` 88. An unscored one gives null.
  - `service.test.ts`, `getStrainTarget`:
    - Seed 5 past easy-run days with cycles of strain 8 to 12 at local noon, plus 1 skipped day with strain 20, plus 1 day with an unscored cycle.
    - For an easy session today, it returns `{low: 9, high: 11, estimate: false, days: 5}`.
    - With no history, it returns the fallback with `estimate: true`.
    - Row counts are unchanged.
- [ ] **Step 2: Run** the two test files. Expected: FAIL.
- [ ] **Step 3: Implement** with one cycles query over the window and one `planned_sessions` query, grouped in memory.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(today): strain target history and sleep performance`.

### Task 6: Three rings and the new chip row on Today

**Files:**
- Create: `src/components/mini-ring.tsx` and `src/components/mini-ring.module.css`.
- Modify:
  - `src/app/page.tsx`;
  - `src/app/today.module.css`;
  - `src/app/today-training.tsx` (expose the sessions it already loads, see below);
  - `src/components/recovery-ring.module.css` (sizing only).
- Test: `src/components/mini-ring.test.tsx`, plus `src/app/recovery.test.tsx` if the ring markup changes.

**Interfaces:**
- Consumes: `TodaySummary.sleep.performancePct` (Task 5), `getStrainTarget` (Task 5), and `StrainTarget` (Task 4).
- Produces:
  - `MiniRing({ label, value, max, display, tone, band, pendingLabel })`.
    - `tone` is `"sleep" | "strain"`.
    - `band` is `{ low: number; high: number } | null`. It is drawn as a wider, translucent arc on the track from `low/max` to `high/max`.
    - `display` is the center text.
    - Without a value it shows the empty track and `pendingLabel`.
    - `aria-label` examples: "Sleep 84%" and "Strain 8.2, target 9 to 11".
  - `export function bandArc(low: number, high: number, max: number, circ: number): { dash: string; offset: number }`, in `mini-ring.tsx`. It is pure and tested.

- [ ] **Step 1: Write failing tests** in `mini-ring.test.tsx`, using `renderToStaticMarkup` like the existing recovery test.
  - `bandArc(9, 11, 21, 100)` gives the dash `"9.52 100"` and offset `-42.86`, rounded to 2 decimals.
  - A strain ring with `band` renders 3 circles (track, band, value) and the aria-label `"Strain 8.2, target 9 to 11"`.
  - A sleep ring with value null renders the pending label and no value arc.
  - The markup has no color literals: classes only, with the tones set in the CSS module from `--sleep` and `--info`.
- [ ] **Step 2: Run** `npx vitest run src/components/mini-ring.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Layout:**
    - Replace the single `RecoveryRing` block with a 3-column grid, `minmax(0,1fr) minmax(0,1.6fr) minmax(0,1fr)`, aligned center: Sleep `MiniRing`, then `RecoveryRing` (unchanged size), then Strain `MiniRing`.
  - **Sleep ring:**
    - It shows `performancePct` against a max of 100, displayed as `"84%"`.
    - Its caption is `hm(asleepMin)` / `Need hm(needMin)` where known.
  - **Strain ring:**
    - It shows `dayStrain` against a max of 21, displayed with 1 decimal, with the `band` from `getStrainTarget`.
    - A caption under it reads "Target 9–11", or "Target 8–11 · Estimate" when `estimate`.
  - **Where the target is computed:**
    - In `TodayContent`, compute it from today's adapted sessions (`getDayPlan`) for today.
    - For a past day, use `storedDaySessions`.
    - Load the sessions once and pass them to `TodayTraining` as a prop. `TodayTraining` takes `sessions: DaySession[] | null`, where null means the load failed, so `getDayPlan` isn't called twice.
  - **Chip row:** `HrvChip`, `RhrChip` and `WeightChip`.
    - The HRV chip value is `"62 ms"`, with the existing hint `"↑ vs 30-day avg 58"` (from today's `HrvCard` logic).
    - The RHR chip value is `"52 bpm"`.
    - Delete `HrvCard`, `SleepChip` and `StrainChip`.
  - **`TodaySkeleton`:** update it to the 3-ring and 3-chip shape, with the labels Sleep, Recovery, Strain, HRV, Resting HR and Weight.
- [ ] **Step 4: Run** `npx vitest run src/components src/app src/lib/ui`, `npx tsc --noEmit` and `npx eslint src`. Expected: PASS and clean.
- [ ] **Step 5: Manual check.**
  - Restart the dev server, which tends to serve stale modules after new exports.
  - `curl` `/` and `/?date=<yesterday>` return 200, with aria-labels for Sleep, Recovery and Strain in the markup, and no `Error:` in the payload.
- [ ] **Step 6: Commit** with message `feat(today): sleep, recovery and strain rings with a strain target`.
