# Projected Race Finish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A projected 70.3 finish time at the top of Today:
- computed once a week from the owner's logged training and WHOOP VO2 max;
- able to go up or down;
- shown with the change from last week, the goal, the leg split and a 12-week trend.

**Architecture:**
- **Engine:** a pure function (`src/lib/engine/race-projection.ts`) turns per-leg inputs into leg times, using a new `race.projection` rule whose params are the researched factors.
- **Service:** gathers the inputs from `cardio_entries`, `weekly_metrics` and plan settings, and saves one snapshot per week in `race_projections` (migration 0012).
- **UI:** a Today card reads the snapshots.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` before using a Next API), TypeScript, Drizzle with PGlite and Neon, zod 4, Vitest, CSS modules with theme tokens.

**Spec:** `docs/superpowers/specs/2026-10-23-race-projection-design.md`, including "Calls Made After the Builder Check".

## Researched Params (Rule `race.projection`, Area "race")

| Param | Value | Basis |
|---|---|---|
| `swimYd` | 2112 | Race distance |
| `bikeMi` | 56 | Race distance |
| `runMi` | 13.1 | Race distance |
| `openWaterFactor` | 1.05 | Practice. Context: López-Belmonte 2024, which shows stroke changes in open water |
| `riegelExponent` | 1.06 | Vickers & Vertosick 2016 (BMC Sports Sci Med Rehabil 8:26, doi 10.1186/s13102-016-0052-y): calibrated up to the half marathon. Evidence: trial, an observational cohort |
| `easyToRaceFactor` | 0.90 | Easy long-run pace to race pace. Practice, from Daniels' pace tables, cited as expert |
| `offBikeFactor` | 1.10 | Tew 2005 (J Sports Sci Med 4:342): 10 km about 10–12% slower after 65 min of cycling. Trial |
| `vo2Weight` | 0.3 | The VO2-max half-marathon estimate's share of the run blend. Practice. WHOOP's VO2 max is vendor-validated only (MAE about 3–4), so it's a caveat |
| `bikeRaceFactor` | 1.05 | Race speed vs. training average. Practice |
| `defaultSwimSecPer100Yd` | 150 | First-timer default. Practice |
| `defaultRunSecPerMi` | 690 | First-timer easy long-run pace. Practice |
| `defaultBikeMph` | 16 | First-timer default. Practice. Context: amateur averages of about 18.5–19 mph |
| `transitionMin` | 12 | Amateur aggregate averages of about 12–14 min. Context source |
| `lookbackWeeks` | 6 | |
| `minSessions` | 2 | |
| `minSwimYd` | 400 | |
| `minRunMi` | 3 | |
| `minRideMin` | 45 | |
| `maxTreadmillInclinePct` | 1 | |
| `trendWeeks` | 12 | |
| `defaultGoalSec` | 21600 | 6:00:00 |

**Evidence badge:** `practice`. No study validates a full 70.3 projection for one athlete.
- **Citations:** Vickers 2016 (supports Riegel), Tew 2005 (supports off-bike), Daniels & Gilbert / Daniels' Running Formula (expert).
- **Context only:** López-Belmonte 2024, the WHOOP VO2 max accuracy page, and the Marathon Handbook amateur averages.
- Verify each URL or DOI resolves before adding it. Drop any citation that can't be verified, rather than guessing.

## Global Constraints

- **Rules:** every number is a `race.projection` param (the policy tests: numbers come from params, `REQUIRED`, and the badge equals the strongest *supporting* citation).
  - With `practice` as the badge, the supporting citations must be no stronger than practice, so the trials and expert sources are `ctx(...)`.
  - The rule's `why` stays at 120 characters or fewer.
- **Weeks** run Monday to Sunday in `OWNER_TZ` (`weekStart` from `src/lib/log/dates.ts`). A snapshot uses entries dated on or before the previous Sunday.
- **A leg is "from training"** only with at least `minSessions` qualifying entries in the look-back window. Otherwise it uses the starting pace, else the default, and is flagged an estimate. Thin data is never blended with the fallback.
- **Owner data:** starting paces and the goal live in `plan_settings` (nullable), never in code or tests.
- **Migration 0012** is additive. Apply it to Neon before deploy.
- **UI rules:** theme tokens only, Title Case, at least 44 px targets, and no sideways scroll at 375 px.
- **Node:** `export PATH="$HOME/.local/node/bin:$PATH"`.

## Review Focus

1. **No logged data and no starting paces.** Expected: every leg is a default, the total is flagged "Estimate", and nothing crashes.
2. **Exactly one qualifying swim.** Expected: the swim stays an estimate (it needs 2).
3. **The first view of a week comes on Friday.** Expected: Monday-to-Friday entries are ignored, because the snapshot uses data through the previous Sunday.
4. **A changed starting pace.** Expected: the current week is recomputed and past weeks stay unchanged.
5. **A past day's Today view.** Expected: that week's snapshot is shown if one exists, and nothing is computed or written.

---

### Task 1: Engine and rule

**Files:**
- Create: `src/lib/engine/race-projection.ts` and its test.
- Modify:
  - `src/lib/engine/rules/catalog.ts`;
  - `src/lib/engine/rules/catalog.test.ts` (`REQUIRED`);
  - `src/lib/engine/rules/types.ts` (`RuleArea` adds "race");
  - `src/lib/plan/view.ts` (`AREA_LABEL` adds `race: "Race"`).

**Interfaces:**
- Produces:
  - `export type Session = { distanceM: number; durationS: number }`.
  - `export type ProjectionInputs = { swims: Session[]; rides: Session[]; runs: Session[]; vo2max: number | null; start: { swimSecPer100Yd: number | null; runSecPerMi: number | null; bikeMph: number | null } }`.
  - `export type LegResult = { seconds: number; estimate: boolean }`.
  - `export type Projection = { swim: LegResult; bike: LegResult; run: LegResult; transitionS: number; totalS: number; estimate: boolean }`.
  - `export function project(inputs: ProjectionInputs): Projection`. It is pure, and every number comes from params.
    - **Swim (from training):** take the median of the faster half (by pace) of the qualifying swims, as seconds per 100 yd. Multiply by `swimYd / 100` and then by `openWaterFactor`.
    - **Bike (from training):** take the median average speed of the faster half of the rides (mph). Multiply it by `bikeRaceFactor`, and the leg time is `bikeMi` divided by that speed.
    - **Bike (fallback):** the starting speed or `defaultBikeMph`, used as race speed (no race factor).
    - **Run, training pace:** for each qualifying run, `t × (runMi / miles)^riegelExponent × easyToRaceFactor`. Take the median of the faster half of those.
    - **Run, fallback:** `startPace × runMi × easyToRaceFactor`, from the starting pace or `defaultRunSecPerMi`.
    - **Run, VO2 max:** `vdotHalfMarathonS(vo2max)`, blended as `(1 − vo2Weight) × trainingOrFallback + vo2Weight × vdot` when present.
    - **Off the bike:** the whole run leg is then multiplied by `offBikeFactor`.
    - **Run estimate flag:** it follows the training-pace part. VO2 max alone doesn't clear "Estimate".
    - **Total:** swim + bike + run + `transitionMin × 60`. `estimate` is true if any leg is an estimate.
  - `export function vdotHalfMarathonS(vo2max: number): number`.
    - It solves the Daniels–Gilbert equations for the 21,097.5 m time T (minutes) at which `VO2(v)/%max(T) = vo2max`, with `v = 21097.5 / T`:
      - `VO2(v) = −4.60 + 0.182258v + 0.000104v²`;
      - `%max(T) = 0.8 + 0.1894393e^(−0.012778T) + 0.2989558e^(−0.1932605T)`.
    - Bisection over T from 60 to 300 min, to 0.1 s.
    - These equation constants are the published model, so they are named constants with a comment citing Daniels & Gilbert. They are a fixed model, not tunable params.

- [ ] **Step 1: Write failing tests:**
  - `vdotHalfMarathonS(50)` is within 60 s of 1:31:39 (5499 s). That is the published VDOT 50 equivalence.
  - **Invented starting inputs:** no sessions, start `{swimSecPer100Yd: 125, runSecPerMi: 660, bikeMph: null}`, `vo2max: null`. Expect:
    - swim `round(125 × 21.12 × 1.05)`;
    - run `round(660 × 13.1 × 0.90 × 1.10)`;
    - bike 12600 s (a 16 mph estimate);
    - transitions 720;
    - `estimate` true.
    - These are invented values, not the owner's. The owner's own sanity check (6:30–7:15) is done by hand in Task 4's manual check, with their settings entered in the app.
  - **Fully empty inputs:** every leg comes from the defaults, all are estimates, and the totals are finite.
  - **One qualifying swim:** the swim is still an estimate. **Two:** it's from training, and the faster-half median is used.
  - **Off-bike and blend math:** two runs of 5 mi in 50:00 with `vo2max` null give a run leg of exactly `3000 × (13.1/5)^1.06 × 0.90 × 1.10` (to 1 s). Adding `vo2max: 50` moves it by exactly `0.3 × (vdot − training)` before the off-bike factor.
  - **Catalog policy tests** pass with the new rule.
- [ ] **Step 2: Run** `npx vitest run src/lib/engine/race-projection.test.ts src/lib/engine/rules`. Expected: FAIL.
- [ ] **Step 3: Implement** the rule and the engine.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(engine): race finish projection with sourced factors`.

