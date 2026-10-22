# Visual Redesign (Plan 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every screen looks polished in the "Bold athletic" style. A Dark / Espresso theme setting is added, all emoji are gone, and every title is in Title Case. Behavior doesn't change.

**Architecture:**
- **Theme:** colors live as CSS custom properties per `[data-theme]` on `<html>`.
- **Theme source of truth:** a pure TypeScript palette module. A test keeps it identical to `globals.css`, and the same module checks contrast.
- **Shared parts:** a small set of shared UI components carry the style: page glow, card, hot card, cap label, stat chip, progress bar, icon and recovery ring. Each screen task then restyles one area using them.
- **Title Case:** one pure `titleCase` helper handles dynamic titles.

**Tech stack:** same as Plans 1–5. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-22-visual-redesign-design.md`. Read §5–§10. §10 records the decisions on the open points, and they are binding.

**Plan 6.** It comes after Plans 1–5, and the live app deploys from `main` after the owner approves a push.

## Global Constraints

- **No behavior changes:** the data shown, server actions, auth (`requireSession`), forms, routes and engines stay the same. Set entry on Log keeps its current interaction.
  - Tests that assert behavior must keep passing.
  - Tests that assert old casing or old color literals may be updated, and each such update is named in the task report.
- **Colors:**
  - Only `src/app/globals.css` and `src/lib/ui/theme.ts` contain color literals.
  - The exceptions are `src/app/manifest.ts` and the `viewport.themeColor` in `src/app/layout.tsx`, both of which are the static Dark background `#0b0e12`.
  - Everything else uses `var(--token)`.
- **Tokens:** `--bg --glow --card --card2 --line --text --sub --accent --good --caution --low --info --sleep`, with the exact values from spec §6 and §10.1:
  - **card2:** Dark `rgba(255,255,255,.07)`, Espresso `rgba(255,240,225,.08)`.
  - **Dark background:** `#0b0e12`.
- **Themes:**
  - `"dark"` (default) and `"espresso"`.
  - Stored per device in `localStorage` under the key `"theme"`.
  - Applied before first paint by an inline script in `<head>`, with `suppressHydrationWarning` on `<html>`.
  - No cookie, and pages stay statically shelled.
- **No emoji anywhere in `src/`.** Allowed symbols: `· – — × ± ° ↑ ↓ → ←`. Pictographs such as ✓ ✕ ⚠ ★ become SVG icons.
- **Title Case** for titles and headers (spec §8 rules). Never for citation titles, authors, venues, user-entered text or lab marker names.
- **Layout:** phone-first. No horizontal scroll at 375 px, tap targets of at least 44 px, safe areas kept.
- **Contrast:** WCAG AA in both themes. `--text`, `--sub`, `--accent`, `--good`, `--caution`, `--low`, `--info` and `--sleep` each reach at least 4.5:1 against `--bg`, and against `--card` composited over `--bg`.
- **Motion:** only subtle, and disabled under `prefers-reduced-motion: reduce`.
- **Privacy:** public repo, invented values in tests. Commit author `288721429+jaredmcelreath-a11y@users.noreply.github.com`. Never push.

## Review Focus

1. **`localStorage` throws or is empty** (Safari private mode, cleared data, thumbnail capture).
   - Expected: the page renders in Dark with no error, and picking a theme still works for the session.
   - Tests: Task 1 (`resolveTheme`, `THEME_SCRIPT` guarded).
2. **Recovery missing, pending or not scored on Today.**
   - Expected: a neutral glow, an empty ring track with "Pending" / "Not scored", and no NaN or 0% shown as if real.
   - Tests: Task 5.
3. **Titles with acronyms, numbers, units and hyphens** ("Z2 bike 60 min", "pre-run snack", "HRV check", "VO2 max test", "easy swim 40 min").
   - Expected: "Z2 Bike 60 min", "Pre-Run Snack", "HRV Check", "VO2 Max Test", "Easy Swim 40 min". Already-correct titles are unchanged.
   - Tests: Task 3.
