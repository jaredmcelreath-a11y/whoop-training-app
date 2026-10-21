# Training Engine (Plan 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app plans the owner's training. It covers:
- a season counted back from race day;
- weekly sessions for swim, bike, run, strength and lower-leg work;
- daily adjustments driven by WHOOP recovery, HRV and RHR trends, sleep debt, strain, logged pain and joint status.

Every number and every change comes from a written rule with a verified citation. The new **Plan** tab shows the week, the season and the evidence **Library**. Today shows the adjusted session with its "why".

**Architecture:**
- **Pure engine:** a pure TypeScript engine (`src/lib/engine/*`) turns inputs into a plan. It has no DB or clock access, so the whole engine is unit-testable.
- **Rules as data:** every threshold lives in a typed rules catalog (`src/lib/engine/rules/*`), with citations and evidence levels. Engine code reads `params` from the catalog and never inlines a number.
- **Persistence:** a thin layer stores generated weeks (`planned_sessions`) and every rule that fired (`recommendation_log`). The stored plan stays stable day to day. Future weeks regenerate when settings change, and completed days are never rewritten.

**Tech stack:** same as Plans 1–2. Next.js 16, TypeScript, Drizzle (PGlite for dev and test, Neon for prod), zod, Vitest, CSS modules.

**Spec:** `docs/superpowers/specs/2026-10-20-training-app-design.md`. The relevant sections:
- §7, how training adapts, the season, the ramp, and joint handling;
- §8, the approved lifting direction and lower-leg block;
- §9, the rules library and source ranking;
- §10, the Plan tab and Today;
- §11, constraints.

**Inputs that already exist:**
- WHOOP tables: `cycles`, `recoveries`, `sleeps`, `workouts`, and `whoop_raw` for body max HR.
- Plan 2 tables: `strength_sessions`, `strength_sets`, `exercises`, `cardio_entries`, `pain_entries`, `weekly_metrics`, `weight_entries`.
- Helpers: `lastTime`, `localDate`, `weekStart`, `findWhoopMatch`, `TabBar`, `requireSession`.

**This is plan 3 of 5.** Plan 4 (nutrition) reads `planned_sessions` to place meals and scale carbs.

## Global Constraints

- **Public repo.** Never commit:
  - `*.local.*`
  - `.env*`, except `.env.example`
  - `.data/`
  - `.superpowers/`
  - `.claude/`
  - any of the owner's personal or health values

  Tests and fixtures use invented values. The commit author is `288721429+jaredmcelreath-a11y@users.noreply.github.com`. Never push.
- **Auth.** Every server action and every non-public route calls `requireSession()` itself.
- **No transactions** (neon-http). Writes are single, idempotent statements.
- **Local dates.** Dates are local to `getEnv().OWNER_TZ`. Weeks start on Monday (`weekStart`).
- **Engine purity.** Nothing under `src/lib/engine/` imports `@/db`, `next/*`, or calls `Date.now()` or `new Date()` without arguments. Time and data are always parameters.
- **No magic numbers in engine logic.** Thresholds, caps, percentages and set counts come from `RULES[id].params`. A test enforces this for the catalog. Review checks it in engine code.
- **Evidence honesty.** Each rule has an `evidence` level of `"consensus" | "meta-analysis" | "trial" | "expert" | "practice"`:
  - **consensus:** a position stand or consensus statement.
  - **meta-analysis:** a meta-analysis.
  - **trial:** a single study.
  - **expert:** an expert explainer such as Attia, Huberman or Galpin.
  - **practice:** common coaching practice with no direct study.

  The UI shows this level next to each rule. The source hierarchy follows spec §9.
- **Safety beats progression.** The rules are applied in a fixed order:
  1. Pain and joint rules.
  2. Red recovery and low-trend rules.
  3. Ramp caps.
  4. Progression.

  A green streak can never push past a ramp cap or override a pain hold.
- **Not medical advice.** Pain and joint rules say "consider talking to your doctor". They never diagnose.
- **Defaults** (editable in the plan settings):
  - Race date: `2027-10-17`.
  - Season start: the first Monday on or after the settings row is created.
  - Training windows: morning `06:00–09:00`, plus an optional midday window `11:30–13:30`.
  - Long-ride day: Saturday.
  - Long run/swim day: Sunday.
  - Rest day: Monday.
  - Joint status: `"caution"`.
  - Pool length: 25 yd.