### Task 2: Storage, settings fields (migration 0012)

**Files:**
- Modify:
  - `src/db/schema.ts`;
  - `src/lib/plan/settings.ts` (`PlanSettings`, zod, defaults);
  - `src/lib/plan/view.ts` (`settingsFromForm`);
  - `src/app/plan/settings/settings-form.tsx`.
- Create: `drizzle/0012_*.sql`.
- Test: `src/lib/plan/settings.test.ts` and `src/lib/plan/view.test.ts`.

**Interfaces:**
- Produces:
  - **`raceProjections`** table (`race_projections`):
    - `weekStart` (day, primary key);
    - `swimS`, `bikeS`, `runS`, `transitionS`, `totalS` (integers);
    - `estimates` (jsonb `{ swim: boolean; bike: boolean; run: boolean }`);
    - `inputs` (jsonb);
    - `computedAt`.
  - **`plan_settings`** nullable columns:
    - `start_swim_sec_per_100yd` (integer);
    - `start_run_sec_per_mi` (integer);
    - `start_bike_mph` (double);
    - `goal_sec` (integer).
  - **`PlanSettings`** gains `startSwimSecPer100Yd: number | null`, `startRunSecPerMi: number | null`, `startBikeMph: number | null`, and `goalSec: number | null`.
  - **Form fields:**
    - "Starting Swim Pace (per 100 yd)" as `m:ss`;
    - "Starting Long-Run Pace (per mile)" as `m:ss`;
    - "Starting Bike Speed (mph)";
    - "Race Goal" as `h:mm`.
    - All optional. A blank clears to null.
  - `export function parseClock(raw: string): number | null` in `view.ts`. It reads `"2:05"` as 125 and `"6:00"` as 21600 when a `goal` flag is set; the exact signature is `parseClock(raw: string, kind: "pace" | "goal")`.

