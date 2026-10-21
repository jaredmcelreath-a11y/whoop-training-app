# Nutrition and Water (Plan 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app tells the owner how much to eat and drink each day, and when. It covers:

- **Targets:** calories, protein, carbs, fat and key micronutrients, plus water.
- **Daily adjustment:** carbs and calories scale with the day's planned training.
- **Calibration:** calories self-correct from what the owner actually eats against how their weight actually moves.
- **Safety floor:** a floor sourced from REDs research means targets never drop dangerously low.
- **Sources:** food and water come from Cronometer through Apple Health, using an iOS Shortcut that posts to the app. A one-tap water button is also available.
- **Day tab:** places meals, snacks, supplements and bedtime around the day's workouts.
- **Today:** shows "eaten so far vs target".

Every number comes from a sourced rule in the catalog.

**Architecture:**
- **Pure engines:** `src/lib/engine/energy.ts`, `hydration.ts` and `day-timeline.ts` take inputs and return targets. They have no DB access and no clock, and every number comes from `RULES`.
- **Service:** `src/lib/nutrition/*` loads inputs from existing tables (weight trend, latest scan's lean mass, WHOOP cycle kJ, planned sessions, ingested nutrition) and persists a weekly energy estimate.
- **Ingest endpoint:** a public endpoint `POST /api/ingest/health`, authenticated by a bearer token (constant-time compare), accepts daily nutrient totals from the Shortcut.

**Tech stack:** same as Plans 1–3.

**Spec:**
- §6: Apple Health and Shortcut, Cronometer.
- §8: targets, calibration, gain rate, hydration, the safety floor, meal timing, and turning off Cronometer's exercise adjustment.
- §9: the rules and evidence library.
- §10: the Day tab, and Today's fuel tiles.

**This is plan 4 of 5.**

## Global Constraints

- **Public repo.** Never commit any of these:
  - `*.local.*`
  - `.env*` (except `.env.example`)
  - `.data/`
  - `.superpowers/`
  - `.claude/`
  - owner health values

  Owner-specific data lives only in the DB: the reference-intake profile, the supplement list, and nutrition. Tests use invented values. Commit author `288721429+jaredmcelreath-a11y@users.noreply.github.com`. Never push.
- **Auth.** Every server action and non-public route calls `requireSession()`. The ingest route is the only new public path. It authenticates with `Authorization: Bearer ${INGEST_TOKEN}`, using `timingSafeEqual` after a length check.
- **No transactions.** Use single idempotent statements.
- **Local dates.** Use `OWNER_TZ`.
- **Engines:**
  - **Purity:** engines import nothing from `@/db` or `next/*`, and never call `new Date()` without an argument.
  - **No magic numbers:** every threshold lives in `RULES`. New nutrition rules go in the catalog with verified citations, honest `evidence` levels, `role: "supports" | "context"`, and caveats for numbers that come from practice. The catalog's numbers-in-text test must pass.
- **Safety floor.** Rule application order:
  1. Energy-availability floor.
  2. Protein minimum.
  3. Fat minimum.
  4. Distribution and calibration.

  A calibration result or a weight trend can never push the calorie target below the floor.
- **Not medical advice.** Supplement and lab-related notes say "talk to your doctor or a registered dietitian". The app never doses beyond what a sourced rule states.
- **Units.**
  - Canonical storage: mass in grams (macros), mg or µg for micros (as Health reports them), water in mL, energy in kcal.
  - Display: water in oz (1 fl oz = 29.5735 mL) and weight in lb.

## Review Focus

1. **The Shortcut posts the same day twice, or a partial day followed by the full day.**
   - Expected: the latest post replaces that day's totals. They are never summed, and nothing is lost when the earlier post is newer than the later one. Order by the payload's `sentAt`.
   - Tests: Task 3.
2. **No intake data, no weight data, or no scan.**
   - Expected: the targets come from the documented fallback chain, and confidence shows "low". There is no crash and no invented number.
   - Tests: Task 5 and Task 7.
3. **Calibration says "eat less" (weight rising faster than target), or WHOOP reports huge burns.**
   - Expected: the calorie target never drops below the energy-availability floor, and never changes more than the per-week step cap.
   - Tests: Task 5 (property).
4. **Bad or hostile ingest requests:** a missing or wrong token, a body over 64 KB, negative or absurd values, or unknown types.
   - Expected: 401 / 413 / 400, and nothing written.
   - Tests: Task 3.
5. **Water counted twice.** The owner logs water in Cronometer and also taps "+16 oz".
   - Expected: the nutrition setting `waterSource` (`"cronometer" | "app" | "both"`) decides what counts. The default is `"app"`, and the UI explains the choice.
   - Tests: Task 6.

---

### Task 1: Nutrition tables, settings and env

**Files:**
- Modify:
  - `src/db/schema.ts`
  - `src/lib/env.ts` (adds `INGEST_TOKEN`, ≥32 chars)
  - `src/lib/env.test.ts`
  - `.env.example`
  - `src/proxy.ts` and `src/proxy.test.ts` (public path `/api/ingest/health`)
- Create: `drizzle/0003_*.sql`, `src/lib/nutrition/settings.ts` and its test

**Interfaces (Produces):**
- **Tables:**
  - `nutrition_days`
    - `local_date` (date PK), `sent_at` (timestamptz), `source` (text)
    - `kcal`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `water_ml`: double, nullable
    - `micros` (jsonb: nutrient key → `{ value, unit }`), `updated_at`
  - `water_entries`
    - `id`, `client_id` (uuid unique), `logged_at`, `local_date`, `ml` (double)
  - `nutrition_settings` (single row, `id = 1`, CHECK)
    - `ref_profile` (`"male_19_30" | "female_19_30" | "male_31_50" | "female_31_50" | null`, default null)
    - `meals_per_day` (int, default 4)
    - `water_source` (`"app" | "cronometer" | "both"`, default `"app"`)
    - `supplements` (jsonb `{ name: string; timing: "morning" | "with_meal" | "pre_workout" | "post_workout" | "evening" }[]`, default `[]`)
    - `gain_goal_lb` (double, default 15)
    - `gain_start_weight_lb` (double, nullable). When null, the service uses the first weight entry on or after `season_start`.
    - `updated_at`
  - `sweat_tests`
    - `id`, `tested_on` (date), `pre_lb`, `post_lb`, `fluid_ml`, `duration_min`, `kind` (`"run" | "bike" | "swim"`)
    - `sweat_rate_lph` (double, computed on insert), `notes`
  - `energy_estimates`
    - `week_start` (date PK), `tdee_kcal` (double)
    - `confidence` (`"low" | "medium" | "high"`)
    - `method` (`"initial" | "calibrated"`), `inputs` (jsonb), `updated_at`
- **Functions:**
  - `getNutritionSettings(db)` creates the default row on first call.
  - `updateNutritionSettings(db, patch)` validates with zod: max 20 supplements, names ≤ 60 chars.

- [ ] **Step 1: Failing tests**
  - The defaults are created once.
  - The patch validation rejects 21 supplements.
  - A second `nutrition_settings` row with `id = 2` throws.
  - `parseEnv` requires `INGEST_TOKEN` of at least 32 chars.
  - `isPublicPath("/api/ingest/health")` is true, and `"/api/ingest/healthx"` is false.
- [ ] **Step 2:** Run the tests; they should fail.
- [ ] **Step 3:** Implement. Run `db:generate`, then `db:migrate` locally with the server stopped.
- [ ] **Step 4:** Tests and typecheck pass.
- [ ] **Step 5:** Commit: `feat(nutrition): tables, settings, ingest token`.

### Task 2: Nutrition and hydration rules with verified sources

**Files:**
- Modify: `src/lib/engine/rules/catalog.ts`, `src/lib/engine/rules/types.ts` (area values `"nutrition" | "hydration" | "supplements"`), `catalog.test.ts`, `docs/rules-sources.md`
- Create: `src/lib/engine/nutrients.ts`. It holds the pure `NUTRIENTS` list and the `NutrientKey` type: `energy_kcal`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `water_ml`, plus every micronutrient key with its canonical unit. Tasks 3, 5, 6 and 7 import from it; the engine must not import the DB-backed ingest module.

**Interfaces (Produces):** new `RULES` entries. The ids and param names are fixed. The values below are the planner's starting points. The researcher verifies each citation and may adjust a value to match the source, recording why.

| id | params | starting sources to verify |
|---|---|---|
| `nutrition.protein` | `{ gPerKg: 1.8, minGPerKg: 1.6, maxGPerKg: 2.2 }` | Morton et al. 2018 (BJSM meta-analysis); Jäger et al. 2017 (ISSN position stand) |
| `nutrition.proteinPerMeal` | `{ gPerKgPerMeal: 0.4, minMeals: 4 }` | Schoenfeld & Aragon 2018 (JISSN); Jäger 2017 |
| `nutrition.carbsByLoad` | `{ tiers: [{ maxMin: 30, gPerKg: [3,5] }, { maxMin: 75, gPerKg: [5,7] }, { maxMin: 180, gPerKg: [6,10] }, { maxMin: 9999, gPerKg: [8,12] }] }`, keyed by the day's planned endurance minutes | Thomas, Erdman & Burke 2016 (ACSM/AND/DC joint position) |
| `nutrition.fatMin` | `{ pctKcalMin: 20 }` | Thomas 2016 |
| `nutrition.energyAvailability` | `{ floorKcalPerKgFfm: 30, targetKcalPerKgFfm: 45 }` | Mountjoy et al. 2023 (IOC REDs consensus); Loucks literature as context |
| `nutrition.gainRate` | `{ pctBodyweightPerWeek: 0.5, minPct: 0.25 }`. The gain phase uses `pctBodyweightPerWeek`. After the gain phase, while some of the goal remains, base and build weeks use `minPct`. Peak, taper and race weeks get no surplus (spec §8: race preparation wins) | Iraki et al. 2019; spec owner decision |
| `nutrition.calibration` | `{ windowDays: 14, minDaysWithData: 10, kcalPerLbChange: 3500, maxWeeklyStepKcal: 150, highConfidenceDays: 21 }` | practice (adaptive-TDEE apps); Hall 2008 / Thomas et al. 2013 as context on the limits of the 3500 rule. Label honestly |
| `nutrition.initialTdee` | `{ whoopDaysMin: 7, fallbackActivityFactor: 1.6 }`. Initial estimate = WHOOP cycle kcal average over the last 14 days if ≥ `whoopDaysMin` days of data, else scan BMR × factor, else Mifflin–St Jeor | Shcherbina 2017 as context (wrist kcal error); Mifflin et al. 1990 |
| `nutrition.dayDistribution` | `{ maxDailySwingPct: 25 }`. Daily kcal swings around the weekly average with planned load, capped at ±this | practice (with a carb-periodization rationale from Thomas 2016) |
| `nutrition.preWorkout` | `{ minSessionMin: 60, carbsGPerKg: [1, 2], hoursBefore: [1, 3], swimNoHeavyMealMin: 90 }` | Thomas 2016; the swim rule is practice |
| `nutrition.postWorkout` | `{ withinHours: 2, carbsGPerKg: 1.0, proteinGPerKg: 0.3 }` | Thomas 2016; Jäger 2017 |
| `nutrition.micros` | `{ profiles: { male_19_30: {...}, female_19_30: {...}, male_31_50: {...}, female_31_50: {...} } }`. RDA/AI values per nutrient: fiber, calcium, iron, magnesium, potassium, sodium (CDRR), zinc, vitamins A, C, D, E, K, B12, folate | NIH ODS fact sheets; National Academies DRI tables |
| `hydration.daily` | `{ totalWaterL: { male: 3.7, female: 2.7 }, beverageShare: 0.8 }` | IOM 2005 DRI for water |
| `hydration.exercise` | `{ maxBodyMassLossPct: 2, defaultLph: 0.6, minLph: 0.4, maxLph: 1.0, minSessionMin: 60 }` | Sawka et al. 2007 (ACSM fluid replacement position stand); Galpin guidance as `expert` context where verifiable |
| `hydration.rehydrate` | `{ replacePctOfLoss: 125 }` | Shirreffs & Sawka 2011, or Sawka 2007 |
| `supplements.evidence` | `{ creatine: { gPerDay: [3, 5] }, caffeine: { mgPerKg: [3, 6] }, vitaminD: { labGuided: true } }` | Kreider et al. 2017 (ISSN creatine); Guest et al. 2021 (ISSN caffeine); NIH ODS vitamin D |

- [ ] **Step 1: Research.** Use the web, the same way as Plan 3 Task 2. Verify the authors, year, venue and DOI/URL. Check that each source supports the param, or relabel it. Never invent a citation. Add Galpin (`expert`) or Bryan Johnson (`n-of-1`, context only) where they genuinely apply, e.g. hydration or sleep–nutrition timing. Document every rule in `docs/rules-sources.md`.
- [ ] **Step 2: Failing catalog tests**
  - Every new id is present with its param names.
  - The carb tiers ascend by `maxMin`.
  - `floorKcalPerKgFfm < targetKcalPerKgFfm`.
  - Each micro profile has all the listed nutrients, with positive values and a unit.
  - The existing policy tests pass.
- [ ] **Step 3:** Implement. Tests pass.
- [ ] **Step 4:** Commit: `feat(rules): nutrition and hydration rules with sources`.

### Task 3: Apple Health ingest endpoint

**Files:**
- Create: `src/app/api/ingest/health/route.ts`, `src/lib/nutrition/ingest.ts` and its test

**Interfaces:**
- **Consumes:** the Task 1 tables, `getEnv().INGEST_TOKEN` and `OWNER_TZ`.
- **Produces:**
  - `IngestPayload` (zod):

    ```
    { sentAt: ISO datetime, days: [{ date: "YYYY-MM-DD", totals: Partial<Record<NutrientKey, number>> }] (1–3 days) }
    ```

    - `NutrientKey` (from `src/lib/engine/nutrients.ts`) covers `energy_kcal`, `protein_g`, `carbs_g`, `fat_g`, `fiber_g`, `water_ml`, and the micro keys from `nutrition.micros` with their canonical units.
    - Unknown keys are ignored and reported.
    - Every value must be ≥ 0 and below a sane max: energy ≤ 15000, water ≤ 15000 mL, macros ≤ 2000 g.
  - `ingestDays(db, payload): Promise<{ written: number; ignoredKeys: string[] }>`
    - Upserts each day with `sent_at = payload.sentAt` and `source = "apple_health"`, but only where the existing `sent_at` is null or older. A single statement does this: `on conflict (local_date) do update ... where nutrition_days.sent_at < excluded.sent_at`. A day's totals are *replaced*, never summed.
- **Route:**
  - Reject `content-length > 65536`, or a read body longer than that, with 413.
  - A missing or bad bearer returns 401, using a constant-time compare with a length check.
  - Invalid JSON or schema returns 400 with a short message.
  - On success it returns 200 `{ written, ignoredKeys }`.
  - No `requireSession`; the token is the auth. Comment on that in the code.

- [ ] **Step 1: Failing tests**
  - Posting day X with 1000 kcal at 10:00, then 2500 kcal at 20:00, leaves 2500.
  - Re-posting the 10:00 payload afterwards still leaves 2500 (Review Focus 1).
  - The route: no token → 401; a wrong token of the same length → 401; 70 KB → 413; `energy_kcal: -5` → 400 with nothing written; an unknown key is reported in `ignoredKeys` and not stored (Review Focus 4).
  - A 4-day payload → 400.
- [ ] **Step 2:** Run the tests; they should fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit: `feat(nutrition): Apple Health ingest endpoint`.

### Task 4: Shortcut setup guide and settings page

**Files:**
- Create: `docs/apple-health-shortcut.md`, `src/app/settings/nutrition/page.tsx`, `src/app/settings/nutrition/actions.ts` and `form.tsx`
- Modify: `src/app/settings/page.tsx` (link to it)

**Interfaces:**
- **Consumes:** `getNutritionSettings`, `updateNutritionSettings`, `INGEST_TOKEN`.
- **Produces:**
  - **The guide:** step-by-step instructions for building the iOS Shortcut in the Shortcuts app.
    - For each nutrient type, use **Find Health Samples** filtered to "Today" (and a second pass for "Yesterday"), then **Calculate Statistics → Sum**.
    - Build a **Dictionary** matching `IngestPayload`, with `sentAt` from **Current Date** (ISO 8601).
    - Send it with **Get Contents of URL** as a POST with the JSON body and the `Authorization: Bearer <token>` header.
    - Schedule it as a **Personal Automation** at several times a day and at 23:30, with "Run Immediately".
    - The guide lists the exact Health type names. It also explains turning off Cronometer's exercise adjustment, and checking that Cronometer → Apple Health export is on for nutrients and water.
    - It includes a test step: a `curl` example against the local dev server.
  - **The settings page:**
    - reference-intake profile (required for micronutrient targets, explained neutrally);
    - meals per day (3–6);
    - water source (with an explanation of the double-counting choice);
    - the supplement list (name plus timing);
    - the ingest URL. The token is shown masked, with a "copy" button that reveals it only on tap.
    - **Not medical advice** line.
    - Every action calls `requireSession()`.

- [ ] **Step 1: Implement.** Unit-test the form→patch parsing helper.
- [ ] **Step 2: Manual check:** curl the settings page with a minted cookie; save the profile; post a sample payload to the ingest route with the token from `.env`. Don't print the token in the report. Then delete the test `nutrition_days` row.
- [ ] **Step 3:** Run the tests and typecheck. Commit: `feat(nutrition): shortcut guide and nutrition settings`.

### Task 5: Energy and macro targets engine

**Files:**
- Create: `src/lib/engine/energy.ts` and its test

**Interfaces:**
- **Consumes:** `RULES`.
- **Produces (all pure):**
  - `initialTdee(i: { whoopKcalDaily: number[]; bmrKcal: number | null; weightKg: number | null; heightCm: number | null; ageYears: number | null; sex: "male" | "female" | null }): { tdee: number | null; method: "whoop" | "bmr" | "mifflin" | "none"; ruleIds: string[] }`
    - Each fallback in the chain requires its own inputs. When none are available it returns `tdee: null`, and callers show "Log a weight and scan to get targets".
  - `calibrateTdee(i: { previousTdee: number; intakeKcal: (number | null)[]; weightLbTrend: (number | null)[] /* smoothed daily, same window */; windowDays }): { tdee: number; confidence: "low" | "medium" | "high"; changed: boolean; ruleIds }`
    - It needs at least `minDaysWithData` days with both values present; otherwise it returns `previousTdee` with low confidence.
    - Estimate = mean intake − (Δweight lb/day × `kcalPerLbChange`).
    - The step is clamped to ±`maxWeeklyStepKcal` from `previousTdee`.
    - Confidence is "high" when there are ≥ `highConfidenceDays` days of data.
  - `weeklyCalorieTarget(i: { tdee: number; weightLb: number; gainPhase: boolean; phase: Phase; remainingGoalLb: number }): number`
    - With `remainingGoalLb ≤ 0`, return the TDEE (maintenance).
    - In the gain phase, add the surplus for `pctBodyweightPerWeek`: `weightLb × pct/100 × kcalPerLbChange / 7`.
    - In base or build weeks outside the gain phase, use `minPct`.
    - In peak, taper and race weeks, return the TDEE.
  - `dayTargets(i: { weeklyAvgKcal: number; dayEnduranceMin: number; weekEnduranceMin: number[] /* 7 */; weightKg: number; ffmKg: number | null; dayExerciseKcal: number /* planned estimate */ }): { kcal; proteinG; carbsG; fatG; floorApplied: boolean; reasons: { ruleId; text }[] }`
    - Protein: `gPerKg × weightKg`.
    - Carbs: the tier from `dayEnduranceMin`, using the midpoint of the tier range × weightKg.
    - kcal: distribute around `weeklyAvgKcal` by relative load, with the swing capped at `maxDailySwingPct`.
    - Fat: the remainder, but ≥ `pctKcalMin`% of kcal. If the fat minimum doesn't fit, raise kcal.
    - Floor: `kcal ≥ floorKcalPerKgFfm × ffmKg + dayExerciseKcal`. If FFM is null, use 0.85 × weightKg, labeled in a reason as an assumption (put the 0.85 in the catalog as practice).
    - The floor is applied last and is never undercut.
  - `microTargets(profile): Record<NutrientKey, { value: number; unit: string }> | null`

- [ ] **Step 1: Failing tests**
  - **Fallback chain:** WHOOP data present → "whoop"; < 7 days → "bmr"; no scan → "mifflin"; nothing → null (Review Focus 2).
  - **Calibration:** intake 3000, weight flat over 14 days, previous 2700 → +150 (clamped), "medium". Only 6 days of data → unchanged, "low".
  - **Property (Review Focus 3):** over random inputs, `dayTargets.kcal ≥ floor`. Calibration never moves more than ±150 per call.
  - **Carb tiers:** a rest day (0 min) gives the low tier; a 150-min day gives tier 3.
  - **Fat:** never below 20% of kcal.
  - **Surplus by phase:** gain phase → 0.5%; build after the gain phase with goal remaining → 0.25%; peak or taper → none; goal reached → none.
  - **Weekly average:** across a 7-day load pattern, it equals `weeklyAvgKcal` within ±1% unless the floor or the fat minimum raised a day.
- [ ] **Step 2:** Run the tests; they should fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit: `feat(engine): energy and macro targets`.

### Task 6: Hydration engine, water log and sweat test

**Files:**
- Create: `src/lib/engine/hydration.ts` and its test, `src/lib/nutrition/water.ts` and its test

**Interfaces:**
- **Pure:**
  - `sweatRate(t: { preLb; postLb; fluidMl; durationMin }): number /* L/h */`
    - `(Δmass kg + fluid L) / hours`. Inputs are validated (`post ≤ pre + 2 lb`, `duration ≥ 20`).
  - `dailyWaterTargetMl(i: { profileSex: "male" | "female" | null; sessions: { kind; durationMin }[]; sweatRates: Partial<Record<Kind, number>> }): { totalMl; baselineMl; trainingMl; reasons }`
    - Baseline = `totalWaterL[sex] × beverageShare`. When sex is null, use the lower value and a reason telling the owner to set the profile.
    - Training adds sweat loss × `replacePctOfLoss`, for sessions ≥ `minSessionMin`. The rate is the measured sweat rate for that kind, else `defaultLph`, clamped to [`minLph`, `maxLph`].
  - `duringSessionMl(kind, durationMin, sweatRates): number`
- **DB (`water.ts`):**
  - `addWater(db, at, tz, ml, clientId)`: idempotent on `client_id`.
  - `waterToday(db, date, setting): Promise<{ appMl; healthMl; countedMl }>`
    - `countedMl` follows `water_source`: `"app"` counts app entries only, `"cronometer"` counts Health only, `"both"` counts the sum.
  - `addSweatTest(db, input)`
  - `latestSweatRates(db)`: the most recent rate per kind.

- [ ] **Step 1: Failing tests**
  - **Sweat rate:** pre 160, post 158.5, fluid 500 mL over 60 min → (0.680 + 0.5) / 1 ≈ 1.18 L/h.
  - **Water targets:** a rest day for male gives 3.7 × 0.8 = 2.96 L. A 90-min run with no test uses the default rate × 1.5 h × 1.25 on top.
  - **Water source (Review Focus 5):** `waterSource` "app" ignores Health water; "both" sums them.
  - **Double tap:** the same `clientId` twice gives 1 row.
- [ ] **Step 2:** Run the tests; they should fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit: `feat(nutrition): hydration engine, water log, sweat test`.

### Task 7: Nutrition service (inputs, weekly estimate, day targets)

**Files:**
- Create: `src/lib/nutrition/service.ts` and its test

**Interfaces:**
- **Consumes:**
  - Tasks 1–6;
  - `getWeightTrend` (body.ts) and the daily weights;
  - `listScans` (latest lean mass, BMR);
  - WHOOP `cycles.kcal`;
  - `getPlanSettings`, `seasonCalendar` (gain phase) and `getDayPlan` / planned sessions for the day and the week;
  - the `body` raw WHOOP data for height (`height_meter`);
  - the profile for sex and age band.
- **Produces:**
  - `ensureEnergyEstimate(db, weekStart, now, tz): Promise<EnergyEstimate>`
    - If no row exists, compute it with `initialTdee`, or with `calibrateTdee` from the previous week's estimate plus the last `windowDays` of intake and the smoothed weight. Then insert.
    - It is idempotent per week and never rewrites past weeks.
    - `remainingGoalLb` = `gain_goal_lb` − (current 7-day mean weight − start weight). The start weight is `gain_start_weight_lb`, or the first weight entry on or after `season_start`.
    - The smoothed weight is a 7-day trailing mean of the daily weights, with missing days skipped.
  - `getDayNutrition(db, date, now, tz): Promise<{ targets: DayTargets | null; micros: …; water: { targetMl; countedMl; duringSessions: { title; ml }[] }; eaten: { kcal; proteinG; carbsG; fatG; micros } | null; lastSyncedAt: Date | null; confidence; needs: string[] /* e.g. "set profile", "log weight" */ }>`
    - The day's planned exercise kcal is estimated from planned minutes × a per-kind kcal/min. That rate comes from the owner's WHOOP history of the same kind (median kcal/min of recent workouts), with a catalog default.

- [ ] **Step 1: Failing tests** (PGlite, invented data)
  - **No data at all** (Review Focus 2): targets are null and `needs` lists what's missing; there's no throw.
  - **WHOOP data only:** initial estimate with method "whoop", confidence low.
  - **Second week with 14 days of intake and weights:** calibrated, and the step is ≤ 150.
  - **Past weeks:** an estimate is never rewritten.
  - **Floor:** day targets on a 3-hour planned day are ≥ the floor.
  - **Water:** follows the `water_source` setting.
- [ ] **Step 2:** Run the tests; they should fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** Commit: `feat(nutrition): service for weekly estimate and day targets`.

### Task 8: Day tab (timeline)

**Files:**
- Create: `src/lib/engine/day-timeline.ts` and its test, `src/app/day/page.tsx`, `src/app/day/day.module.css`
- Modify: `src/components/tab-bar.tsx` (Day becomes a link)

**Interfaces:**
- **Pure:** `buildTimeline(i: { windows; sessions: { title; kind; durationMin; window?: number; intensity }[]; mealsPerDay; supplements; proteinG; carbsG; weightKg; sleepNeedMin: number | null; wakeTime?: string }): TimelineItem[]`
  - **Item shape:** `TimelineItem = { time: "HH:MM"; kind: "wake" | "supplement" | "meal" | "snack" | "session" | "bedtime"; title; detail; ruleIds }`.
  - **Wake:** the first window's start minus a catalog param (e.g. 45 min).
  - **Sessions:** placed at their window start times.
  - **Pre-workout snack:** for sessions ≥ `preWorkout.minSessionMin`, a carb snack `hoursBefore` before, using the midpoint of `carbsGPerKg` × weightKg. Before swims, no meal within `swimNoHeavyMealMin`.
  - **Post-workout:** carbs and protein within `withinHours` after.
  - **Meals:** the remaining protein is spread evenly across `mealsPerDay`, each ≥ `gPerKgPerMeal × weightKg`.
  - **Bedtime:** wake time + 24 h − `sleepNeedMin` (WHOOP need), when present.
  - **Supplements:** placed by their timing.
  - **Order:** items are sorted, and no two items share the same minute except supplements, which attach to meals.
- **Page `/day?date=`:**
  - The timeline for the date (default today), with prev/next.
  - Targets summary at the top: calories, protein, carbs, fat and water.
  - Each item has a Why link to the Library.
  - Shows the supplement list from settings with an evidence note per known supplement, linking `supplements.evidence`.
  - Uses `requireSession`, a dynamic shell, and is phone-first.

- [ ] **Step 1: Failing timeline tests**
  - A morning 75-min run at 06:00 → a pre-run snack around 04:30–05:00, or a "small snack 60–90 min before" if that would fall before wake. Handle this edge: when the snack time is earlier than wake, shift it to wake + 10 min and shrink it to the lower carb bound, with a reason.
  - A swim at 12:00 → no meal between 10:30 and 12:00.
  - 4 meals, each with protein ≥ 0.4 g/kg.
  - Bedtime from the sleep need.
  - A null sleep need → no bedtime item.
- [ ] **Step 2:** Run the tests; they should fail.
- [ ] **Step 3:** Implement the timeline and the page.
- [ ] **Step 4: Manual check:** curl with a minted cookie; check 375 px by reading the CSS.
- [ ] **Step 5:** Commit: `feat(day): daily timeline with meals, snacks, supplements, bedtime`.

### Task 9: Today fuel card and water button

**Files:**
- Modify: `src/app/page.tsx`, `src/app/today.module.css`
- Create: `src/app/today-fuel.tsx`, `src/app/water-button.tsx` (client), `src/app/fuel-actions.ts`

**Interfaces:**
- **Consumes:** `getDayNutrition`, `addWater`.

- [ ] **Step 1: Implement**
  - **Fuel card** below the training card. It shows:
    - bars for calories, protein and carbs against target;
    - water oz against target;
    - "Last synced from Apple Health HH:MM" or "Not synced yet";
    - a confidence note;
    - any `needs` items as links (e.g. "Set your reference-intake profile" → `/settings/nutrition`).
  - **"+16 oz" water button:**
    - a client button with a `crypto.randomUUID()` clientId per tap;
    - double-tap safe;
    - its server action calls `requireSession`;
    - hidden or labeled "counted from Cronometer" when `water_source` is `"cronometer"`.
  - **No targets:** show the setup links instead of zeros.
  - The card is wrapped in try/catch so the page always renders.
- [ ] **Step 2:** Test the pure helpers (bar percent, oz formatting, which needs to show).
- [ ] **Step 3: Manual check:** with curl and a minted cookie, load `/` (this triggers the WHOOP sync, which is acceptable here), then tap water twice with the same id → one row. Delete any test rows.
- [ ] **Step 4:** Run the tests and typecheck. Commit: `feat(today): fuel card and water button`.