## Review Focus

1. **Missing data.** Examples: no recovery yet today, fewer than 30 days of HRV history, or no max HR. **Expected:** the session runs as planned, with an "insufficient data" reason. The engine never crashes and never invents a value. Tests: Task 6 and Task 7.
2. **Race date changed mid-season.** **Expected:**
   - future weeks regenerate;
   - completed and past days stay unchanged;
   - the gain phase shrinks, never the build phase.

   Tests: Task 3 and Task 7.
3. **A green streak meets a ramp cap.** **Expected:** endurance hours and run minutes never exceed the caps, across a simulated 52 weeks of all-green days. Tests: Task 3 (property test) and Task 6.
4. **Red day plus pain.** **Expected:** rest or mobility, not a swap to a hard bike. A rising-pain hold persists until the pain has stayed under the threshold for the required number of days. Test: Task 6.
5. **Week boundaries.** Sunday 11 pm and Monday 12:30 am in Chicago, including the November DST week. **Expected:** sessions land in the correct local week and day. Test: Task 7.

---

### Task 1: Plan settings and plan tables

**Files:**
- Modify: `src/db/schema.ts`
- Create: the generated `drizzle/0002_*.sql`, `src/lib/plan/settings.ts`, `src/lib/plan/settings.test.ts`

**Interfaces (Produces):**
- **Tables:**
  - `plan_settings`: a single row, `id = 1`, with `CHECK (id = 1)`. Columns:
    - `race_date` (date)
    - `season_start` (date)
    - `windows` (jsonb `{ start: "HH:MM"; end: "HH:MM" }[]`)
    - `long_ride_dow`, `long_run_dow`, `rest_dow` (int, 0 = Monday … 6 = Sunday)
    - `joint_status` (`"unrestricted" | "caution" | "restricted"`)
    - `pool_length_m` (double)
    - `updated_at`
  - `planned_sessions`. Columns:
    - `id` (uuid)
    - `local_date` (date)
    - `slot` (int, its order within the day)
    - `kind` (`"swim" | "bike" | "run" | "strength" | "lower_leg" | "core" | "mobility" | "rest"`)
    - `title` (text)
    - `duration_min` (int)
    - `intensity` (`"z1" | "z2" | "tempo" | "threshold" | "intervals" | "strength" | "easy"`)
    - `details` (jsonb, the structured prescription)
    - `rule_ids` (text[])
    - `week_start` (date)
    - `generated_at`
    - `status` (`"planned" | "done" | "skipped"`)
    - `completed_ref` (text, nullable; the id of the matching log entry or WHOOP workout)

    Unique on (`local_date`, `slot`).
  - `recommendation_log`. Columns:
    - `id`, `local_date`, `planned_session_id` (nullable; set null on delete)
    - `rule_id`, `inputs` (jsonb), `effect` (text), `created_at`

    Unique on (`local_date`, `planned_session_id`, `rule_id`).
- **Functions:**
  - `getPlanSettings(db, now: Date, tz: string): Promise<PlanSettings>`. It creates the default row on first call with `on conflict do nothing`, then re-selects.
  - `updatePlanSettings(db, patch: Partial<PlanSettings>): Promise<PlanSettings>`.
  - `PlanSettingsInput` is a zod schema with these rules:
    - `race_date` falls 12–104 weeks after `season_start`;
    - the three days of week are all different;
    - windows have `start < end`.

- [ ] **Step 1: Failing tests.**
  - The first `getPlanSettings` call creates the defaults from Global Constraints. `season_start` is the first Monday on or after the creation local date. A second call returns the same row.
  - `updatePlanSettings({ joint_status: "unrestricted" })` changes only that field.
  - `PlanSettingsInput` rejects a race 8 weeks out, rejects `rest_dow === long_ride_dow`, and rejects a `06:00–05:00` window.
  - Inserting a second `plan_settings` row with `id = 2` throws.
  - Two `planned_sessions` rows with the same `local_date` and `slot` conflict.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Add the tables.
  - Run `npm run db:generate`. Check the CHECK constraint and the unique constraints.
  - Run `npm run db:migrate` locally, with the dev server stopped. It must be additive only.
