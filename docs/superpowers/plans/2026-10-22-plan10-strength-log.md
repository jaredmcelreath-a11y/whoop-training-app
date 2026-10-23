# Plan 10: Strength Log Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship section 4 of the Plan 9 design.
- The workout opens with today's planned lifts already laid out: sets, a suggested weight, a rep target and last time.
- Each set has its own weight and reps, plus a check that saves it.
- Exercises are added from a searchable list, and the category is inferred.
- Rep ranges and progression follow the strength research.

**Architecture:**
- **Pure catalog classifier:** `classifyExercise` gives each exercise its category and its movement pattern (compound or isolation).
- **Rules:** `strength.repRange` and `strength.progression` gain per-pattern ranges and a percentage-based step. The prescription engine reads both.
- **Migration 0008:** stores the pattern and an optional load increment on `exercises`.
- **Workout page:** builds its exercise cards from today's adapted prescription, then logged sets, then manual picks.

**Tech Stack:** Next.js 16 App Router (read `node_modules/next/dist/docs/` before using a Next API), TypeScript, Drizzle with PGlite and Neon, zod 4, Vitest, CSS modules with theme tokens.

**Spec:**
- `docs/superpowers/specs/2026-10-22-plan9-owner-features-design.md`, section 4, plus "Calls Made After the Builder Check" for strength.
- Research: `.superpowers/research/strength-training.md` (local; its citations are copied into `RULES` here).

## Global Constraints

- **UI rules:**
  - Theme tokens only. No emoji. Title Case labels.
  - At 375 px there is no sideways scroll, and every tap target is at least 44 px.
- **Rules:**
  - Every number lives in `RULES` params.
  - The `REQUIRED` param list is updated.
  - The badge equals the strongest supporting citation. Both changed rules stay `consensus` (ACSM).
  - Any number in statement or why text must come from params.
- **Migration 0008 is additive and nullable.** It is applied locally with `env -u DATABASE_URL npm run db:migrate`, and to Neon before deploy.
- **No reps-in-reserve input** (owner). Suggestions go by the reps hit.
- **Stored category values stay lowercase.** Labels come from `CATEGORY_LABEL`.
- **The repo is public.** Tests use invented weights.
- **Node:** `export PATH="$HOME/.local/node/bin:$PATH"`.

## Review Focus

1. **An exercise with no history.** Expected: no suggested weight, and the "start light, stop with about 3 reps left" note.
2. **Last session hit the top of the range on every set at the same weight.** Expected: the next suggested weight is one step up. If any set fell short, the weight is kept.
3. **A light dumbbell exercise with a per-exercise increment of 2.5 lb.** Expected: the step is 2.5 lb, not 5 lb.
4. **Today's lift is changed by a pain hold** (plyometrics removed). Expected: the workout's planned cards don't include the removed exercise.
5. **A workout opened on a later day, or after it's finished.** Expected: no planned prefill. Only logged sets show, and nothing is written by viewing.
6. **A planned exercise name missing from the exercises table.** Expected: it is created on demand, with the classified category, and doesn't crash.

---

### Task 1: Exercise classification, rules and prescription engine

**Files:**
- Modify:
  - `src/lib/log/exercise-catalog.ts`;
  - `src/lib/engine/rules/catalog.ts`;
  - `src/lib/engine/rules/catalog.test.ts`;
  - `src/lib/engine/strength.ts`.
- Test: `src/lib/log/exercise-catalog.test.ts` (create it) and `src/lib/engine/strength.test.ts`.