4. **Espresso pastels on cards and hot gradients:** low contrast for status text.
   - Expected: every text token passes 4.5:1. Any shade the builder adjusts is updated in both `theme.ts` and `globals.css`.
   - Tests: Task 1 (contrast), Task 4 (hot card text uses `--text`).
5. **Switching theme on one page, then navigating or reloading.**
   - Expected: the choice sticks, with no flash of the old theme, and charts recolor too.
   - Tests: Task 1 (script), Task 9 (no color literals in chart code), plus the manual check in Task 10.

---

### Task 1: Theme tokens and theme setting

**Files:**
- Create: `src/lib/ui/theme.ts` and `theme.test.ts`, `src/components/theme-picker.tsx` (client)
- Modify:
  - `src/app/globals.css` (token set for `:root, [data-theme="dark"]` and `[data-theme="espresso"]`; body background gets the glow)
  - every `*.module.css` (rename the old vars: `--green→--good`, `--yellow→--caution`, `--red→--low`, `--blue→--info`; `--card2` keeps its name; check every use)
  - `src/app/layout.tsx`
  - `src/app/manifest.ts`
  - `src/app/settings/page.tsx` (adds the Theme section)
  - `src/app/__tests__/pwa-metadata.test.ts` (theme color is now `#0b0e12`)

**Interfaces:**
- **Produces** (from `src/lib/ui/theme.ts`):
  - `type Theme = "dark" | "espresso"`
  - `THEMES: readonly Theme[]`
  - `THEME_LABEL: Record<Theme, string>`: "Dark", "Espresso"
  - `THEME_STORAGE_KEY = "theme"`
  - `PALETTES: Record<Theme, Record<Token, string>>`, where `Token` is the 13 names in Global Constraints, without the `--` prefix.
  - `resolveTheme(stored: string | null | undefined): Theme`: unknown or missing gives `"dark"`.
  - `themeColor(t: Theme): string`: that palette's `bg`.
  - `THEME_SCRIPT: string`: a minified IIFE. Inside one try/catch it reads `localStorage[THEME_STORAGE_KEY]` and sets `document.documentElement.dataset.theme` to the resolved theme. It also sets the content of `meta[name="theme-color"]` to that theme's bg. On any error it does nothing, so the page stays Dark.
  - `contrastRatio(fg: string, bg: string): number`: WCAG relative luminance. It accepts `#rrggbb` and `rgba(r,g,b,a)`; an rgba foreground or background is alpha-composited over the theme `bg` first.
- **Produces** (component): `<ThemePicker />`
  - A client component with two 44 px+ segmented buttons, Dark and Espresso.
  - On tap it sets `document.documentElement.dataset.theme`, writes `localStorage` inside try/catch, and updates the theme-color meta.
  - It reads the current theme from `dataset.theme` on mount.

- [ ] **Step 1: Failing tests (`theme.test.ts`)**
  - `resolveTheme`: `null` gives "dark", `"espresso"` gives "espresso", `"neon"` gives "dark".
  - `themeColor("dark")` is "#0b0e12", and `themeColor("espresso")` is "#1e1712".
  - **Palette and CSS stay in sync:** read `src/app/globals.css` as text. For each theme and token, the CSS declares `--<token>: <value>` equal to `PALETTES[theme][token]`.
  - **Contrast:** for each theme, each text-like token (`text sub accent good caution low info sleep`) reaches at least 4.5 against `bg`, and against `card` composited over `bg`.
  - **No stray colors:** walk `src/` (skipping `*.test.*`, `globals.css`, `theme.ts`, `manifest.ts`, `layout.tsx`). No file matches `/#[0-9a-fA-F]{3,8}\b|rgba?\(/`.
  - **Every token exists:** every `var(--x)` used in `src/**/*.css` and `src/**/*.tsx` names a token defined in `globals.css`. This catches renames you missed.