- [ ] **Step 4:** Run `npm test` and the typecheck. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(plan): settings and plan tables`.

### Task 2: Rules catalog with verified citations

**Files:**
- Create:
  - `src/lib/engine/rules/types.ts`
  - `src/lib/engine/rules/catalog.ts`
  - `src/lib/engine/rules/catalog.test.ts`
  - `docs/rules-sources.md` (the research notes: each citation, what it says, and why the parameter was chosen)

**Interfaces (Produces):**
- **Types:**
  - `type Evidence = "consensus" | "meta-analysis" | "trial" | "expert" | "practice"`
  - `type Citation = { authors: string; year: number; title: string; venue: string; url: string; doi?: string }`
  - `type Rule<P> = { id: string; area: "season" | "volume" | "intensity" | "strength" | "recovery" | "pain" | "concurrent" | "lower_leg"; statement: string; why: string /* ≤120 chars, shown in UI */; params: P; evidence: Evidence; citations: Citation[] /* ≥1 unless evidence==="practice" */; caveat?: string }`
- **`RULES`** is a typed record holding at least the rule ids below. Each param is the planner's starting value. The researcher must verify every citation and may adjust a param to match the source, recording why in `docs/rules-sources.md`. The ids and param *names* are fixed, because Tasks 3–6 depend on them.

  | id | params (starting values) | Starting sources to verify |
  |---|---|---|
  | `season.phases` | `{ taperWeeks: 2, peakWeeks: 4, buildWeeks: 12 }`; base = the rest | Bompa & Buzzichelli periodization text; Mujika & Padilla 2003 (taper) |
  | `season.gainPhase` | `{ maxWeeks: 26 }`, capped at build start | spec ruling; Iraki et al. 2019 (off-season bulking) |
  | `season.recoveryWeek` | `{ every: 4, volumeFactor: 0.7 }` | practice / expert; find the best available source |
  | `volume.endurance` | `{ startHours: 5, peakHours: 11, maxWeeklyIncreasePct: 10 }` | 70.3 coaching ranges (expert/practice); Gabbett 2016 on load spikes |
  | `volume.run` | `{ startMinPerWeek: 45, maxWeeklyIncreasePct: 10, absoluteCapWeeklyIncreasePct: 30 }`; uses walk–run first | Nielsen et al. 2014 (novice runners, >30% increase); Buist et al. 2008 (10% rule RCT, labelled honestly) |
  | `volume.split` | `{ swim: 0.25, bike: 0.45, run: 0.30 }` of endurance hours; run share starts at 0.20 for the first 8 weeks | practice; label it so |
  | `intensity.distribution` | `{ lowShare: 0.8 }` by time | Seiler 2010; Stöggl & Sperlich 2014 |
  | `intensity.zones` | WHOOP-style % of max HR, `{ z1: [0.5,0.6], z2: [0.6,0.7], z3: [0.7,0.8], z4: [0.8,0.9], z5: [0.9,1.0] }` | WHOOP zone definition; ACSM guidelines |
  | `recovery.color` | `{ green: 67, yellow: 34 }` (green ≥ 67, yellow 34–66, red ≤ 33) | WHOOP's published recovery bands |
  | `recovery.yellowScale` | `{ durationFactor: 0.8, dropHighIntensity: true }` | Kiviniemi et al. 2007; Javaloyes et al. 2019 (HRV-guided training) |
  | `recovery.redSwap` | `{ swapTo: "z1_or_mobility", maxMin: 40 }` | Kiviniemi 2007; Plews et al. 2013 |
  | `recovery.hrvTrend` | `{ rollingDays: 7, baselineMinDays: 30, baselineMaxDays: 60, swcSd: 0.5 }` (uses ln rMSSD) | Plews et al. 2012, 2013 |
  | `recovery.rhrTrend` | `{ rollingDays: 7, elevatedBpm: 5 }` | Buchheit 2014 (HR monitoring review) |
  | `recovery.lowStreak` | `{ days: 3, action: "rest_or_deload", volumeFactor: 0.6 }` | spec §7; Plews 2013 |
  | `recovery.sleepDebt` | `{ windowDays: 3, debtMin: 90 }` triggers moving hard sessions plus an earlier-bedtime note | Fullagar et al. 2015 (sleep and performance); Watson 2017 |
  | `recovery.greenStreak` | `{ days: 3 }` allows the next planned progression only | spec §7 |
  | `strength.volume` | `{ setsPerMusclePerWeek: [10, 14] }` | Schoenfeld, Ogborn & Krieger 2017 |
  | `strength.frequency` | `{ perMusclePerWeek: 2 }` | Schoenfeld et al. 2016; Schoenfeld, Grgic & Krieger 2019 |
  | `strength.repRange` | `{ min: 10, max: 12, rirTarget: [1, 3] }` | Schoenfeld et al. 2017 (load); Robinson et al. 2024 (proximity to failure) |
  | `strength.progression` | `{ addLbUpper: 5, addLbLower: 10, whenAllSetsAtMax: true }` (double progression) | ACSM 2009 position stand (Ratamess et al.) |
  | `strength.taper` | `{ volumeFactor: 0.6 }` in taper weeks | Mujika & Padilla 2003 |
  | `concurrent.spacing` | `{ minHoursBetweenHardCardioAndLift: 6, noLowerDayWithinHoursBeforeKeyRun: 24 }` | Wilson et al. 2012; Schumann et al. 2022 |
  | `pain.monitoring` | `{ maxDuring: 3, risingSessions: 2, holdUntilBelowDays: 3 }` (0–10 scale) | Silbernagel et al. 2007 (pain-monitoring model) |
  | `pain.jointStatus` | `{ caution: { plyo: false, runIncreaseFactor: 0.5 }, restricted: { run: false, plyo: false } }` | practice, plus the spec's doctor-follow-up rule |
  | `lower_leg.block` | `{ sessionsPerWeek: 2, tibialisSets: 2, soleusSets: 2, gastrocSets: 2 }` | the evidence is weak and mechanistic. Label it honestly, with graded load as the main measure (spec §8) |

- [ ] **Step 1: Research.** Use the web.
  - For each starting source, confirm the authors, year, title, venue and a working URL or DOI.
  - Confirm that the source actually supports the statement. If it doesn't, find a better one or downgrade the `evidence` level.
  - Record everything in `docs/rules-sources.md`, one section per rule id.
  - Include no owner-specific data.
- [ ] **Step 2: Failing tests** in `catalog.test.ts`.
  - Every rule has a non-empty `statement`, a `why` of 120 characters or fewer, and an `evidence` level.
  - Every rule has at least one citation with an `https` url, unless `evidence === "practice"`.
  - Every id listed above exists, with the param names listed.
  - `recovery.color.green > recovery.color.yellow`.
  - The `volume.split` shares sum to 1 (±0.001).
  - No two rules share an id.
- [ ] **Step 3: Implement the catalog.** Run the tests. Expected: PASS.
- [ ] **Step 4:** Commit: `feat(engine): rules catalog with verified sources`.

### Task 3: Season model and volume ramp

**Files:**
- Create: `src/lib/engine/season.ts`, `src/lib/engine/season.test.ts`

**Interfaces:**
- **Consumes:** `RULES` and `PlanSettings` (the type only).
- **Produces:**
  - `type Phase = "base" | "build" | "peak" | "taper" | "race"`
  - `seasonCalendar(s: { seasonStart: string; raceDate: string }): { weeks: { weekStart: string; index: number; phase: Phase; recovery: boolean; gainPhase: boolean }[] }`
    - Phases count backward from the race week.
    - A recovery week falls every `season.recoveryWeek.every` weeks, but never in taper.
    - `gainPhase` covers the weeks from season start up to `min(maxWeeks, buildStart)`.
  - `weeklyTargets(cal, weekIndex, history: { actualEnduranceMin: number[]; actualRunMin: number[] }): { enduranceMin: number; runMin: number; swimMin: number; bikeMin: number }`
    - Ramps from `startHours` to `peakHours` across base and build. It holds through peak, and taper applies the factor.
    - The `maxWeeklyIncreasePct` is applied against the **previous week's actual** (from `history`). The ramp never compounds on missed plans.
    - Run minutes follow `volume.run`.
    - Swim and bike take the remaining split.

- [ ] **Step 1: Failing tests.**
  - For season `2026-10-26 → 2027-10-17`:
    - the last week is `race`;
    - the 2 weeks before it are `taper` and the 4 before those are `peak`;
    - build is 12 weeks and base is the rest;
    - `gainPhase` covers the first 26 weeks only, because build starts later than that.
  - Race `2027-06-06` with the same start: `gainPhase` ends the week before build starts, and build keeps its full 12 weeks. (Review Focus 2)
  - No recovery week falls in taper.
  - **Property test:** loop 52 weeks, feeding each week's target back as the "actual". Every week's endurance and run minutes are ≤ previous × (1 + pct/100), and never exceed `peakHours`. (Review Focus 3)
  - When the previous actual was 50% of plan (a missed week), the next target is capped against the *actual*.
  - Recovery weeks are at `volumeFactor` × the surrounding level.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement. Do the date math with `weekStart`-style UTC arithmetic on date strings.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(engine): season calendar and volume ramp`.