**Interfaces:**
- Produces:
  - `export type Pattern = "compound" | "isolation"`.
  - `DEFAULT_EXERCISES` entries gain a `pattern` field.
    - **Compound:** Lat Pulldown, Seated Row, Machine Chest Press, Machine Shoulder Press, Seated Dip Machine, Leg Press and Barbell Deadlift.
    - **Isolation:** every other `strength`-category default.
    - Non-strength categories get `null`.
  - `export function classifyExercise(name: string): { category: Category; pattern: Pattern | null }`.
    - A case-insensitive exact match on a default name returns its entry.
    - Otherwise, keyword guesses, checked in this order:
      1. `/plank|dead bug|crunch|sit-?up|hollow|pallof/` gives core, null.
      2. `/jump|bound|hop|plyo/` gives plyo, null.
      3. `/stretch|mobility|yoga|foam/` gives mobility, null.
      4. `/push-?up|pull-?up|chin-?up|bodyweight/` gives bodyweight, null.
      5. `/press|row|pulldown|squat|deadlift|lunge|dip/` gives strength, compound.
      6. Otherwise strength, isolation.
  - **Rule `strength.repRange` params:** `{ compound: [6, 10], isolation: [10, 15], rirCompound: [2, 3], rirIsolation: [1, 2] }`.
    - **Statement:** "Big machine lifts: 6-10 reps, stopping 2-3 reps short of failure. Smaller isolation lifts: 10-15 reps, stopping 1-2 reps short."
    - Keep the existing citations. Add Lopez 2021 (Med Sci Sports Exerc 53(6):1206-1216, doi 10.1249/MSS.0000000000002585, meta-analysis) and Refalo 2023 (Sports Med 53(3):649-665, doi 10.1007/s40279-022-01784-y, meta-analysis), with the author lists from the research file.
    - Add `ACSM_2026` if it isn't already cited.
    - **Caveat:** the split by exercise type is practice; the ranges themselves are evidence.
  - **Rule `strength.progression` params:** `{ stepPct: 2.5, defaultIncrementLb: 5, whenAllSetsAtMax: true, calibrationRir: 3 }`.
    - **Statement:** "Double progression: when every set reaches the top of the rep range, add about 2.5% of the weight, rounded to the machine's increment (5 lb unless set per exercise). With no history yet, start light and stop with about 3 reps left."
    - Add Plotkin 2022 (PeerJ 10:e14142, doi 10.7717/peerj.14142, trial).
    - The evidence badge stays consensus, from ACSM 2009.
  - **`REQUIRED`:** `"strength.repRange": ["compound", "isolation", "rirCompound", "rirIsolation"]` and `"strength.progression": ["stepPct", "defaultIncrementLb", "whenAllSetsAtMax", "calibrationRir"]`.
  - **`prescribe`:**
    - `prescribe(template, history, opts, increments?: Map<string, number>)`. `increments` maps an exercise name to its increment in lb; the default is `defaultIncrementLb`.
    - `TemplateItem` gains no field. The pattern comes from `classifyExercise(it.exercise).pattern`.
    - The range is `compound` or `isolation` by pattern. Lower-leg items keep `strength.template.lowerLegRepRange`.
  - `export function progressionStep(weightLb: number, incrementLb: number, stepPct: number): number` returns `incrementLb * max(1, round((weightLb * stepPct / 100) / incrementLb))`.

- [ ] **Step 1: Write failing tests.**
  - **`exercise-catalog.test.ts`:**
    - `classifyExercise("lat pulldown")` gives `{category: "strength", pattern: "compound"}`.
    - `"Dumbbell Lateral Raise"` gives isolation.
    - `"Hack Squat"` gives compound.
    - `"Cable Fly"` gives isolation.
    - `"Side Plank"` gives core, null.
    - `"Broad Jump"` gives plyo, null.
    - `"Hip Mobility Flow"` gives mobility, null.
    - `"Pull-Up"` gives bodyweight, null.
    - Every `DEFAULT_EXERCISES` strength entry has a non-null pattern.
  - **`strength.test.ts`:**
    - `progressionStep(100, 5, 2.5)` gives 5. `(300, 5, 2.5)` gives 10. `(20, 2.5, 2.5)` gives 2.5. `(20, 5, 2.5)` gives 5.
    - With no history, Lat Pulldown gets `repRange [6, 10]`, `targetWeightLb null`, and a note containing "about 3 reps left".
    - A history of 3×10 at 100 lb on Lat Pulldown gives a target of 105. A history of `[10, 10, 9]` at 100 lb gives a target of 100.
    - With a history of 3×15 at 20 lb on Dumbbell Lateral Raise and `increments` `{ "Dumbbell Lateral Raise": 2.5 }`, the target is 22.5 and the range is `[10, 15]`.
    - Lower-leg items keep `[12, 15]`.
    - Update existing tests that assumed 10–12 or a fixed 5/10 lb step.
  - **Catalog:** the policy tests pass. Run the whole `catalog.test.ts`.