- [ ] **Step 1: Write failing tests:**
  - `parseClock("2:05","pace")` is 125.
  - `parseClock("11:00","pace")` is 660.
  - `parseClock("6:00","goal")` is 21600.
  - `parseClock("5:45","goal")` is 20700.
  - Junk gives null.
  - `settingsFromForm` stores the four fields, and blanks give null.
  - `PlanSettingsInput` rejects a swim pace under 40 s or over 600 s, a run pace under 240 s or over 1200 s, a bike speed under 5 or over 40, and a goal under 3 h or over 9 h.
  - `getPlanSettings` defaults all four to null.
- [ ] **Step 2: Run** the two test files. Expected: FAIL.
- [ ] **Step 3: Implement.** Generate the migration and check that it is additive only. Apply it locally (stop the dev server, run `env -u DATABASE_URL npm run db:migrate`, restart it in a terminal tab).
- [ ] **Step 4: Run** `npx vitest run src/lib/plan`. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(plan): starting paces and race goal settings`.

### Task 3: Weekly snapshots

**Files:**
- Create: `src/lib/plan/projection.ts` and `src/lib/plan/projection.test.ts`.
- Modify: `src/app/plan/settings/actions.ts`, so that saving changed starting paces recomputes the current week.

**Interfaces:**
- Consumes: `project` (Task 1) and the table and settings (Task 2).
- Produces:
  - `export async function projectionInputs(db: Db, weekStart: string): Promise<ProjectionInputs>`.
    - It takes entries with `localDate` in `[weekStart − lookbackWeeks×7, weekStart − 1]`.
    - **Swims:** distance at least `minSwimYd`.
    - **Runs:** distance at least `minRunMi`, and not (indoor with incline over `maxTreadmillInclinePct`).
    - **Rides:** outdoor, with a distance, at least `minRideMin`.
    - **VO2 max:** the latest non-null `vo2max` with `week_start` in the same window.
    - **Start:** from settings.
  - `export async function ensureWeekProjection(db: Db, weekStart: string): Promise<SavedProjection>`. It returns the saved row, or computes and inserts it (`onConflictDoNothing`, then re-select).
  - `export async function recomputeWeekProjection(db: Db, weekStart: string): Promise<SavedProjection>`. It upserts the current week only.
  - `export async function projectionHistory(db: Db, uptoWeekStart: string, n: number): Promise<SavedProjection[]>`, oldest first.
  - `export type SavedProjection = { weekStart: string; swimS: number; bikeS: number; runS: number; transitionS: number; totalS: number; estimates: { swim: boolean; bike: boolean; run: boolean } }`.

- [ ] **Step 1: Write failing tests:**
  - **Friday:** a run logged on this week's Friday is ignored by this week's snapshot.
  - **Two swims:** two qualifying swims last week make the swim "from training".
  - **Steep treadmill:** a run with `indoor: true, inclinePct: 3` is excluded.
  - **Stale VO2 max:** a value older than the window is ignored.
  - **Saved once:** `ensureWeekProjection` twice gives one row, and the second call doesn't recompute (change a setting in between and the total stays).
  - **Recompute:** `recomputeWeekProjection` updates the current week, and an earlier week's row is unchanged.
  - **History:** `projectionHistory` returns oldest first and is capped at `n`.
- [ ] **Step 2: Run** `npx vitest run src/lib/plan/projection.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** In the settings save action, after a successful save, call `recomputeWeekProjection(db, weekStart(today))` when any starting pace changed.
- [ ] **Step 4: Run** `npx vitest run src/lib/plan`. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(plan): weekly race projection snapshots`.

### Task 4: Today card

**Files:**
- Create:
  - `src/components/projection-card.tsx`;
  - `src/components/projection-card.module.css`;
  - `src/lib/ui/projection-view.ts`;
  - `src/lib/ui/projection-view.test.ts`.
- Modify: `src/app/page.tsx` and `src/app/today.module.css`.

**Interfaces:**
- Consumes: `ensureWeekProjection` and `projectionHistory` (Task 3), and `PlanSettings.goalSec` (Task 2).
- Produces:
  - `export function hms(s: number): string`. For example `24150` gives `"6:42:30"` and `2580` gives `"0:43:00"`.
  - `export function changeLine(current: number, previous: number | null): string`:
    - with no previous: `"First Projection"`;
    - when faster: `"▼ 1:12 from last week"`;
    - when slower: `"▲ 0:45 from last week"`;
    - when equal: `"Same as last week"`.
    - Seconds are always shown (`m:ss`, or `h:mm:ss` from an hour).
  - `export function goalLine(goalSec: number | null): string` gives `"Goal: Under 6:00"` from the default `defaultGoalSec`, formatted `h:mm`.
  - `ProjectionCard({ current, history, goalSec })`:
    - the big `hms(total)`;
    - `changeLine`;
    - `goalLine`;
    - four split chips (Swim, Bike, Run, Transitions), using `StatChip`, with the "Estimate" hint on estimated legs;
    - a trend line of the history totals (reuse `LineChart`) when there are two or more points, lower meaning better;
    - an "Estimate" tag on the total when `current.estimates` has any true;
    - a link to `/plan/library#race.projection`.