### Task 4: Weekly session template

**Files:**
- Create: `src/lib/engine/week.ts`, `src/lib/engine/week.test.ts`

**Interfaces:**
- **Consumes:** `seasonCalendar`, `weeklyTargets`, `RULES`, `PlanSettings`.
- **Produces:**
  - `type PlannedSessionDraft = { localDate: string; slot: number; kind; title; durationMin; intensity; details: Record<string, unknown>; ruleIds: string[] }`
  - `buildWeek(input: { weekStart: string; phase: Phase; recovery: boolean; targets: ReturnType<typeof weeklyTargets>; settings: PlanSettings; strengthDays?: ("upperA" | "lower" | "upperB")[] }): PlannedSessionDraft[]`
- **Placement rules** (each placement adds its rule id to `ruleIds`):
  - The rest day gets a single `rest` session.
  - **Long sessions.** The long ride goes on `long_ride_dow`, and the long run or swim goes on `long_run_dow`.
  - **Strength.** There are three strength days: Upper A, Lower and Upper B, spread out.
    - The Lower day is never the day before a key run, meaning the long run or any `tempo`, `threshold` or `intervals` run (`concurrent.spacing`).
    - On days with both strength and hard cardio, the cardio goes in slot 0 (window 1) and strength in slot 1 (window 2). The `details.window` index is set.
  - **Lower-leg block** on 2 non-consecutive days (`lower_leg.block`).
  - **Core** is attached to two strength days.
  - **Intensity:** about 80% of endurance minutes are z1/z2 and the rest is `tempo`, `threshold` or `intervals` (`intensity.distribution`). Base weeks use only z2 plus strides.
  - **Running:** in the first 8 weeks, runs are walk–run, with `details.intervals` like `{ run: 1, walk: 1, reps: 10 }` progressing. Otherwise runs are continuous.
  - **Recovery weeks** drop the hard sessions.
  - **Taper** keeps some intensity at reduced volume.
  - **Plyometrics** appear in Lower only when `joint_status === "unrestricted"` (`pain.jointStatus`).