- [ ] **Step 2:** Run the tests; they should fail.
- [ ] **Step 3: Implement**
  - `theme.ts`, `globals.css` and the module renames.
  - In `layout.tsx`:
    - `<html lang="en" data-theme="dark" suppressHydrationWarning>`;
    - `<head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>`;
    - `viewport.themeColor = themeColor("dark")`.
  - `manifest.ts` colors become `#0b0e12`.
  - `ThemePicker` goes in a "Theme" section on `/settings`.
  - If a contrast assertion fails, adjust that shade in both `theme.ts` and `globals.css`, and keep the character described in spec §6. List every adjusted value in the report.
- [ ] **Step 4:** Run the tests; they should pass. Also run the full suite, typecheck and eslint.
- [ ] **Step 5: Manual check**
  - Start the dev server (follow the dev-server rules), then curl `/login`.
  - The HTML must have `data-theme="dark"`, the inline script, and `theme-color` `#0b0e12`.
- [ ] **Step 6:** Commit: `feat(ui): theme tokens with Dark and Espresso themes`.

### Task 2: Icons and the emoji ban

**Files:**
- Create: `src/components/icon.tsx`, `src/lib/ui/no-emoji.test.ts`
- Modify: `src/app/today-training.tsx` and `src/app/plan/page.tsx` (replace ✓), `src/app/log/strength/[id]/page.tsx` (replace ✕), plus anything else the test finds

**Interfaces:**
- **Produces:** `<Icon name={IconName} size?={number /* default 16 */} label?={string} />`
  - Inline SVG on a 24-unit grid: `stroke="currentColor"`, `fill="none"`, `strokeWidth={1.8}`, round caps and joins.
  - `aria-hidden` unless `label` is given; with a label it renders `role="img"` and `aria-label`.
- **Produces:** `type IconName` = `"moon" | "pulse" | "scale" | "bike" | "run" | "swim" | "lift" | "core" | "mobility" | "rest" | "bolt" | "drop" | "check" | "close" | "alert" | "chevron-right" | "chevron-left" | "plus" | "sun" | "pill" | "meal" | "clock" | "flag" | "chart" | "settings"`
- **Produces:** `ICON_FOR_KIND: Record<SessionKind, IconName>`
  - swim→swim, bike→bike, run→run, strength→lift, lower_leg→lift, core→core, mobility→mobility, rest→rest.
  - `SessionKind` comes from the existing schema type.

- [ ] **Step 1: Failing test (`no-emoji.test.ts`)**
  - Walk every file under `src/`, excluding the test file itself, and fail with `path: char` for any code point matching `/\p{Extended_Pictographic}/u`.
  - Allowed exceptions: `·`, `–`, `—`, `×`, `±`, `°`, `↑`, `↓`, `→` and `←`. These aren't Extended_Pictographic, but keep a test asserting that they pass.
  - `ALLOWLIST: string[]` starts empty. Any file added to it needs a comment explaining why.
  - Also assert that `ICON_FOR_KIND` covers every `SessionKind`, and that `renderToStaticMarkup(<Icon name="moon" />)` contains `<svg` and `aria-hidden="true"`.