- **Today page:**
  - The card sits at the top of the content, above the rings.
  - **Today:** `ensureWeekProjection(db, weekStart(date))`, wrapped in a try/catch that hides the card on error.
  - **A past date:** only read the existing snapshot for that week (a read helper, `savedWeekProjection(db, weekStart)`, added to `projection.ts` with a test that it never inserts). With none, show no card.
  - History comes from `projectionHistory(db, weekStart(date), trendWeeks)`.

- [ ] **Step 1: Write failing tests:**
  - `hms(24150)` is `"6:42:30"`.
  - `changeLine(24078, 24150)` is `"▼ 1:12 from last week"`.
  - `changeLine(24150, 24105)` is `"▲ 0:45 from last week"`.
  - `changeLine(1,1)` is `"Same as last week"`.
  - `changeLine(5, null)` is `"First Projection"`.
  - `goalLine(null)` is `"Goal: Under 6:00"`.
  - `goalLine(20700)` is `"Goal: Under 5:45"`.
  - In `projection.test.ts`: `savedWeekProjection` returns null and the row count is unchanged for a week with no snapshot.
- [ ] **Step 2: Run** `npx vitest run src/lib/ui/projection-view.test.ts src/lib/plan/projection.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/lib src/components src/app`, `npx tsc --noEmit` and `npx eslint src`. Expected: PASS and clean. The no-color-literal and Title Case UI tests also pass.
- [ ] **Step 5: Manual check.**
  - Restart the dev server.
  - `curl /` (with the session cookie) returns 200, and the markup contains "Projected Finish" and "Goal: Under".
  - `curl /?date=<a date two weeks ago>` returns 200, and no row is added (check before and after with a read-only query, with the dev server stopped).
- [ ] **Step 6: Commit** with message `feat(today): projected race finish card`.
