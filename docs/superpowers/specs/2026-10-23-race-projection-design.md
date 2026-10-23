# Projected Race Finish (Design)

**Status:** Draft for owner review.
**Builds on:** `2026-10-20-training-app-design.md` (rules, evidence badges, Library) and the Plan 9 work (Today layout).

## Why

The owner is about a year out from the half Ironman and wants a number to chase. A projected finish time sits at the top of Today and drops week by week as they get faster. The long goal is under 6:00. It is meant to motivate, so it has to be honest: when a week goes badly, the number goes back up.

## Goals

- **A card at the top of Today,** above the rings, showing:
  - the projected finish (h:mm:ss);
  - the change from last week, to the second ("▼ 1:12 from last week", or ▲ when slower);
  - the goal ("Goal: Under 6:00");
  - the split: swim, bike, run and transitions.
- **Weekly movement:**
  - Each week's projection is computed once and saved.
  - It can go up or down, so it's honest.
  - Small changes (seconds or a minute or two) are shown, not rounded away.
- **A small trend line** of the saved weekly projections inside the card.
- **Based on the owner's own training**, with legs that have no data yet clearly marked "Estimate".
- **Evidence-labeled:** the method is a `RULES` entry with sources and an honest badge, shown in the Library like every other rule.

## Non-Goals

- No "how far off the goal" line. The owner asked for it to be removed.
- No race-day pacing plan, course or weather adjustments, or comparisons with other athletes.
- No new inputs beyond what the app already collects. One exception is an optional set of starting paces in Plan Settings.

## Anti-Goals