- [ ] **Step 1: Failing tests** (fixed settings with invented dates).
  - The minutes per sport sum to the targets, within 5 minutes.
  - At least 75% of endurance minutes are z1/z2.
  - Exactly 3 strength sessions per week, in the order Upper A, Lower, Upper B.
  - The Lower day is never the day before the long run or a hard run.
  - Nothing except `rest` is on the rest day.
  - 2 lower-leg blocks, not on consecutive days.
  - `joint_status: "caution"` gives no plyo exercises. `"unrestricted"` allows them.
  - A recovery week has no `threshold` or `intervals` sessions.
  - Every draft has at least 1 `ruleIds` entry, and every id exists in `RULES`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(engine): weekly session template`.

### Task 5: Strength prescriptions

**Files:**
- Create: `src/lib/engine/strength.ts`, `src/lib/engine/strength.test.ts`

**Interfaces:**
- **Consumes:** `RULES`, and the exercise names from `DEFAULT_EXERCISES` (`src/lib/log/exercise-catalog.ts`).
- **Produces:**
  - `TEMPLATES: Record<"upperA" | "lower" | "upperB" | "lowerLeg" | "core", { exercise: string; sets: number; muscles: string[] }[]>`
    - Built from the owner's approved direction: machine-heavy, 10–12 reps.
    - Upper A and Upper B both cover chest, back, shoulders (including side and rear delts), biceps and triceps.
    - Over a week this gives 10–14 hard sets for each upper muscle, and frequency 2.
    - Lower covers quads, hamstrings, glutes, adductors and calves.
    - Plyo is listed separately as `plyo` items, filtered by joint status.
  - `prescribe(template, history: Map<string /*exercise name*/, { sets: { reps: number; weightLb: number | null }[] } | null>, opts: { recoveryWeek: boolean; taper: boolean; jointStatus }): { exercise: string; sets: number; repRange: [number, number]; targetWeightLb: number | null; note: string; ruleIds: string[] }[]`
    - **Double progression:** if every set last time reached `repRange.max`, add `addLbUpper` or `addLbLower`. Otherwise keep the weight and aim for more reps.
    - With no history, `targetWeightLb` is null and the note reads "Pick a weight you can do for 10–12 with 1–3 reps left".
    - In recovery and taper weeks, multiply the sets by the relevant factor and round half up, with a minimum of 1.
  - `weeklySetsPerMuscle(templates): Record<string, number>`

- [ ] **Step 1: Failing tests.**
  - Every upper muscle has 10–14 sets per week across Upper A and Upper B, and each is trained in both.
  - With history of 3×12 at 100 lb on an upper lift, the target is 105. With 12, 11, 10 the weight stays at 100 and the note asks for more reps.
  - Lower uses `addLbLower`.
  - With no history, the weight is null and the note is as above.
  - In a recovery week the sets are reduced.
  - `jointStatus: "caution"` filters out plyo.
  - Every exercise name exists in `DEFAULT_EXERCISES`.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(engine): strength templates and progression`.