- [ ] **Step 2: Run** `npx vitest run src/lib/log/exercise-catalog.test.ts src/lib/engine/strength.test.ts src/lib/engine/rules`. Expected: FAIL.
- [ ] **Step 3: Implement.** Grep for other users of `REP.min`, `REP.max`, `addLbUpper` and `addLbLower`, and update them (for example `src/lib/plan` prescription rendering).
- [ ] **Step 4: Run** the same command, then `npx vitest run src/lib`. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(engine): per-pattern rep ranges and percentage progression`.

### Task 2: Migration 0008 and exercise storage

**Files:**
- Modify: `src/db/schema.ts` and `src/lib/log/strength.ts` (`ensureDefaultExercises`, `createExercise`, plus new `exerciseIncrements`).
- Create: `drizzle/0008_*.sql`, via `npx drizzle-kit generate`.
- Test: `src/lib/log/strength.test.ts`.

**Interfaces:**
- Consumes: `classifyExercise` and `Pattern` (Task 1).
- Produces:
  - `exercises.pattern`: `text("pattern", { enum: ["compound", "isolation"] })`, nullable.
  - `exercises.incrementLb`: `doublePrecision("increment_lb")`, nullable.
  - `ensureDefaultExercises` also sets `pattern` on default rows where it is null.
  - `createExercise(db, name, category)` sets `pattern` from `classifyExercise(name).pattern` when the category is `strength`.
  - `export async function ensureExercisesByName(db: Db, names: readonly string[]): Promise<Map<string, Exercise>>`. It returns existing exercises (case-insensitive), creates missing ones with the classified category, and un-archives archived ones.
  - `export async function exerciseIncrements(db: Db): Promise<Map<string, number>>` maps names to `incrementLb` where it is set.

- [ ] **Step 1: Write failing tests.**
  - After `ensureDefaultExercises`, Lat Pulldown has pattern `compound` and Dumbbell Lateral Raise has `isolation`.
  - `createExercise(db, "Hack Squat", "strength")` gets `compound`.
  - `ensureExercisesByName(db, ["Lat Pulldown", "Invented Lift Press"])`:
    - returns both;
    - creates the second as strength and compound;
    - a second call creates nothing.
  - `exerciseIncrements` returns only rows with `increment_lb` set.
- [ ] **Step 2: Run** `npx vitest run src/lib/log/strength.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Add the columns, generate the migration, and check that it is only `ADD COLUMN` statements.
  - Implement the functions.
  - Apply locally: stop the dev server with `kill -INT`, migrate, then restart in terminal tab c6.
- [ ] **Step 4: Run** `npx vitest run src/lib/log`. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(log): exercise pattern and increment storage`.

### Task 3: Workout blocks from today's plan

**Files:**
- Modify: `src/lib/log/strength-view.ts` and `src/lib/plan/service.ts` (new `todayPrescription`).
- Test: `src/lib/log/strength-view.test.ts` and `src/lib/plan/service.test.ts`.

**Interfaces:**
- Consumes:
  - `getDayPlan` and `DaySession` (existing);
  - `ensureExercisesByName` and `exerciseIncrements` (Task 2);
  - `Prescription` (engine).
- Produces:
  - `export async function todayPrescription(db: Db, sessionLocalDate: string, now: Date, tz: string): Promise<Prescription[]>`.
    - It returns `[]` unless `sessionLocalDate === localDate(now, tz)`.
    - Otherwise it takes `details.prescription` from today's adapted strength, lower-leg and core sessions (via `getDayPlan`), concatenated in slot order. Rest and done sessions are skipped.
    - It reuses `getDayPlan`'s existing logging behavior, the same call Today makes.
  - `export type Block = { exerciseId: string; name: string; planned: Prescription | null }`.
  - `export function workoutBlocks(planned: readonly (Prescription & { exerciseId: string })[], sets: readonly { exerciseId: string; exerciseName: string }[], picks: readonly { id: string; name: string }[]): Block[]`.
    - Order: planned (in prescription order), then logged-only exercises in order of first set, then picks.
    - No duplicates. A planned exercise that also has sets keeps its `planned`.
  - `export function plannedRowCount(planned: Prescription | null, savedSets: number): number` returns `max(planned.sets - savedSets, 1)`, or 1 with no plan.

- [ ] **Step 1: Write failing tests.**
  - **`strength-view.test.ts`:**
    - **`workoutBlocks` ordering and no-duplicate cases:**
      - planned [A, B], sets [C, A], picks [D, B] gives `[A(planned), B(planned), C, D]`;
      - `A.planned` is not null.
    - **`plannedRowCount`:** `(3 sets, 0)` gives 3; `(3, 2)` gives 1; `(3, 5)` gives 1; `(null, 4)` gives 1.
  - **`service.test.ts`, `todayPrescription`:**
    - For today with a planned upper strength session (via `setup()` + `ensureWeek`, choosing a strength day as `now`), it returns that session's prescription exercise names.
    - For a different `sessionLocalDate`, it returns `[]`.
    - With a pain hold active on a lower day, Box Jump is absent (Review Focus 4). Use `jointStatus: "unrestricted"` so plyometrics are planned, then the logged pain hold strips them.
- [ ] **Step 2: Run** both files. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/lib/log src/lib/plan`. Expected: PASS.
- [ ] **Step 5: Commit** with message `feat(log): build workout cards from today's planned lifts`.

### Task 4: Workout page, exercise cards with per-set rows

**Files:**
- Modify:
  - `src/app/log/strength/[id]/page.tsx`;
  - `src/app/log/strength/[id]/set-row.tsx`;
  - `src/app/log/strength/strength.module.css`;
  - `src/lib/log/strength-view.ts`.
