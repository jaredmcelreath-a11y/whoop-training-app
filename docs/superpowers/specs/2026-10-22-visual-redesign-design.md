# Visual Redesign: Design

## 1. Intent

The app works but every screen looks plain. The owner wants it to feel polished and energetic, without changing what the app does. The chosen direction is **"Bold athletic"** (mockup B from the 2026-10-22 brainstorm): close to a sports-watch / WHOOP feel, with big numbers, a recovery ring and a colored glow.

The owner also wants a **second theme**: a dark brown background with pastel status colors (mint, sand, terracotta), selectable in Settings.

Success means that opening any tab feels designed rather than default, and that it stays as readable and fast as it is today.

## 2. Goals

1. Restyle every screen (Today, Day, Plan, Log, Progress, Settings, Login, and their sub-pages) in the Bold athletic style.
2. Add a theme setting with two themes: **Dark** (the default, today's palette) and **Espresso** (dark brown with pastels).
3. Remove every emoji from the app. Simple line icons replace them where an icon helps.
4. Put every title and header in Title Case.

## 3. Non-goals

- No new features, data or screens. No changes to what any screen shows or to how the engines work. The visual layer only, plus the theme setting and the Title Case display rule.
- No light theme.
- No redesign of the information architecture: the same five bottom tabs, and the same pages under each.

## 4. Anti-goals (failure even if it "works")

- Any emoji visible anywhere in the app.
- Text that is harder to read than today: low contrast, tiny type, or text sitting on busy gradients.
- Horizontal scrolling or clipped content at 375 px width.
- A flash of the wrong theme on load, or a theme that resets on reload.
- Pages noticeably slower to load: heavy images, web-font jank, or large client JavaScript added only for looks.
- Changing citation titles. Research paper titles in the Library are quoted verbatim and must not be Title Cased.

## 5. The style (decided by the owner, from mockup B)

- **Background:** a near-black base with a soft radial glow at the top of the screen.
  - On Today the glow color follows the recovery state: green, yellow or red, using the app's existing recovery bands (67 and above / 34–66 / below 34, as on today's Today screen).
  - Other screens use the theme's accent glow.
- **Typography:** big, heavy numerals for key values. Small uppercase letter-spaced labels ("TODAY'S SESSION") above them. Clear titles.
- **Cards:**
  - Dark translucent cards with a subtle 1 px border.
  - The single most important card on each screen gets the "hot" gradient (accent to info color) with an accent-tinted border.
- **Today:**
  - A large recovery ring at the top, showing the percentage and a short status line such as "Green Light · Push Today".
  - Under it, a row of stat chips: Sleep, HRV, weight.
  - Then a "Today's Session" hot card, then the fuel card.
- **Day:** a timeline. Each item has its time in the accent color and a card with a colored left edge by kind:
  - fuel: caution color;
  - training: info color;
  - sleep: violet/indigo;
  - everything else: accent.
- **Plan:**
  - A big race countdown ("51 Weeks" to race day) with the phase and week ("Base · Week 3 of 8").
  - A seven-day strip for the week: done = filled accent, today = outlined, future = dim.
  - Then the session cards.
- **Log:**
  - The in-progress strength session is the hot card: the current exercise, its target and last time, and tap-to-check set chips.
  - Below it, a grid of entry tiles: Weight, Swim / Bike / Run, Pain Check, Sweat Test, Scans, Labs.
  - A primary button for the most common action, Log Weight.
- **Progress:**
  - The gain-goal hot card: a big "+4.2 / 15 lb" with a progress bar and the rate against the target.
  - Charts and sections below in cards, with lines in the theme colors.
- **Tab bar:** a floating, rounded bar above the home indicator. The active tab is highlighted in the accent color.
- **Icons:** small single-color line icons, drawn as inline SVG, for things like the moon (sleep), heart-rate line (HRV), scale (weight), bike, run, swim, lift and bolt (fuel). They inherit `currentColor`. Never emoji.

The mockups the owner reacted to are in `.superpowers/brainstorm/` (local only, not committed): `style-directions.html` and `b-vs-c-pages.html` for B, and `theme-options.html` for Espresso.

## 6. Themes

All colors become theme tokens: CSS custom properties. Components never hard-code colors.

| Token | Dark (default) | Espresso |
|---|---|---|
| background | `#0b0e12` | `#1e1712` |
| glow | `#0f3b2a` | `#3b4a3a` |
| card | `rgba(255,255,255,.04)` | `rgba(255,240,225,.05)` |
| line (borders) | `rgba(255,255,255,.08)` | `rgba(255,235,215,.10)` |
| text | `#e9edf2` | `#f3ebe2` |
| sub (secondary text) | `#9aa5b3` | `#c2b1a2` |
| accent | `#7ff0bd` | `#a8dcbc` |
| good | `#2fd08a` | `#9fd8b5` (mint) |
| caution | `#f2c14e` | `#e8c48a` (sand) |
| low | `#f0646a` | `#d98a6c` (terracotta) |
| info | `#5aa9ff` | `#9bb8c9` (dusty blue) |

These are the mockup values. The builder may adjust shades to meet the contrast requirement in §7, keeping the character: Espresso stays a very dark brown with pastel status colors.

- **The setting:** Settings gets a "Theme" control (Dark / Espresso). The choice applies instantly and persists. *(Builder's call, recorded here: persistence is per device, e.g. `localStorage` plus a tiny inline script that sets the theme attribute on `<html>` before first paint so there is no flash. The phone and the laptop can differ. Storing it server-side instead is acceptable if it doesn't make the static page shells dynamic.)*
- **Charts:** they use the theme tokens, so they recolor with the theme.
- **Browser bar:** the PWA `theme-color` should follow the active theme where the platform allows it.

## 7. Constraints

