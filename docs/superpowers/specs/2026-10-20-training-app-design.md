# Half Ironman Training App: Design

_Written 2026-10-20. It records what the owner decided while brainstorming with Claude. Lines marked **(builder's call)** are decisions Claude made or left open, not things the owner asked for._

## 1. Intent

The app is a personal, evidence-based training coach for one person: the owner. They are preparing for a half Ironman (70.3: 1.2 mi swim, 56 mi bike, 13.1 mi run) about a year out, and over the same year they want to gain **about 15 lb, mostly muscle**.

Every day the app says:
- what training to do (swim, bike, run, strength, rest),
- how much to eat and when (calories, macros, micronutrients, meal timing),
- how to recover (sleep, rest days),
- which supplements are worth taking.

It **adapts to the owner's WHOOP sleep, recovery and strain**: today's numbers, and especially streaks and trends over the past days and weeks.

**The core requirement:** every recommendation comes from a written rule with a cited, credible source, and the app shows the reason and the link. The owner explicitly does not want numbers "made up by an AI."

## 2. Goals

1. A year-long plan, counted backward from race day, that gets a near-beginner in bike and run to a safe, strong 70.3 finish.
2. Muscle gain of about 15 lb over the year: most of it in months 1–6, then holding weight while endurance volume peaks.
3. Daily adaptation driven by WHOOP data (see section 7).
4. Calorie targets that calibrate themselves against the owner's real intake and weight trend (see section 8).
5. A "why" with a source on every number and workout, plus a browsable Library of all rules.
6. Phone-first, and also usable on a laptop.

## 3. Non-goals

- More than one user. This is personal. WHOOP's Sandbox tier (≤10 members) and Strava's single-player mode are enough.
- An AI chat or any feature that costs money per use. The owner explicitly declined an "Ask" chatbot. The owner can ask Claude Code questions outside the app.
- Food logging inside the app. The owner logs food in **Cronometer** and will keep doing so.
- A native iOS app or App Store release (possible later, not now).
- Medical diagnosis or treatment.
- Social features, sharing, or leaderboards.

## 4. Anti-goals (failure even if it "works")

- Any recommendation without a traceable rule and source, or a source misrepresented (claiming stronger evidence than it has).
- Advice that under-fuels the owner. Low energy availability harms recovery and hormones (see section 9). The app must never push calories below a safe floor.
- Training load that ramps faster than the safety limits, even during a streak of great recovery days.
- Two conflicting calorie targets. This app is the single source of truth; Cronometer is only for logging.
- The owner's health data leaking. **The GitHub repo `jaredmcelreath-a11y/whoop-training-app` is PUBLIC.** No personal data, secrets, tokens or `.env` files may ever be committed.
- Surprise costs (see section 11).

## 5. Owner baseline

The owner's personal data (body scan, labs, VO2 max, supplements, current training) is in **`docs/baseline.local.md`**. That file is **gitignored and must never be committed**. Load it into the database as seed data and show it in Progress.

Owner specifics (age, body composition, labs, supplements, training history, injuries) are in `baseline.local.md`. The design below assumes a mostly novice triathlete; anything owner-specific is read from that file or from settings, never hard-coded.

## 6. Data sources

| Source | How | What |
|---|---|---|
| **WHOOP** | OAuth 2.0 and the v2 API, plus v2 webhooks and a reconciliation pull. Full details in `WHOOP_API_NOTES.md`. | Recovery (score, HRV, RHR, SpO2, skin temp), sleep (stages, performance, sleep need including the extra from sleep debt and strain), cycles (day strain, kJ), workouts (sport, strain, HR, zone durations, kJ, distance), body measurements, profile |
| **Strava** | OAuth, single-player mode. Read activities, laps and streams. Used once the owner rides or runs outdoors. | Pace, distance, GPS, elevation, cadence, power, laps |
| **Apple Health → iOS Shortcut** | Cronometer writes nutrition to Apple Health. A Shortcut the builder writes reads the day's nutrition samples and POSTs them to an ingest endpoint protected by a secret token. It runs on a schedule (e.g. several times a day plus late evening) and can also be run by hand. | Calories, protein, carbs, fat, fiber, and the micronutrients Cronometer writes |
| **Manual entry in the app** | Log tab | Strength sets (exercise, reps, weight, done/skip). Gym bike (time, distance, watts if shown). Pool swim distance and pool length. Daily morning bodyweight. Weekly VO2 max and WHOOP Age. Body scans (every 6–8 weeks). Lab panels (dated, any marker). |

Known gaps:
- WHOOP's API has no VO2 max, no Strength Trainer sets/reps, no lab results, no steps (unconfirmed; check on the first data pull), and no pool distance. These are covered by manual entry above.
- WHOOP sends no webhooks for cycles or body measurements, so poll those.
- The Strava API agreement says Strava data may only be shown to the user it belongs to. That's fine here.
- Strava's getting-started page says an active Strava subscription may be needed to create an API app. **Strava is deferred: it's out of the first build.** Runs and rides are logged manually, plus WHOOP. Design the data model so Strava can be added later without a rewrite.

Data handling:
- Store raw API responses as well as normalized tables, so rules can be re-run later.
- Deduplicate WHOOP webhooks by `trace_id`.
- Refresh WHOOP tokens one at a time per user (refresh rotates both tokens).
- Remember to request the `offline` scope.

## 7. How training adapts

Everything is driven by rules (section 9). Three timescales:

1. **Today.** Recovery color sets how today's session runs:
   - Green: as planned.
   - Yellow: same session, lower intensity or volume.
   - Red: swap to easy Zone 2 or mobility.
   The exact thresholds and amounts are the builder's call, sourced.
2. **Recent trend (multi-day).** Compare 7-day rolling HRV and RHR against a 30–60 day baseline. The trend outweighs any single night.
   - 3 or more low days in a row: reduce volume or insert a rest day.
   - Sleep debt building up: move hard sessions later in the week and suggest an earlier bedtime.
   - A run of good days: unlocks the next planned progression, but **never beyond the ramp caps**.
3. **Week.** Total strain and training load versus the plan.
   - Consistently over: ease the next week.
   - Handled well: progress on schedule.

Season structure:
- **Periodization:** base → build → peak → taper, counted backward from the race date. The race isn't chosen yet, so use a **placeholder of mid-October 2027** that the owner can change in settings. Changing it re-plans the season.
- **Months 1–6:** the muscle-gain phase, while endurance volume is still modest.
- **Months 7–12:** hold weight while endurance volume rises.
- **Strength training** runs all year, lighter during taper.
- **Separating cardio and lifting:** on the same day, keep hard cardio and lifting several hours apart, to limit the interference effect.

Ramp:
- Start around 5–6 h/week and build toward roughly 10–12 h/week at peak. **(builder's call:** exact numbers, from sourced rules)
- **(Claude's call):** these hours are swim/bike/run only. **Strength training (2–3 sessions/week) is on top of them.** Ramp caps apply to the endurance hours. The weekly strain comparison counts everything.
- **(Claude's call), gain phase timing:** the gain phase counts forward from the app's start date. It must end no later than the start of the build phase. If the chosen race date moves the build phase earlier, the gain phase shrinks, never the build phase.
- **(Claude's call), session times:** the owner sets preferred training windows in settings (default: mornings, with an optional midday window). The app schedules inside those windows, and the Day tab builds meal times around them. The owner can edit a session's time on any day.
- **(Claude's call), runs before Strava:** Log includes manual run entry (treadmill or outdoor: time, distance, optional incline). WHOOP still supplies heart rate and strain. Strava improves the data but isn't required.
- Introduce running most conservatively, because of injury risk.
- The owner has a lot of free time, especially mornings. **Time isn't the limit; safe adaptation is.**

**(Claude's call), joint and lower-leg handling:**
- **Settings:** the owner can record joint or shin issues and a "joint status" in settings (see `baseline.local.md` for the owner's specifics). The status can tighten or relax the running rules.
- **Logging:** a quick 0–10 pain rating for configurable body areas (default: knee, ankle, shin), before and after runs, plus once a day.
- **Pain rules:**
  - Pain rising across sessions, or above a threshold: hold the running progression, swap that run for bike or swim, and suggest talking to the doctor.
  - Never progress running through rising pain.
- **Early running:** starts with low-impact-first choices, such as walk–run intervals and treadmill, with most early endurance volume in swim and bike.

Current equipment:
- Gym stationary bike (outdoor riding later, through Strava).
- Pool (pool length to be entered in settings).
- A full commercial gym.
- Running: none tracked yet. The Strava phone app can record it.

## 8. Food and calorie calibration

**Targets**
- Daily calories, protein, carbs and fat.
- Key micronutrients, compared against reference intakes.
- Carbs and calories shift by day with training load: more on long or hard days.
- Protein spread across meals.

**Calibration (adaptive energy expenditure)**
- Start from the scan's BMR plus WHOOP activity.
- Every week or two, estimate true daily expenditure from logged intake versus the trend in daily weight (smoothed, e.g. a 7-day average), and adjust the targets.
- Show a confidence level. Be cautious during the first 2–3 weeks and after big training changes.
- Use WHOOP's kJ only to distribute calories between days, never as the absolute truth. Wrist-worn calorie estimates are inaccurate (Shcherbina 2017).

**Gain rate**
- **The owner's decision: keep the 15 lb target.** The owner understands that some of the gain will be fat, since 15 lb of pure muscle in a year isn't realistic.
- Aim for the upper part of the sourced rate range (about 0.5% of bodyweight per week) during the gain phase. Months 7–12 can add a slow remainder if 15 lb isn't reached by then. The cap still holds: race preparation always wins.
- Progress shows honestly how much of the gain is lean versus fat, using rescans.
- If the weight trend falls below target, raise calories. If it's above, lower them.

**Hydration (added by the owner after the design was approved)**
- Track daily water. The source is Cronometer → Apple Health (dietary water) through the same Shortcut, plus a one-tap "+16 oz" button in the app.
- The target scales with training. The source rank is the ACSM fluid replacement position stand first, with expert explainers (e.g. Galpin) as context only.
- Optional sweat-rate test: weigh before and after a session, then account for fluid drunk. This personalizes the per-session fluid targets.
- Lives in Plan 4, alongside nutrition.

**Owner's existing lifting plan**
- The owner has a push/pull/legs program they've used on and off.
- It will be reviewed against the evidence (weekly sets per muscle, frequency, rep ranges, progression, and leg-day placement around run and bike).
- It becomes the starting template for the strength side of Plan 3.
- **Approved by the owner (2026-10-20), as the direction for the Plan 3 templates:**
  - Restructure into Upper A / Lower / Upper B, so each upper-body muscle is trained twice a week at about 10–14 hard sets per week.
  - One main lower-body day, scheduled away from hard runs.
  - Plyometrics (e.g. box jumps) are gated behind the joint-status setting.
  - Add core work.
  - Keep the machine-heavy exercise selection and the 10–12 rep range.
- **Lower-leg protection:** the plan includes a lower-leg protection block every week:
  - tibialis raises
  - straight-knee and bent-knee (soleus) calf raises
  - foot and ankle work

  It also uses a conservative running ramp. Label the evidence honestly: graded load progression is the best-supported measure, while specific exercises like tibialis raises have weaker, mostly mechanistic evidence. The same pain rule applies to every logged area: rising pain holds the running progression and swaps the run for bike or swim.

**Safety floor**
- Never set calories below a safe level relative to training (REDs, Mountjoy 2023).

**The owner's side**
- In Cronometer, turn off the exercise adjustment, or ignore Cronometer's target. The app should tell the owner this during setup.

**Meal timing**
- The Day tab places meals and snacks around workouts: carbs before and after endurance sessions, protein every few hours, nothing heavy right before swims.

## 9. The rules and evidence library

The heart of the app. **Rules are data, not hard-coded logic hidden in the code.**

Each rule has:
- an id
- a plain-English statement
- inputs
- the formula or thresholds
- one or more citations (title, authors, year, DOI or URL)
- an evidence level
- a one-line "why" shown to the user

Every recommendation the app produces records which rules fired and with what input values. That record is what drives the "Why" sheet.

Source hierarchy (the owner's requirement, refined together in brainstorming):
1. Position stands and consensus statements (ACSM, ISSN, IOC, etc.).
2. Meta-analyses and well-run trials.
3. Expert explainers (Attia, Huberman) as context only, ranked below the studies they cite.

Evidence levels must be honest. Weak or early evidence (e.g. the 10% running rule) must be labeled weak.

Seed sources from the conversation. **The builder must verify each citation before relying on it.**
- Protein ~1.6 g/kg/day (benefit plateaus), range up to ~2.2: Morton et al. 2018, *BJSM* meta-analysis; ISSN protein position stand, Jäger et al. 2017.
- Creatine 3–5 g/day maintenance: ISSN position stand, Kreider et al. 2017.
- Athlete nutrition and carbs by training load: ACSM / Academy of Nutrition and Dietetics / Dietitians of Canada joint position, Thomas et al. 2016.
- Low energy availability: IOC consensus on REDs, Mountjoy et al. 2023.
- Intensity distribution, mostly easy: Seiler's work on endurance training intensity distribution.
- HRV-guided training: Kiviniemi et al. 2007. Rolling-average HRV is better than single days: Plews et al. 2012/2013.
- Novice running injury risk with large weekly increases (~30%+): Nielsen et al. 2014.
- Wrist-worn calorie error: Shcherbina et al. 2017.
- Gain rate during bulking: the builder should find a sourced review (e.g. on off-season physique athletes).
- Concurrent training interference: the builder should find a current meta-analysis.

Supplements:
- Recommend only strongly evidenced ones (e.g. creatine, caffeine), plus anything that corrects a measured deficiency (from labs).
- Prefer third-party-tested products (e.g. NSF Certified for Sport).
- Review the owner's current stack in `baseline.local.md` with honest evidence labels.
- Flag when something is worth asking a doctor about.

**Medical framing:** the app gives general, sourced guidance, not medical advice. Lab values outside range, or ones the rules mark "watch" (e.g. a marker flagged "watch"), produce a "discuss with your doctor" note, never a treatment. The labs show when they were taken. Suggest a retest when they're older than about 6 months or before big phase changes. (Retest plans and suggested extra markers are in the baseline file.)

## 10. Screens (phone-first web app)

Bottom tabs:

1. **Today** (main screen, the "dashboard tiles" mockup the owner picked)
   - Recovery tile (with trend), sleep (last night and tonight's need), HRV versus baseline, weight (one-tap entry, trend versus goal).
   - Today's training card with weekly progress.
   - "Fuel so far" bars versus targets (calories, protein, carbs).
   - Tap any tile for the details and its "Why" with sources.
2. **Day:** the timeline view (from mockup B). Wake and supplements, workouts, meals and snacks with protein and carb targets placed around training, bedtime from sleep need. Focus: **when to eat**.
3. **Plan:** this week, this month, and the full-season phases with the race countdown. Settings for race date and pool length. Also the entry point to the **Library** (all rules and sources).
4. **Log:** strength sets during a session (shows the prescribed sets and last time's numbers, tap to complete, adjust weight and reps). Gym bike and pool entries. Weight. Weekly VO2 max and WHOOP Age. Scans. Labs.
5. **Progress:** weight trend, scans over time, lab markers over time with dates, lifts, endurance fitness, adherence.

Mockups: `mockups/home-options.html` (the owner chose C for Today and B for Day).

**(builder's call):** visual style. Dark, WHOOP-adjacent styling is a reasonable default.

## 11. Constraints

- **Platform:** an installable web app (PWA) that works well on iPhone, from the Home Screen, and in a laptop browser. One backend.
- **Security:**
  - Health data and tokens are sensitive. The app must sit behind a login, single user. **(builder's call:** method, e.g. a passkey or a strong password with secure session cookies)
  - All secrets (WHOOP and Strava client secrets, tokens, the Shortcut ingest token) live in server-side environment variables or the database, never in the repo.
  - Verify WHOOP webhook signatures (HMAC-SHA256, see `WHOOP_API_NOTES.md`).
  - Secrets and env files go in `.gitignore` from the very first commit.
- **Cost:** no per-use AI. Hosting and database should be free-tier, or at most a few dollars a month. **Ask the owner before choosing anything that costs money.**
- **Rate limits:** WHOOP allows 100/min and 10k/day. Strava allows 200 per 15 minutes and 2k/day. This is trivial for one user, but batch backfills should respect them.
- **Development environment:** Node.js is **not installed** on the owner's Mac. Python 3.9 is. The builder installs what the chosen stack needs.
- **WHOOP app registration:**
  - The owner has registered the app with redirect `http://localhost:3000/auth/whoop/callback` (or the https variant).
  - Webhooks aren't set yet. Add a webhook URL and a production redirect once it's hosted.
  - Privacy policy: `https://github.com/jaredmcelreath-a11y/whoop-training-app/blob/main/PRIVACY.md`.

## 12. Left to the builder

- Tech stack, hosting, database, and project structure, within the constraints above.
- Exact rule formulas and thresholds, each sourced per section 9.
- The specific weekly templates (sessions per sport per week, by phase).
- How the iOS Shortcut is built and distributed to the owner (with step-by-step setup instructions).
- Visual design details.
- Testing approach. The rules engine especially should be unit-tested against example inputs.
- Build order.

Suggested build order: WHOOP connection and data storage → rules library and Today → Log → Plan → food ingest → Day → Progress. Strava is a later, separate addition (see section 6).