### Task 6: Readiness and daily adaptation

**Files:**
- Create: `src/lib/engine/readiness.ts`, `src/lib/engine/adapt.ts`, and their tests

**Interfaces:**
- **Consumes:** `RULES` and `PlannedSessionDraft`.
- **Produces:**
  - `type DayInputs = { date: string; recoveryScore: number | null; recoveryState: string | null; hrvLn7: number | null; hrvBaseline: { mean: number; sd: number; days: number } | null; rhr7: number | null; rhrBaseline: number | null; sleepDebtMin3d: number | null; recentScores: (number | null)[] /* last 7, oldest first */; pain: { area: string; date: string; max: number; context: string }[] /* last 14d */; jointStatus }`
  - `readiness(d: DayInputs): { color: "green" | "yellow" | "red" | "unknown"; hrvTrend: "low" | "normal" | "high" | "unknown"; rhrElevated: boolean | null; lowStreak: boolean; greenStreak: boolean; sleepDebt: boolean; painHold: { area: string; reason: string } | null; fired: { ruleId: string; inputs: Record<string, unknown> }[] }`
    - The HRV trend is low when `hrvLn7 < mean − swcSd·sd`.
    - It is unknown when the baseline has fewer than `baselineMinDays` days.
  - `adapt(sessions: PlannedSessionDraft[], r: ReturnType<typeof readiness>): { sessions: (PlannedSessionDraft & { adjusted: boolean; reasons: { ruleId: string; text: string }[] })[] }`
    - Steps run in the order from Global Constraints:
      1. **Pain hold.** Replace runs with a bike or swim of the same duration at z2. If the day is also red, replace them with mobility.
      2. **Red day.** Swap anything hard to z1 or mobility, capped at `maxMin`.
      3. **Low streak.** Apply `volumeFactor` or turn the day into rest.
      4. **Yellow day.** Scale the duration and drop the high-intensity work.
      5. **Sleep debt.** Mark hard sessions "move later in the week", and add a bedtime note.
    - Strength on a red day becomes "mobility + optional light technique".
    - Unknown data changes nothing and adds the reason "Not enough data yet — following the plan".