- **No showing only the best number.** The projection goes back up after a slower stretch (owner's call).
- **No false precision.** A leg built from a default, not the owner's data, is labeled "Estimate", and so is the total while any leg is.
- **No owner numbers in the public repo.** Starting paces live in the DB, not in code or tests.

## Inputs (Already Stored)

- **`cardio_entries`:** kind, duration, distance, average watts, pool length, indoor/outdoor, date.
- **`weekly_metrics.vo2max`:** the WHOOP VO2 max the owner logs weekly.
- **`plan_settings`:** race date, pool unit.

## The Projection

The race is a 70.3: 1.2 mi swim (2,112 yd), 56 mi bike, 13.1 mi run, plus two transitions.

All numbers below are rule params. A research step (part of the plan) confirms or replaces each one with a sourced value before it's coded, and assigns the rule's evidence badge. The badge is expected to be "practice" or "expert", since no study validates a full 70.3 projection model for one athlete.

### Swim

- **Pace:** per 100 yd, from swims with a distance in the look-back window. Use the median pace of the faster half of those swims, so one slow drill session doesn't drag it down.
- **Race time:** that pace over 2,112 yd, times an open-water factor (starting value about 1.05; to be researched).

### Bike

- **Speed:** from outdoor rides with a distance in the look-back window, the median average speed of the faster half of rides of at least the minimum duration.
- **Race time:** 56 mi at that speed, times a race-effort factor (to be researched; a race is usually ridden a little harder than training rides).
- **Indoor rides with watts but no distance** don't count yet. Turning watts into road speed is a later improvement.

### Run

There are two signals, blended:

1. **Training pace:** from runs of at least the minimum distance in the look-back window, scaled to 13.1 mi with Riegel's formula (T2 = T1 × (13.1/d)^exponent, exponent about 1.06).
   - Easy runs aren't race efforts, so an easy-to-race adjustment applies (to be researched, for example from heart-rate or effort zones).
2. **Fitness:** a half-marathon time from the latest WHOOP VO2 max, using a published VO2-max-to-race-time relation (for example Daniels' VDOT tables). Researched and sourced.

Then:
- **Blend:** a weighted blend of the two (weights are params). Either one alone is used if the other is missing.
- **Off-the-bike slowdown:** a factor for running after 56 mi of cycling (to be researched; typical reports are a few percent to about 10%).

### Transitions

A fixed first-timer value (about 9 minutes total, a param). It doesn't change with training.

### Smoothing and Weekly Snapshots

- **Look-back window:** each leg uses the last few weeks of training (a param, about 6 weeks), so one session moves it only a little.
- **When:** a week's projection is computed on the first view of Today in that week, using data through the previous Sunday, then saved. A saved week never changes.
  - The current week shows the saved snapshot, not a live recompute.
  - So the number moves once a week: Monday is "new projection day".
- **Missing weeks:** a week with no view simply has no snapshot. The trend line skips it, and "change from last week" compares to the latest earlier snapshot.

### When There's No Data for a Leg

1. **Starting paces:** each leg falls back to the owner's starting pace, if set in Plan Settings. That is an optional "Starting paces" group: a swim pace per 100 yd, an easy long-run pace per mile, and a bike speed in mph.
2. **Defaults:** otherwise, a first-timer default (a param; bike around 16 mph).
3. Either way the leg is marked "Estimate".

The owner's current numbers (from chat) are entered in Plan Settings, never in code or docs. They give a starting projection of about 6:50 (a likely range of 6:30–7:15). That figure is the sanity check for the first snapshot.

## The Card

**At the top of Today:**
- Big projected time (h:mm:ss).
- Underneath, "▼ 1:12 from last week" (or ▲, or "First projection" when there's no earlier snapshot).
- "Goal: Under 6:00".
- A row of four small split chips: Swim, Bike, Run, Transitions. Each shows a time, and "Estimate" on any leg from a fallback.
- A tiny trend line of the weekly snapshots, once there are two or more.
- Tapping the card opens the rule in the Library.

**Goal:** stored as a setting, defaulting to 6:00:00, and editable in Plan Settings.

**Past days (Today `?date=`):** show the snapshot of that day's week, read only, if one exists.

## Storage

- **`race_projections` table:**
  - `week_start` (primary key);
  - swim, bike, run, transition and total seconds;
  - which legs were estimates;
  - the inputs used (a small JSON, for the Library and debugging);
  - `computed_at`.
  - It is additive (a new migration), and applied to Neon before deploy.
- **Plan settings, new nullable fields:**
  - starting swim pace (s/100 yd);
  - starting run pace (s/mi);
  - starting bike speed (mph);
  - goal (seconds).

## Left to the Builder

- Exact look-back length, minimum session distances and durations, blend weights, and every factor, all as rule params after the research step.
- Whether dismissed WHOOP workouts matter here. Projections use logged cardio entries only, so they don't.
- How the trend line is drawn (reuse the existing chart helpers).
- The exact card layout, within the visual rules (theme tokens, Title Case, at least 44 px targets, no sideways scroll at 375 px).

## Calls Made After the Builder Check

These were settled by the designer, not the owner. The owner can override any of them.

- **Week:**
  - A week runs Monday to Sunday in the owner's timezone, the same convention as `weekly_metrics.week_start` and the plan.
  - A week's snapshot always uses data through the previous Sunday, whatever day it is first computed. Friday's training waits for next Monday. The number therefore moves only on "new projection day".
- **First snapshot:**
  - It is computed, not calibrated to land on 6:50.
  - The easy-to-race adjustment applies to the starting run pace too, because it is an easy pace.
  - The acceptance check: with the owner's starting paces set (entered in the app, bike unset), the first projection falls inside 6:30–7:15. If it doesn't, the researched factors get rechecked; they are never forced to fit.
- **Thin data:**
  - A leg counts as "from your training" once the look-back window holds at least 2 qualifying sessions. That count is a param.
  - With fewer, the leg uses the starting pace or default and stays marked "Estimate". No blending of thin data with the fallback.
- **Eligible sessions:**
  - **Runs:** logged runs with a distance, indoor or outdoor. Treadmill runs with an incline over 1% are left out, since their pace isn't comparable.
  - **Swims:** logged swims with a distance. All are treated as pool swims, and the open-water factor applies.
  - **Rides:** outdoor rides with a distance.
  - Only `cardio_entries` count: what the owner logged, including entries filled from WHOOP via Add Details. Raw WHOOP workouts don't count.
- **Easy-to-race adjustment:** a single researched factor. The app has no effort data per run, and no new inputs were asked for. The VO2 max signal in the blend is the check on it.
- **VO2 max:** the latest non-null value whose week falls inside the look-back window. With none, the run leg uses training pace alone.
- **Trend line:** the total only, over the last 12 snapshots, with lower meaning better (shown so a falling line reads as progress).
- **Editing Plan Settings:**
  - Changing the starting paces recomputes the current week's snapshot, so a wrong first entry can be fixed.
  - Changing the goal changes no snapshot, only the goal line.
  - Past weeks never change.