- [ ] **Step 2:** Run the test; it should fail on ✓ and ✕.
- [ ] **Step 3: Implement**
  - Create `Icon` and replace the three symbols: ✓ becomes `<Icon name="check" label="Done" />`, and ✕ becomes `<Icon name="close" label="Remove" />` (keep the button's existing accessible name).
- [ ] **Step 4:** Run the tests; they should pass. Run the full suite. Commit: `feat(ui): line icon set; no emoji in the app`.

### Task 3: Title Case helper

**Files:**
- Create: `src/lib/ui/title-case.ts` and `title-case.test.ts`

**Interfaces:**
- **Produces:** `titleCase(s: string): string`
  - Splits on spaces, keeping runs of spaces.
  - Each word: if it's in `KEEP` (case-insensitive), output the `KEEP` spelling. If it's a small word and neither first nor last, lowercase it. Otherwise uppercase the first letter and leave the rest as written.
  - Hyphenated words: apply the rule to each part ("pre-run" becomes "Pre-Run").
  - A word starting with a digit stays unchanged ("45").
- **Produces:**
  - `SMALL_WORDS = ["a","an","and","as","at","but","by","for","in","of","on","or","the","to","vs"]`
  - `KEEP = ["Z1","Z2","Z3","Z4","Z5","HRV","RHR","VO2","WHOOP","kcal","lb","oz","g","mL","min","h","km","mi","yd","m","AM","PM"]`
  - Units stay lowercase as spelled in `KEEP`.

- [ ] **Step 1: Failing tests (`title-case.test.ts`)**
  - `"Easy run"` → `"Easy Run"`
  - `"Z2 bike 60 min"` → `"Z2 Bike 60 min"`
  - `"pre-run snack"` → `"Pre-Run Snack"`
  - `"hrv check"` → `"HRV Check"`
  - `"vo2 max test"` → `"VO2 Max Test"`
  - `"easy swim 40 min"` → `"Easy Swim 40 min"`
  - `"fuel so far"` → `"Fuel So Far"`
  - `"out of the saddle"` → `"Out of the Saddle"`
  - `"take it to"` → `"Take It To"` (last word capitalized)
  - `"Upper A"` → unchanged
  - `""` → `""`
  - Idempotent: `titleCase(titleCase(x)) === titleCase(x)` for every case above.
- [ ] **Step 2:** Run the tests; they should fail.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run the tests; they should pass. Commit: `feat(ui): titleCase helper for display titles`.

Screen tasks apply `titleCase` to engine-generated and stored titles at render time:
- planned session titles;
- Day timeline item titles;
- reason or rule names shown as headings, but not rule statements, citation titles, user-typed exercise names or lab markers.

Static strings are fixed in source.

### Task 4: Shared UI parts and tab bar

**Files:**
- Create: `src/components/ui/ui.tsx`, `src/components/ui/ui.module.css`, `src/components/ui/ui.test.tsx`
- Modify: `src/components/tab-bar.tsx`, `src/components/tab-bar.module.css`, `src/components/error-view.module.css`

**Interfaces:**
- **Produces** (from `ui.tsx`, all server components):
  - `<Page glow?: "accent" | "good" | "caution" | "low" | "none" (default "accent") title?: string>`: the page wrapper. It draws the top radial glow from the token (`color-mix` of the glow color, or `--glow` for accent, into `--bg`), the safe-area padding, the max width, and an optional `<h1>` page title.
  - `<Card hot?: boolean as?: "section" | "div" | "a" href?: string>`: a plain card (`--card`, 1 px `--line`, radius 16). With `hot`, the background is a `linear-gradient(135deg, color-mix(in srgb, var(--accent) 20%, transparent), color-mix(in srgb, var(--info) 10%, transparent))` with an accent-tinted border. Text inside always uses `--text`.
  - `<Cap>`: small uppercase letter-spaced label in `--accent`.
  - `<BigNum unit?: string>`: heavy numerals with an optional small unit.
  - `<StatChip label: string value: string | null icon?: IconName hint?: string>`: when `value` is null it shows "—" plus the hint in `--sub`.
  - `<Meter value: number max: number tone?: "good" | "caution" | "low" | "info" | "accent" label: string>`: clamped 0–100% with `role="meter"`, `aria-valuenow` and `aria-valuemax`.
  - `<SectionTitle>`: an `h2` in Title Case as written by the caller.
- **Produces:** the restyled `TabBar`. It floats above the home indicator, with a rounded translucent bar, the active tab in `--accent`, and each tab with an icon above its label: today `sun`, day `clock`, plan `flag`, log `plus`, progress `chart`. Its API is unchanged.

- [ ] **Step 1: Failing tests (`ui.test.tsx`)**, using `renderToStaticMarkup`:
  - `<Meter value={150} max={100} label="Protein" />` gives `aria-valuenow="100"`.
  - `max={0}` gives `aria-valuenow="0"` with no NaN anywhere in the markup.
  - `<StatChip label="HRV" value={null} hint="No data" />` contains "—" and "No data".
  - `<Card hot>` has the hot class.
  - `<Page glow="low">` sets `data-glow="low"`.
- [ ] **Step 2:** Run the tests; they should fail.
- [ ] **Step 3:** Implement. Wrap any CSS transition in `@media (prefers-reduced-motion: no-preference)`.
- [ ] **Step 4:** Run the tests and the full suite; they should pass. Commit: `feat(ui): shared Bold athletic components and floating tab bar`.

### Task 5: Today

**Files:**
- Create: `src/lib/ui/recovery.ts` and `recovery.test.ts`, `src/components/recovery-ring.tsx`
- Modify: `src/app/page.tsx`, `src/app/today-training.tsx`, `src/app/today-fuel.tsx`, `src/app/water-button.tsx`, `src/app/today.module.css`, `src/app/why-sheet.tsx`

**Interfaces:**
- **Produces:**
  - `recoveryBand(score: number | null): "good" | "caution" | "low" | null`. It moves the existing 67 / 34 thresholds out of `page.tsx`: 67 and above is good, 34 and above is caution, below that is low, and null stays null.
  - `BAND_LABEL = { good: "High Recovery", caution: "Moderate Recovery", low: "Low Recovery" }`.
- **Produces:** `<RecoveryRing score: number | null band: Band | null pendingLabel: string />`
  - An SVG ring of radius 62 and stroke 12 on a track. The arc is `score/100` of the circumference in `var(--good / --caution / --low)`, with the percentage in the center.
  - With `band` null it shows the track only, `pendingLabel` in the center, and no arc.
  - A visible label under the ring gives `BAND_LABEL[band]`.
- **Consumes:** the `Page` glow from Task 4, which on Today is the band (or `"accent"` when null). Also `StatChip`, `Card hot`, `Meter`, `Icon`, `titleCase`.

- [ ] **Step 1: Failing tests (`recovery.test.ts`)**
  - `recoveryBand`: 67 gives good, 66 gives caution, 34 gives caution, 33 gives low, null gives null.
  - `RecoveryRing` with `score={null}`: the markup contains the pending label and no arc element (`data-arc` is absent).
  - `score={78}`: the arc `stroke-dasharray` starts with `round(0.78 × 2π × 62)`.
  - Neither markup contains "NaN".
- [ ] **Step 2:** Run the tests; they should fail.
- [ ] **Step 3: Implement the Today layout** (spec §5):
  - The ring at the top.
  - A stat chip row: Sleep (with need), HRV (with baseline), and Weight (with trend). Missing values get "—" plus a hint.
  - A "Today's Session" hot card with session titles through `titleCase`, a kind icon and the existing Why sheet link.
  - The fuel card: "Fuel So Far" with Meters for calories, protein and carbs, the water row and the water button restyled, plus the "Last Synced" line and the need links.
  - The data, links, actions and fail-soft try/catch stay exactly as they are.
- [ ] **Step 4: Manual check**
  - Start the dev server (follow the dev-server rules). Loading `/` is allowed for this task; it runs a WHOOP sync, which is fine.
  - Check that it returns 200, that the ring renders, and that switching to Espresso (`localStorage.theme`) recolors it.
  - Read the CSS at 375 px.
- [ ] **Step 5:** Run the full suite, typecheck and eslint. Commit: `feat(today): recovery ring and Bold athletic Today`.

### Task 6: Day

**Files:**
- Modify: `src/app/day/page.tsx`, `src/app/day/day.module.css`, `src/lib/nutrition/day-view.ts` (only if it formats titles)

**Interfaces:**
- **Consumes:** `TimelineItem.kind` (`"wake" | "supplement" | "meal" | "snack" | "session" | "bedtime"`), `Page`, `Card`, `Cap`, `Icon`, `titleCase`.
- **Produces:**
  - `EDGE_FOR_KIND`: meal and snack → `--caution`; session → `--info`; bedtime → `--sleep`; wake and supplement → `--accent`.
  - `ICON_FOR_ITEM`: wake → sun, supplement → pill, meal → meal, snack → bolt, session uses `ICON_FOR_KIND`, bedtime → moon.

- [ ] **Step 1: Failing test** (`src/app/day/day-style.test.ts`, pure):
  - `EDGE_FOR_KIND` covers all six kinds.
  - `nextItemIndex(items, nowHHMM: string): number | null` returns the first item at or after now. It returns null when every item is past, or when the date isn't today; the caller passes null for `nowHHMM`.
- [ ] **Step 2:** Run the tests; they should fail.
- [ ] **Step 3: Implement**
  - Each item shows its time in `--accent`, then a card with a 3 px left edge in its color, the icon, the title through `titleCase`, and the detail in `--sub`.
  - The next item is the hot card.
  - Restyle the targets summary at the top as stat chips, and keep the prev/next date arrows as icon buttons of at least 44 px.
- [ ] **Step 4:** Run the tests and the full suite. Manual check: curl `/day` returns 200. Commit: `feat(day): colored timeline in the new style`.

### Task 7: Plan, Season, Library and Plan Settings

**Files:**
- Modify:
  - `src/app/plan/page.tsx`, `plan/plan.module.css`, `plan/plan-nav.tsx`
  - `plan/season/page.tsx`, `plan/library/page.tsx`, `plan/settings/page.tsx`
  - `src/lib/plan/view.ts` (only label casing)

**Interfaces:**
- **Consumes:** the existing `weeksToRace`, `PHASE_LABEL`, `phaseBlocks` and `getWeekPlan` data. No new queries beyond reading what these already return.
- **Produces:** `weekStrip(days: { date: string; sessions: { status: "planned" | "done" | "skipped"; kind: string }[] }[], today: string): ("done" | "today" | "future" | "missed" | "rest")[]`
  - Pure, in `src/lib/plan/view.ts`.
  - **done:** every non-rest session is done.
  - **rest:** there are only rest sessions.
  - **today:** the date is today.
  - **missed:** a past date with an unfinished session.
  - **future:** anything else.

- [ ] **Step 1: Failing tests** (in `src/lib/plan/view.test.ts`):
  - `weekStrip` covers all five states in one week (an invented week).
  - The `PHASE_LABEL` values are in Title Case.
- [ ] **Step 2:** Run the tests; they should fail.
- [ ] **Step 3: Implement**
  - **Plan:** the hot card is the race countdown: `BigNum` "N Weeks", with the phase and week as Cap ("Base · Week 3 of 8"). Then the seven-day strip (done is filled `--good`, today is outlined `--accent`, missed is `--low`, future is dim, rest is a hollow dot), with the day initials under it. Each day has an `aria-label` such as "Monday: Done", so the state never relies on color alone. Then session cards with the kind icon, the title through `titleCase`, the duration, the status, and the existing Why link.
  - **Season:** phase blocks as cards.
  - **Library:**
    - Each rule is a card: the rule name through `titleCase`, plus an evidence-level badge.
    - Statements and citations stay verbatim (spec §4).
  - **Plan settings:** restyled form fields only.
- [ ] **Step 4:** Run the tests and the full suite. Manual check: curl `/plan`, `/plan/season`, `/plan/library` and `/plan/settings` all return 200. Commit: `feat(plan): race countdown, week strip and restyled plan pages`.

### Task 8: Log and its pages

**Files:**
- Modify:
  - `src/app/log/page.tsx`, `log/forms.tsx`, `log/log.module.css`, `log/records.module.css`
  - `log/strength/page.tsx`, `log/strength/[id]/page.tsx`, `log/strength/strength.module.css`
  - `log/cardio/*`, `log/pain/*`, `log/scans/*`, `log/labs/*`, `log/sweat/*`

**Interfaces:**
- **Consumes:** existing data and actions only, plus the Task 4 components and `Icon`.

- [ ] **Step 1: Implement**
  - **Log hub:**
    - The hot card is the in-progress strength session (exercise, target, last time) when one exists. Otherwise it's today's planned strength session, or nothing on a rest day.
    - Then a grid of entry tiles of at least 44 px: Weight, Swim / Bike / Run, Pain Check, Sweat Test, Scans, Labs. Each has an icon and a Title Case label and links to its existing page.
    - A primary "Log Weight" button that submits the existing weight form.
  - **Sub-pages:** restyle the forms (inputs, segmented controls, buttons), lists and history rows. The forms, actions and validation stay the same, and set entry keeps its current interaction (spec §10.6).
  - **Copy:** Title Case for headings and buttons. User-typed names stay as typed.
- [ ] **Step 2:** Run the full suite, typecheck and eslint. Update only tests that assert old heading casing, and list them.
- [ ] **Step 3: Manual check:**
  - With a minted session, curl every Log route. Each returns 200.
  - Post one weight with an invented value, check it appears, then delete it.
- [ ] **Step 4:** Commit: `feat(log): restyled log hub and entry pages`.

### Task 9: Progress and charts

**Files:**
- Modify: `src/app/progress/page.tsx`, `progress/progress.module.css`, `progress/labs/[marker]/page.tsx`, `src/components/line-chart.tsx`, `src/components/line-chart.module.css`

**Interfaces:**
- **Consumes:** the existing loaders and view helpers, `LineChart`, and the Task 4 components.

- [ ] **Step 1: Failing test** (extend `line-chart.test.tsx`):
  - The rendered markup contains no `#` hex or `rgb` color literal.
  - Stroke and fill use `var(--…)`: the line uses `--accent`, the dots `--info`, and the goal line `--accent` dashed at 50% opacity via a class.
- [ ] **Step 2:** Run the test; it should fail if any literal remains (otherwise it passes, which is fine; note that in the report).
- [ ] **Step 3: Implement**
  - The gain-goal hot card: `BigNum` "+X.X" over "/ N lb", a Meter, and rate against target.
  - Then section cards: Weight, Body Scans, Labs, Lifts, Endurance and Adherence, each with a SectionTitle.
  - Charts get a subtle area fill under the line (`color-mix` of the accent at 15%) and keep their empty states.
  - The lab detail page is restyled the same way.
- [ ] **Step 4:** Run the tests and the full suite. Manual check: curl `/progress`, `?range=1y`, and one lab marker page. All return 200. Commit: `feat(progress): Bold athletic Progress and themed charts`.

### Task 10: Settings, Login, guide page and final sweep

**Files:**
- Modify:
  - `src/app/settings/page.tsx`, `settings/settings.module.css`, `settings/nutrition/*`
  - `settings/nutrition/shortcut/page.tsx`, `src/lib/nutrition/guide-render.ts` (only heading styling hooks, if needed)
  - `src/app/login/page.tsx`, `src/app/error.tsx`, `src/components/error-view.tsx`

- [ ] **Step 1: Implement**
  - Restyle Settings: the Theme section from Task 1 at the top, then the WHOOP connection card, nutrition settings and the ingest section.
  - Restyle the Login screen: the app name in `BigNum` style, the glow, and a single card form.
  - Restyle the Shortcut guide page: headings in Title Case. The guide's `GUIDE_MD` content may get Title Case headings. If it changes, also update `docs/apple-health-shortcut.md` so the equality test passes.
  - Restyle the error view.
- [ ] **Step 2: Final sweep**
  - Grep `src/app` and `src/components` for headings, buttons and labels that aren't in Title Case, and fix them.
  - Run the full suite, typecheck and eslint.
- [ ] **Step 3: Manual check, both themes**
  - Curl every route with a minted session. Each returns 200, and `/login` returns 200 without one.
  - For each CSS module, read it at 375 px and confirm there are no fixed widths over 343 px.
  - List in the report any page where the theme can't be checked without a browser.
- [ ] **Step 4:** Commit: `feat(ui): restyle settings, login and guide; Title Case sweep`.
