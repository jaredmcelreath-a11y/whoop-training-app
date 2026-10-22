# Progress and Polish (Plan 5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner can see whether the year is working. A Progress tab shows:

- weight trend against the gain goal;
- how much of the gain is lean versus fat, from rescans;
- lab markers over time;
- lifts;
- endurance fitness;
- plan adherence.

Plan 5 also adds the sweat-test form that Plan 4 left out, and fixes the small issues earlier reviews parked. It makes the app install cleanly on an iPhone Home Screen.

**Architecture:**
- **Pure series helpers:** `src/lib/progress/series.ts` turns rows into chart-ready series. It covers rolling averages, weekly buckets, trend rate, scan deltas and adherence. It has no DB access and no clock.
- **Loaders:** `src/lib/progress/*.ts` read the existing tables. They add no new tables.
- **Charts:** one server-rendered inline-SVG line-chart component, with no chart library.
- **Progress page:** `/progress`, plus a lab-marker detail page at `/progress/labs/[marker]`.

**Tech stack:** same as Plans 1–4. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-20-training-app-design.md`. Relevant sections:
- §5: baseline shown in Progress.
- §8: Progress shows lean versus fat honestly; the sweat-rate test.
- §10: the Progress tab.
- §11: PWA on iPhone.

**This is plan 5 of 5.** Deploying to Vercel and Neon is a separate step, done after this plan with the owner, because it needs the owner's accounts.

## Global Constraints

- **Public repo.** Never commit any of these:
  - `*.local.*`
  - `.env*` (except `.env.example`)
  - `.data/`
  - `.superpowers/`
  - `.claude/`
  - owner health values

  Tests use invented values only. Docs and comments never describe the owner personally: no sex, age, body size, training volume or health details. Commit author `288721429+jaredmcelreath-a11y@users.noreply.github.com`. Never push.
- **Auth.** Every page and server action calls `requireSession()` itself. There are no new public paths.
- **No transactions.** Use single idempotent statements. No new tables or migrations, except if Task 7 adds an index.
- **Local dates.** Use `OWNER_TZ` with `localDate` and `weekStart` (weeks start Monday).
- **Purity and numbers:**
  - `src/lib/engine/*` and `src/lib/progress/series.ts` import nothing from `@/db` or `next/*`, and never call `new Date()` without an argument.
  - Any health threshold, such as a gain rate, comes from `RULES`.
  - Display constants (chart sizes, default ranges) are named constants, not rules.
- **Honesty:**
  - Charts never invent points or interpolate across gaps.
  - When data is missing or too thin, say so in words.
  - Lean-versus-fat text carries the caveat that single scans vary and the trend across several scans matters more.
- **Units:** show weight in lb, water in oz, swim pace per 100 yd, run pace per mile, bike in watts. Convert with the existing `src/lib/log/units.ts` helpers and `ML_PER_FL_OZ`.
- **Charts:**
  - Inline SVG with `viewBox` and `width: 100%`, so nothing scrolls sideways at 375 px.
  - Colors come from CSS variables in the dark theme.
  - Every chart has an `aria-label` summary, and the latest value appears as visible text.
  - Implementers follow the `dataviz` skill if their harness offers it.
- **Dev server:** stop it with SIGINT and wait for it to exit. Never use SIGTERM or SIGKILL.

## Review Focus

1. **Zero, one or two data points:** no weights yet, one scan, a marker drawn once.
   - Expected: no crash and no empty axes. Show a short "not enough data yet" line with a link to where to log.
   - Tests: Task 1 (series), Task 4 (chart), Task 5 (page helpers).
2. **A lab marker whose unit changed between panels** (for example mg/dL, then mmol/L).
   - Expected: the chart never mixes units on one line. It plots the latest unit's points and lists the others as text.
   - Tests: Task 3.
3. **Gaps in weigh-ins** (a week away).
   - Expected: the 7-day average uses only the days present. The line breaks across any gap longer than `MAX_GAP_DAYS` = 7, and the trend rate needs at least 8 weigh-ins in its 28-day window or it returns null.
   - Tests: Task 1.
4. **Adherence on a week in progress.**
   - Expected: only past dates count. Today's and future planned sessions are never counted as missed, and rest days never count.
   - Tests: Task 2.
5. **Sweat test with impossible input:** post weight above pre weight with no fluid, zero duration, or absurd values.
   - Expected: a clear form error, and nothing stored. Input is in lb and oz, and storage is in mL.
   - Tests: Task 6.

---

### Task 1: Body progress series (weight, gain, scans)

**Files:**
- Create: `src/lib/progress/series.ts` and `series.test.ts` (pure)
- Create: `src/lib/progress/body.ts` and `body.test.ts` (loader)

**Interfaces:**
- **Consumes:**
  - `weightEntries`, `bodyScans`
  - `getNutritionSettings(db)`: `gainGoalLb`, `gainStartWeightLb`
  - `getPlanSettings(db)`
  - `seasonCalendar`
  - `RULES["nutrition.gainRate"].params`: `{pctBodyweightPerWeek, minPct}`

  Check how `src/lib/nutrition/service.ts` decides the current week's phase and `gainPhase`, and reuse that logic rather than re-deriving it.
- **Produces (pure, in `series.ts`):**
  - `type Point = { date: string; value: number }`
  - `rollingAvg(points: Point[], windowDays = 7): Point[]`: one output point per input date, averaged over the input points in `[date − 6, date]`, rounded to 0.1.
  - `splitAtGaps(points: Point[], maxGapDays = MAX_GAP_DAYS): Point[][]`, with `export const MAX_GAP_DAYS = 7`.
  - `trendRateLbPerWeek(points: Point[], asOf: string): number | null`
    - Least-squares slope over `[asOf − 27, asOf]`, times 7.
    - Returns null with fewer than `MIN_TREND_POINTS` = 8 points.
  - `scanDelta(scans: ScanLite[], fromDate: string | null): ScanDelta | null`
    - `ScanLite = { scannedOn; weightLb; leanMassLb; fatMassLb }`, all mass fields `number | null`.
    - `ScanDelta = { from: ScanLite; to: ScanLite; weightLb: number | null; leanLb: number | null; fatLb: number | null; leanSharePct: number | null }`.
    - `from` is the first scan on or after `fromDate` (or the earliest scan when null), and `to` is the latest.
    - Returns null with fewer than 2 scans.
    - `leanSharePct = leanLb / (leanLb + fatLb) × 100`, only when both are known and their sum is greater than 0. Otherwise null.
- **Produces (loader, in `body.ts`):** `getBodyProgress(db, now, tz, range: Range): Promise<BodyProgress>`
  - `type Range = "12w" | "6m" | "1y"`
  - `BodyProgress` contains:
    - `weights: Point[]`
    - `avg7: Point[]`
    - `rateLbPerWeek: number | null`
    - `targetRateLbPerWeek: number | null`: the phase's percentage × the latest `avg7` ÷ 100. It is 0 in no-surplus phases and null without a weight.
    - `gain: { startLb: number | null; currentLb: number | null; gainedLb: number | null; goalLb: number }`: the start is `gainStartWeightLb`, else the first weigh-in on or after the season start.
    - `scans: ScanLite[]`
    - `scanDelta: ScanDelta | null`

- [ ] **Step 1: Failing tests (series)**
  - `rollingAvg` on 1, 4 and 8 points: values equal hand-computed means.
  - `splitAtGaps`: a 9-day gap gives 2 segments, and a 7-day gap gives 1.
  - `trendRateLbPerWeek`: 14 points rising exactly 0.1 lb/day give 0.7. 7 points give null.
  - `scanDelta`:
    - 1 scan gives null.
    - Lean +3 and fat +1 give `leanSharePct` 75.
    - Lean +2 and fat −1 give `leanSharePct` null (the sum isn't a gain split). The deltas are still returned.
    - A null `fatMassLb` gives `fatLb` null.
- [ ] **Step 2: Failing tests (loader, `createTestDb`)**
  - No weights gives empty series and null rate, start and current. It doesn't throw.
  - A set `gainStartWeightLb` wins over the first weigh-in.
  - Range `"12w"` excludes weigh-ins older than 84 days.
- [ ] **Step 3:** Run the tests; they should fail.
- [ ] **Step 4:** Implement.
- [ ] **Step 5:** Run the tests; they should pass. Commit: `feat(progress): body series and loader`.

### Task 2: Training progress (lifts, endurance, adherence)

**Files:**
- Modify: `src/lib/progress/series.ts`
- Create: `src/lib/progress/training.ts` and `training.test.ts`
- Tests: in `series.test.ts` and `training.test.ts`

**Interfaces:**
- **Consumes:**
  - `strengthSets` joined to `strengthSessions` and `exercises`
  - `cardioEntries`
  - `weeklyMetrics`
  - `plannedSessions`
  - units helpers
- **Produces (pure):**
  - `weeklyAdherence(rows: { localDate; kind; status }[], today: string): { weekStart; planned; done; skipped; missed; pct: number | null }[]`
    - Rows with `kind` "rest" are ignored.
    - A row counts toward `planned` only when `localDate < today`.
    - `missed` = past rows with status "planned".
    - `pct = done / planned × 100`, rounded, or null when `planned` is 0.
    - Weeks are sorted ascending.
  - `liftSeries(sets: { localDate; exerciseId; exerciseName; reps; weightLb: number | null }[]): LiftSeries[]`
    - `LiftSeries = { exerciseId; name; weekly: { weekStart; topWeightLb: number | null; topReps: number; sets: number }[] }`.
    - `topWeightLb` is the week's max weight. `topReps` is the most reps at that weight, or the most reps overall when every weight is null.
    - Sorted by most recent set first.
- **Produces (loader):** `getTrainingProgress(db, now, tz, range: Range): Promise<TrainingProgress>`
  - `{ adherence; lifts; vo2max: Point[]; whoopAge: Point[]; swimPace: Point[]; runPace: Point[]; bikeWatts: Point[] }`
  - `vo2max` and `whoopAge` are dated by `weekStart`.
  - Swim pace is seconds per 100 yd and run pace is seconds per mile, from entries with distance, one point per entry.
  - `bikeWatts` comes from entries with `avgWatts`.

- [ ] **Step 1: Failing tests**
  - `weeklyAdherence`:
    - A week with 3 past done, 1 past planned and 2 future planned gives planned 4, done 3, missed 1, pct 75.
    - Rest rows are ignored.
    - An all-future week gives pct null.
  - `liftSeries`:
    - Sets of 100×10, 110×8 and 110×9 in one week give top 110 and topReps 9.
    - A bodyweight exercise with all-null weights gives top null and the max reps.
  - **Loader:**
    - A swim of 500 yd in 10 min gives pace 120 s/100 yd.
    - An entry with no distance gives no pace point.
    - Empty tables give empty arrays, with no throw.
- [ ] **Step 2:** Run the tests; they should fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests; they should pass. Commit: `feat(progress): lifts, endurance and adherence`.

### Task 3: Lab markers over time

**Files:**
- Modify: `src/lib/log/records.ts` (add `listMarkers`)
- Create: `src/lib/progress/labs.ts` and `labs.test.ts`

**Interfaces:**
- **Consumes:** `labPanels`, `labResults`, and the existing `markerHistory(db, marker)`.
- **Produces:**
  - `listMarkers(db): Promise<{ marker: string; latest: { drawnOn; value; unit; flag: string | null }; count: number }[]>`
    - Grouped case-insensitively, keeping the latest spelling.
    - Sorted: flagged markers first, then alphabetically.
  - Pure `unitSplit(history: { drawnOn; value; unit }[]): { unit: string; points: Point[]; otherUnits: { unit: string; count: number }[] }`
    - `unit` is the latest entry's unit, compared case- and whitespace-insensitively.
    - `points` holds only that unit's values.

- [ ] **Step 1: Failing tests**
  - Two panels with "LDL" and "ldl" give one marker with count 2.
  - A flagged marker sorts before an unflagged one.
  - `unitSplit`:
    - Units mg/dL, mg/dL then mmol/L give unit "mmol/L", 1 point, and otherUnits `[{unit: "mg/dL", count: 2}]`.
    - All-same units give otherUnits `[]`.
- [ ] **Step 2:** Run the tests; they should fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests; they should pass. Commit: `feat(progress): lab marker list and unit split`.

### Task 4: Line chart component

**Files:**
- Create: `src/components/line-chart.tsx`, `src/components/line-chart.module.css`
- Create: `src/components/chart-geometry.ts` and `chart-geometry.test.ts` (pure)

**Interfaces:**
- **Produces:**
  - `chartGeometry(segments: Point[][], opts: { width: number; height: number; pad: number; yMin?: number; yMax?: number }): { paths: string[]; dots: { x; y; date; value }[]; yTicks: { y; label }[]; xLabels: { x; label }[] }`
    - x is proportional to the day number across all points.
    - y is inverted, with padding.
    - A flat series (every value equal) gets a ±1 range, so there is no division by zero.
    - There are 3 y-ticks.
    - x-labels are the first and last dates, shown short (e.g. "Oct 3").
  - `<LineChart segments={Point[][]} secondary?={Point[][]} goal?={number} unit={string} label={string} emptyText={string} emptyHref?={string} />`
    - It is a server component.
    - Raw points are dots, and `secondary` (e.g. `avg7`) is the line.
    - `goal` draws a dashed horizontal line.
    - With fewer than 2 points in total, it renders `emptyText` (linked when `emptyHref` is given) instead of an SVG.
    - It always shows the latest value and unit as text.

- [ ] **Step 1: Failing tests (geometry)**
  - 2 points give one path with 2 commands. The first x equals `pad`, and the last x equals `width − pad`.
  - Flat values give finite y values.
  - Two segments give two paths.
  - A higher value gives a smaller y.
- [ ] **Step 2:** Run the tests; they should fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests; they should pass. Commit: `feat(ui): server-rendered line chart`.

### Task 5: Progress page and lab detail page

**Files:**
- Create: `src/app/progress/page.tsx`, `src/app/progress/progress.module.css`, `src/app/progress/labs/[marker]/page.tsx`
- Create: `src/lib/progress/view.ts` and `view.test.ts` (pure display helpers)
- Modify: `src/components/tab-bar.tsx` (Progress becomes a link)

**Interfaces:**
- **Consumes:**
  - `getBodyProgress`, `getTrainingProgress`, `listMarkers`, `markerHistory`, `unitSplit`
  - `LineChart`
  - `parseDateParam`-style param validation (see `src/app/day/page.tsx`)
- **Produces:**
  - `parseRange(raw): Range`: invalid or missing gives `"12w"`.
  - `paceLabel(sec: number, per: "100 yd" | "mi"): string`: e.g. `95` gives `"1:35 /100 yd"`.
  - `gainLine(g): string`
    - e.g. `"+4.2 of 15 lb"`.
    - `"Log your weight to start tracking"` when the current weight is null.
    - `"Set a gain start weight"` when the start is null.
  - `scanSplitText(d: ScanDelta | null): string`
    - `"One scan so far. Rescan to see lean vs fat."` when null.
    - Otherwise, e.g. `"Since Oct 3: lean +3.0 lb, fat +1.0 lb (75% lean). Single scans vary; the trend across several scans matters more."`
    - When `leanSharePct` is null, give both deltas without a percentage.

- [ ] **Step 1: Failing tests (view helpers)**
  - `parseRange("6m")` gives "6m", and `parseRange("x")` gives "12w".
  - `paceLabel(95, "100 yd")` gives "1:35 /100 yd".
  - `paceLabel(3600 / 7, "mi")` gives "8:34 /mi".
  - `gainLine` covers the three cases above.
  - `scanSplitText` covers null, the 75% case, and the null-share case.
- [ ] **Step 2:** Run the tests; they should fail.
- [ ] **Step 3: Implement the page**
  - The page is a static shell with a `<Suspense>` child, and `requireSession` redirects to /login.
  - Range links: 12w / 6m / 1y.
  - Sections in order:
    1. **Weight:** chart with dots plus the `avg7` line and the goal line at start + `gainGoalLb`. Text shows the current rate against the target rate in lb/wk, plus `gainLine`.
    2. **Body scans:** a weight / lean / fat table, plus `scanSplitText`.
    3. **Labs:** the `listMarkers` list, with the latest value, date and flag, each linking to `/progress/labs/[marker]`.
    4. **Lifts:** top weight per week per exercise, as a small chart for each exercise with at least 2 weeks of data, otherwise a text row.
    5. **Endurance:** VO2 max, WHOOP Age, swim pace, run pace and bike watts charts.
    6. **Adherence:** the last 8 weeks as rows showing done/planned and pct, plus missed.

  Each section fails soft: wrap it in try/catch and show "Couldn't load this section".
- [ ] **Step 4: Implement the lab detail page**
  - Decode the URL param and show its history via `markerHistory` plus `unitSplit`.
  - Show the chart and a dated table of every value with its flag.
  - Add the line "Other units: …" when there are any.
  - Add "Lab values are for tracking only. Talk to your doctor about what they mean."
  - An unknown marker gives a "No results for this marker" message with a link back, not a 500.
- [ ] **Step 5:** Turn Progress in the TabBar into a link to `/progress` with an active state.
- [ ] **Step 6: Manual check**
  - Use curl with a minted cookie on `/progress`, `/progress?range=1y`, `/progress?range=junk` and `/progress/labs/<a real marker name, URL-encoded>`. All return 200.
  - A request without a cookie gets a redirect.
  - Check 375 px by reading the CSS.
  - Don't load `/`.
- [ ] **Step 7:** Run the tests, typecheck and eslint. Commit: `feat(progress): Progress tab and lab marker pages`.

### Task 6: Sweat-test form

**Files:**
- Create: `src/app/log/sweat/page.tsx`, `src/app/log/sweat/sweat-form.tsx`, `src/app/log/sweat/actions.ts`
- Modify: `src/lib/log/validate.ts` (add `SweatInput`), `src/app/log/page.tsx` (link to it)
- Test: `src/lib/log/validate.test.ts`

**Interfaces:**
- **Consumes:**
  - `addSweatTest(db, SweatTestInput)`: throws RangeError on invalid input and writes nothing.
  - `latestSweatRates(db)`
  - `RULES["hydration.sweatTest"]`, for the how-to text and the Why link.
- **Produces:** `SweatInput` (zod):
  - `{ testedOn: isoDate; kind: "run" | "bike" | "swim"; preLb: 60–400; postLb: 60–400; fluidOz: 0–200; durationMin: 10–600; notes: ≤ 500 chars, optional }`
  - Refined so that the sweat loss is greater than 0: `(preLb − postLb) × KG_PER_LB + fluidOz × ML_PER_FL_OZ / 1000` (kg, treating 1 L of fluid as 1 kg, as `sweatRate` does). Use the constants from `nutrients.ts`. Error message: "Check the weights: this shows no sweat loss."
  - The action converts oz to mL (`fluidOz × ML_PER_FL_OZ`).

- [ ] **Step 1: Failing tests (`validate.test.ts`)**
  - A valid input passes.
  - Each of these fails:
    - `durationMin` 0
    - `preLb` 500
    - `postLb` above `preLb` by 2 with `fluidOz` 0 (the no-loss refine)
    - a bad date
- [ ] **Step 2:** Run the tests; they should fail.
- [ ] **Step 3: Implement**
  - The page shows the latest rate per sport, from `latestSweatRates`, in oz/h.
  - The form uses `useActionState`, `keepInputOnSubmit` and `SubmitButton`.
  - The action calls `requireSession` first, then parses with zod, then wraps `addSweatTest` in try/catch so a RangeError becomes a form error.
  - On success: "Saved: about N oz/h for <sport>", then revalidate `/log/sweat`, `/day` and `/`.
  - The how-to text comes from the rule's statement, with a Why link.
- [ ] **Step 4: Manual check**
  - Post one valid test and one no-loss test with a minted cookie.
  - The valid one adds 1 row, and the no-loss one shows the error and adds 0 rows.
  - Delete the test row.
- [ ] **Step 5:** Run the tests, typecheck and eslint. Commit: `feat(log): sweat-rate test form`.

### Task 7: Hardening (parked review findings)

Each item below gets a failing test first, unless marked docs/UI.

**Files:** as named per item.

- [ ] **Step 1: Energy (`src/lib/engine/energy.ts`)**
  - `calibrateTdee` treats intake ≤ 0 and weight ≤ 0 as missing.
  - A NaN or non-finite `previousTdee` falls back to the initial TDEE.
  - Guard `weeklyCalorieTarget` and `plannedExerciseKcal` against non-finite input (throw RangeError, as `dayTargets` already does for weight).
  - `dayTargets` returns a top-level `ruleIds`.
  - Fix the "base week after gain phase" reason text so it names the 0.25% rate.
- [ ] **Step 2: Service (`src/lib/nutrition/service.ts`)**
  - `ensureEnergyEstimate` never persists a week before the current week. A past week with no stored row returns null, rather than being backfilled with today's inputs.
  - The start-weight lookup is bounded by the week's `asOf`.
  - The gain-goal need appears only in gain or surplus weeks.
  - Add tests for these, plus an open WHOOP cycle being excluded.
- [ ] **Step 3: Day timeline (`src/lib/engine/day-timeline.ts`)**
  - Re-check the swim no-meal zones after the +5-min collision nudge.
  - A meal moved later never lands after bedtime: clamp it to bedtime − `snackAfterWakeMin`, or drop the move and keep the original slot. Test both.
- [ ] **Step 4: Ingest (`src/lib/nutrition/ingest.ts` and the route)**
  - Cap the ignored-keys echo at 20 keys, plus a count.
  - Read the body as a stream with a byte counter, so an over-limit body is cut at 64 KB rather than fully buffered. Return 413 as before.
  - Test a chunked oversize body.
- [ ] **Step 5: Settings and docs (UI/docs)**
  - The settings ingest section shows the full URL, built from the request host (`headers()`), not just the path.
  - Show `maxMin` 9999 as "over 240 min" wherever it is displayed.
  - Don't add a `local_date` index on water_entries unless a test shows a need (YAGNI).
- [ ] **Step 6:** Run the full suite, typecheck and eslint. Commit: `fix: parked review findings from Plan 4`.

### Task 8: iPhone install polish

**Files:**
- Modify: `src/app/layout.tsx`, `src/app/manifest.ts`
- Create: `public/icons/apple-touch-icon.png` (180×180, from the existing 512 icon via `sips`)

- [ ] **Step 1: Layout and manifest**
  - In `layout.tsx` metadata, add:
    - `appleWebApp: { capable: true, title: "Tri Coach", statusBarStyle: "black-translucent" }`
    - `icons.apple: "/icons/apple-touch-icon.png"`
  - In the `viewport` export, add `themeColor: "#12161b"` and `viewportFit: "cover"`.
  - Check the current Next 16 metadata docs in `node_modules/next/dist/docs/` first.
- [ ] **Step 2: Safe areas**
  - Pages pad for `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)`.
  - The TabBar sits above the home indicator.
  - Check `globals.css` and `tab-bar.module.css`.
- [ ] **Step 3: Manual check**
  - `curl` `/manifest.webmanifest` and `/login`.
  - The HTML has `apple-mobile-web-app-capable` and `apple-touch-icon` tags.
  - The icon returns 200 as `image/png` at 180×180 (`sips -g pixelWidth`).
- [ ] **Step 4:** Run the tests and typecheck. Commit: `feat(pwa): iPhone Home Screen polish`.