- [ ] **Step 1: Failing tests.**
  - `recoveryScore` 70 gives green, 50 gives yellow, 20 gives red. Null gives unknown and the plan is unchanged with the "Not enough data" reason. (Review Focus 1)
  - With 20 baseline days, the HRV trend is `unknown`.
  - With 40 days, 7-day ln rMSSD is 0.6 SD below the mean, so the trend is `low`.
  - Three scores ≤ 33 in a row give `lowStreak`.
  - Red plus a knee pain hold, on a day with a run: the result is mobility, not a hard bike. (Review Focus 4)
  - Pain 5 after a run, then 2, 2, 2 over 3 days: the hold clears only after `holdUntilBelowDays`.
  - A yellow tempo run becomes a shorter z2 run.
  - A green streak never raises the durations above the draft. Progression happens only in week generation, under the caps. (Review Focus 3)
  - `readiness.fired` lists every rule that changed something, with its inputs.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(engine): readiness and daily adaptation`.

### Task 7: Plan service (generate, persist, adapt, complete)

**Files:**
- Create: `src/lib/plan/service.ts`, `src/lib/plan/inputs.ts`, `src/lib/plan/service.test.ts`

**Interfaces:**
- **Consumes:**
  - everything from Tasks 1–6;
  - the WHOOP tables (`recoveries`, `cycles`, `sleeps`, `workouts`);
  - `pain_entries`, `cardio_entries`, `strength_sessions` and `strength_sets`;
  - `lastTime`, `localDate` and `weekStart`.
- **Produces:**
  - `loadDayInputs(db, date: string, tz: string, settings): Promise<DayInputs>`
    - ln rMSSD comes from `recoveries.hrv_rmssd_ms`.
    - The baseline window covers the previous 30–60 days, excluding the last 7.
    - Sleep debt is the sum over 3 nights of (need − asleep), where both values exist.
  - `ensureWeek(db, weekStart: string, now: Date, tz: string): Promise<void>`
    - Generates the week with `buildWeek` plus `prescribe`, using `lastTime` history, and inserts it. If the week already exists, it does nothing.
    - Past dates are never generated.
  - `regenerateFuture(db, fromDate: string, now, tz): Promise<{ deleted: number; created: number }>`
    - Deletes planned sessions with `local_date ≥ fromDate`, `status = 'planned'` and no `completed_ref`, then regenerates them.
    - It is called after `updatePlanSettings`.
  - `getDayPlan(db, date: string, now, tz): Promise<{ sessions: AdaptedSession[]; readiness }>`
    - Calls `ensureWeek`, then `adapt` with `loadDayInputs`.
    - Upserts `recommendation_log` rows for the rules that fired.
    - Adaptation is applied at read time and is not persisted onto `planned_sessions`.
  - `markCompletion(db, date: string): Promise<number>`
    - Matches planned sessions to that day's logs and WHOOP workouts by kind:
      - swim, bike and run to `cardio_entries` of the same kind;
      - strength to a finished `strength_session`;
      - any of those to a WHOOP `workouts` row with a fitting sport, through `findWhoopMatch`'s sport lists.
    - It sets `status = 'done'` and `completed_ref`.
    - It is called from `getDayPlan` for today and yesterday.
  - `getWeekPlan(db, weekStart, now, tz)` returns the 7 days of sessions with their status.

- [ ] **Step 1: Failing tests** (PGlite, invented data).
  - `ensureWeek` twice gives the same rows.
  - Changing the race date, then `regenerateFuture(today)`:
    - past rows and `done` rows are untouched;
    - future rows are regenerated;
    - the gain-phase flag is shrunk in the week `details`.

    (Review Focus 2)
  - With 20 days of recoveries, `loadDayInputs` gives `hrvBaseline: null`. With 45 days, it gives a baseline with `days` between 30 and 38.
  - **Week boundaries** (Review Focus 5):
    - 2026-11-01 23:30 Chicago (after the DST change) maps to Sunday 2026-11-01 in week `2026-10-26`;
    - 2026-11-02 00:30 maps to Monday in week `2026-11-02`.
  - `getDayPlan` with no recovery today gives the unadjusted sessions plus the "Not enough data" reason. (Review Focus 1)
  - A logged swim on a day with a planned swim, then `markCompletion`, gives `done` with `completed_ref` set.
  - `recommendation_log` gets no duplicates when the same day is read twice.
- [ ] **Step 2:** Run the tests. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests and typecheck. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(plan): generate, adapt and track the plan`.