- **Stack:** the existing stack (Next.js 16 App Router, CSS modules, `cacheComponents`). Read `node_modules/next/dist/docs/` before using unfamiliar APIs. No new runtime dependencies for styling or icons.
  - A self-hosted font is allowed only if it adds no layout shift. The system font stack is fine.
- **Layout:** phone-first. No horizontal scroll at 375 px, tap targets of at least 44 px, safe areas respected (from Plan 5).
- **Contrast:** body text and key numbers meet WCAG AA (4.5:1 for normal text, 3:1 for large text) on their actual backgrounds in **both** themes, including on the hot gradient cards.
- **Status color is never the only signal:** red / yellow / green states also carry a word or label.
- **Reduced motion:** any animation (for example the ring filling) is subtle and respects `prefers-reduced-motion`.
- **No behavior changes:**
  - Every existing test keeps passing.
  - Server actions, auth (`requireSession`), forms and the data shown are unchanged.
- **Privacy rules unchanged:** public repo, no owner data in code or tests.

## 8. Title Case rule (decided by the owner)

- **What gets Title Case:** every title and header. That covers page titles, section headings, card titles, tab labels, button labels, stat labels, and session/exercise/item names shown as titles (for example "Easy Run", "Z2 Bike", "Upper A", "Pre-Ride Snack", "Fuel So Far").
- **What doesn't:** sentences and descriptions stay in sentence case ("Drink about 20 oz during." is a sentence; "Drink" is capitalized only because it starts the sentence).
- **Dynamic titles:** titles generated by the engines or stored in the DB (planned session titles like "Easy run", timeline item titles like "Pre-run snack") are Title Cased at display time with one shared helper.
  - Lowercase small words unless first or last: a, an, and, as, at, but, by, for, in, of, on, or, the, to, vs.
  - Keep acronyms and tokens as written: Z2, HRV, VO2, RHR, kcal, lb, oz, g, mL, WHOOP.
  - Capitalize after a hyphen ("Pre-Ride").
  - Source strings in the templates may also be corrected, but the display helper is what guarantees the rule for already-stored rows.
- **Never changed:** citation titles, authors, venues, URLs, and user-entered text (exercise names the owner typed, notes, lab marker names).

## 9. No emoji rule

- Remove all emoji from UI text, page copy, engine-generated strings shown in the UI, the bundled Shortcut guide page, and the manifest.
- Add an automated test that fails if any file under `src/` contains an emoji code point. It covers the Extended_Pictographic ranges, excluding ordinary punctuation such as ·, –, ×, ↑ and ↓. Arrow glyphs like ↑ ↓ are allowed as text symbols.

## 10. Decisions on open points (designer's calls, recorded after the builder check)

1. **Color tokens:**
   - Rename the token set to the §6 names everywhere, rather than keeping parallel old names. Add `card2` (a slightly raised card) and `sleep` (violet/indigo: Dark `#9a8cff`, Espresso `#b7a6d6`) for the sleep items in the Day timeline.
   - The Dark background becomes `#0b0e12` as in mockup B. "Today's palette" means today's accent hues, not the exact background hex.
2. **Theme color:**
   - `manifest.ts` keeps a static Dark value; a manifest can't vary per device.
   - The runtime `<meta name="theme-color">` is updated by the theme script.
   - Tests that assert an exact color or theme value may be updated to match. "Existing tests keep passing" means behavior tests, not styling literals.
3. **No-flash theme:** an inline `<script>` in the root layout `<head>` plus `suppressHydrationWarning` on `<html>` is the intended approach. No cookie.
4. **Today with missing data:**
   - When recovery is missing or not yet scored, the glow uses the neutral accent and the ring shows an empty track with the existing "Pending" / "Not scored" label.
   - The stat chips are always Sleep, HRV and Weight, with "—" and a short hint when a value is missing.
   - The ring's status line uses neutral band labels: **"High Recovery"**, **"Moderate Recovery"**, **"Low Recovery"**. It doesn't use coaching copy like "Push Today", which could contradict the adapted plan shown just below it.
5. **Hot card per screen:**
   - **Plan:** the race countdown.
   - **Log:** the in-progress strength session; when there is none, today's planned strength session, or no hot card on a rest day.
   - **Day:** the next upcoming item.
   - **Settings, Login, Library, Season and the other sub-pages:** no hot card is fine.
   - At most one hot card per screen.
6. **Data on screen:**
   - Every value in §5 must come from data the app already has. Weeks to race and the phase/week already exist in the Plan views; the week's sessions and status come from planned sessions; "last time" exists in strength logging; gain and rate come from Progress.
   - New read-only display queries are fine. New tables or engine changes are not. If something can't be derived, leave it out rather than invent it.
   - **Set entry on Log keeps its current interaction.** It is restyled only; there is no new tap-to-check behavior.
7. **Title Case:**
   - Static strings (tab labels, buttons, headings, nutrient display names, the Shortcut guide's headings) are fixed in source.
   - The shared helper is for engine-generated or stored titles.
   - Tests asserting the old casing may be updated.
8. **Emoji test:**
   - It scans `src/` with a small explicit allowlist for test files that must contain emoji, for example a test that proves emoji are rejected.
   - Allowed text symbols: · – — × ± ° ↑ ↓ → ←.
   - Pictographic symbols like ✓ ✕ ⚠ ★ become SVG icons.
9. **Charts:** any hard-coded hex or rgba values in chart code move to theme tokens.

## 11. Left to the builder

- Exact spacing, radii, type scale and shadow values within the style above.
- The icon set's exact shapes, as long as it is inline SVG line icons matching the style.
- How the theme tokens are organized in CSS: a `[data-theme]` attribute on `<html>` is suggested.
- Whether to add subtle motion. If any is added, it must stay within §7.
- The order of work across screens.