- Test: `src/lib/log/strength-view.test.ts`.

**Interfaces:**
- Consumes:
  - `todayPrescription`, `workoutBlocks`, `plannedRowCount` (Task 3);
  - `ensureExercisesByName`, `exerciseIncrements` (Task 2);
  - `CATEGORY_LABEL`, `classifyExercise` (Task 1).
- Produces:
  - `export function targetLine(p: Prescription): string`. Examples: "Target: 3 sets × 6–10 reps" and "Target: 2 sets × 20–40 sec" for plank-style items (`p.note` mentions "Hold").
  - `export function tagLine(category: Category, pattern: Pattern | null): string`. Examples: "Strength · Compound", "Strength · Isolation", "Core".

- [ ] **Step 1: Write failing tests** for `targetLine` and `tagLine`, with exactly the example strings above.
- [ ] **Step 2: Run** `npx vitest run src/lib/log/strength-view.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the helpers, then the page.**
  - **Loading:**
    - Load `prescription = finished ? [] : await todayPrescription(db, session.localDate, new Date(), tz)`.
    - Map names to ids with `ensureExercisesByName`.
    - Build `workoutBlocks`.
  - **Each card shows:**
    - the name, plus `tagLine`;
    - `targetLine` (when planned), in accent;
    - `planned.note` (the suggestion, for example "Hit 10 reps on every set: add 5 lb.");
    - "Last time: …" (existing `formatLastTime`);
    - saved sets (existing list with remove);
    - then `plannedRowCount` `SetRow`s.
  - **Row defaults:**
    - The first row uses `nextSetDefaults(mine, last)`. When there are no saved sets and `planned.targetWeightLb` is set, the weight is `targetWeightLb`.
    - Later rows use the same defaults with `setIndex + i`.
  - **`SetRow`:** the submit button becomes a 44 px round check ("Save Set" aria-label), and each row keeps its own clientId.
  - **No planned rows on a finished workout.**
- [ ] **Step 4: Run** `npx vitest run src/lib/log src/app`, `npx tsc --noEmit` and `npx eslint src`. Expected: PASS and clean.
- [ ] **Step 5: Manual check.**
  - Restart the dev server.
  - Start a workout (POST via the Start form, or `curl` the existing session page). Its page returns 200, with `Target:` in the markup on a day with a planned lift, or none otherwise.
  - There is no `Error:` in the payload.
- [ ] **Step 6: Commit** with message `feat(log): strength workout opens pre-filled from the plan`.

### Task 5: Add Exercise picker and inferred category

**Files:**
- Create: `src/app/log/strength/[id]/exercise-picker.tsx` (client).
- Modify:
  - `src/app/log/strength/[id]/page.tsx`;
  - `src/app/log/strength/[id]/set-row.tsx` (`AddExerciseForm`);
  - `src/app/log/strength/strength.module.css`.
- Test: `src/lib/log/strength-view.test.ts`.

**Interfaces:**
- Consumes: `classifyExercise` (Task 1) and `appendEx` (existing).
- Produces:
  - `export function filterExercises<E extends { name: string }>(all: readonly E[], query: string): E[]`.
    - Case-insensitive substring, trimmed.
    - An empty query returns all of them.
    - Starts-with matches sort first, then the rest alphabetically.

- [ ] **Step 1: Write failing tests** for `filterExercises`:
  - `"ex"` over [Seated Leg Extension, Exercise Bike Sprint, Cable Flex Row, Lat Pulldown] gives `[Exercise Bike Sprint, Seated Leg Extension, Cable Flex Row]`.
    - Matches where a word starts with the query come first, alphabetically. Then other substring matches, alphabetically.
    - "Starts with" means any word in the name starts with the query.
  - `""` returns all.
  - `"  LAT "` gives Lat Pulldown.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **`ExercisePicker({ sessionId, exList, exercises })`:**
    - A collapsed `<details>` "Add Exercise" (a 44 px summary) with a search input that filters a list of exercise links (`/log/strength/<id>?ex=<appendEx(list, e.id)>`).
    - "Create New" is at the bottom: the existing `AddExerciseForm`.
  - **The `AddExerciseForm` category select** defaults to `classifyExercise(typedName).category`, updated as you type (client state). You can still change it before saving.
  - **Remove the old "Pick an Exercise" select form** from the page.
- [ ] **Step 4: Run** `npx vitest run src/lib/log`, `npx tsc --noEmit` and `npx eslint src`. Expected: PASS and clean.
- [ ] **Step 5: Commit** with message `feat(log): searchable exercise picker with inferred category`.