### Task 8: Plan tab (week, season, settings) and Library

**Files:**
- Create:
  - `src/app/plan/page.tsx` (week view)
  - `src/app/plan/season/page.tsx`
  - `src/app/plan/settings/page.tsx`
  - `src/app/plan/settings/actions.ts`
  - `src/app/plan/library/page.tsx`
  - `src/app/plan/plan.module.css`
- Modify: `src/components/tab-bar.tsx` (make Plan a link)

**Interfaces:**
- **Consumes:** `getWeekPlan`, `getPlanSettings`, `updatePlanSettings`, `regenerateFuture`, `seasonCalendar`, `RULES`, `TabBar`, `SubmitButton`, and `keepInputOnSubmit` (from Plan 2's final fixes).

- [ ] **Step 1: Implement the pages.**
  - **Week view:**
    - Monday–Sunday, with prev/next week links using `?week=YYYY-MM-DD`.
    - Each day lists its sessions: kind icon or label, title, minutes, intensity, and a done ✓ or skipped mark.
    - Tapping a session expands it. Strength shows its exercise list with sets × reps @ target. Runs show their intervals.
    - Each session has a "Why" link that jumps to the rule ids in the Library.
  - **Season view:**
    - a vertical timeline of phases with week counts;
    - this week highlighted;
    - a countdown "N weeks to race";
    - gain-phase weeks marked.
  - **Settings:**
    - race date, windows (up to 2), long-ride, long-run and rest days, joint status (with an explanation of each option), and pool length.
    - Saving validates with `PlanSettingsInput` and calls `regenerateFuture(today)`, then confirms with "Future weeks re-planned".
    - Each action calls `requireSession()` first.
  - **Library:**
    - every rule grouped by area, showing the statement, an evidence badge (colour per level), the params in plain words, its citations as links, and the caveat;
    - each rule has an `id` anchor;
    - a short note at the top explains the evidence levels.
- [ ] **Step 2: Manual check.**
  - Use curl with a minted session cookie and check that the HTML renders. Avoid `/`.
  - Change the race date and confirm the next week's sessions change.
  - Check the layout at 375 px.
  - Delete any test rows you made, and restore the settings to their previous values.
- [ ] **Step 3:** Run the tests and typecheck. Expected: PASS. Commit: `feat(plan): plan tab, season, settings, library`.

### Task 9: Today training card and "why" sheet

**Files:**
- Modify: `src/app/page.tsx`, `src/app/today.module.css`, `src/lib/today.ts` (only if a summary field is needed)
- Create: `src/app/today-training.tsx` (server component), `src/app/why-sheet.tsx` (client, a `<details>`-based sheet)

**Interfaces:**
- **Consumes:** `getDayPlan` (which also runs `markCompletion`).

- [ ] **Step 1: Implement the card.** Add a "Today's training" card above the tiles. It shows:
  - each adjusted session's title, minutes and intensity;
  - an "Adjusted" badge with the first reason when it was changed;
  - a ✓ when it's done.

  The "Why" sheet lists every reason with its rule statement, evidence badge, and a link to `/plan/library#<ruleId>`.
  - Strength sessions link to "Start workout" (`/log/strength`).
  - Cardio sessions link to `/log/cardio?kind=<kind>`. Accept and preselect that query in the cardio form.
  - The sleep-debt bedtime note shows as a small line.
  - When there's no plan yet, the card shows "Set up your plan" linking to `/plan/settings`.
- [ ] **Step 2: Manual check.**
  - Use curl with a minted cookie. Loading `/` triggers the normal WHOOP sync-on-open, which is acceptable here.
  - Check that the card renders, with adjusted reasons when today's recovery is yellow or red.
  - Check the layout at 375 px.
- [ ] **Step 3:** Run the tests and typecheck. Expected: PASS. Commit: `feat(today): training card with why sheet`.
