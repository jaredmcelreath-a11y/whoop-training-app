# Rules sources

Research notes for `src/lib/engine/rules/catalog.ts`. Every citation below was checked on 2026-10-21 against PubMed (authors, year, title, journal, volume and pages, DOI) or the publisher's page. DOI links are given where they exist.

**Evidence labels** (see the global constraints and spec §9):

| Label | Meaning |
|---|---|
| consensus | a position stand or consensus statement |
| meta-analysis | a meta-analysis |
| trial | a single study of any design: RCT, cohort, cross-sectional, case comparison or modelling |
| expert | a narrative review or expert explainer |
| n-of-1 | one person's self-experiment |
| practice | coaching or product convention |

### Evidence-label policy (fix round 1, controller ruling 2)

- Each citation has a **role**: `supports` (the default) or `context`.
- A rule's `evidence` is the level of its strongest **supporting** citation. Context citations are shown but never raise the label. A rule with only context citations is `practice`.
- A citation is `context` when it is any of these:
  - mechanistic or modelling work;
  - from a different population or outcome than the rule applies to (for example tendinopathy rehab, strength athletes for an endurance rule, team sports, or mortality);
  - a critique of the method;
  - Bryan Johnson's n-of-1 data (always context).
- When a rule's *number* comes from practice rather than from its sources, the caveat says so.
- `catalog.test.ts` enforces the label maths, that Johnson is always context, and that every number in a rule's `statement` and `why` exists in its params. A small allowlist covers numbers derived from params: the recovery band edges 66 and 33.
- `RULES` is deeply frozen, at runtime and in its types.

**Additive params.** The fixed param names are all present. I also added a few params so later tasks never need to inline a number the plan already mentions:

| Param | Value | Why |
|---|---|---|
| `season.phases.taperVolumeFactor` | 0.5 | Task 3 says "taper applies the factor" |
| `volume.run.walkRunWeeks` | 8 | Task 4 starts runs as walk–run for 8 weeks |
| `volume.split.earlyRunShare` | 0.2 | the plan's 0.20 starting run share |
| `volume.split.earlyWeeks` | 8 | how long that starting share lasts |
| `volume.run.longRunMaxIncreasePct` | 10 | Frandsen 2025 single-run spike (fix round 1) |
| `volume.run.longRunLookbackDays` | 30 | Frandsen's comparison window: the longest run of the past 30 days |
| `volume.endurance.reentryBelowFraction` | 0.5 | Task 3 fix round 1 (Ruling 5): a week under half the starting volume counts as missed, and the next week restarts at the starting volume instead of locking at zero. Practice, not studied |
| `volume.run.reentryBelowFraction` | 0.5 | the same re-entry threshold for run minutes. Practice, not studied |
| `volume.loadCheck.trailingWeeks` | 4 | the "trailing 4-week average" in the rule's definition |
| `recovery.hrvTrend.minNightsInWindow` | 5 | conservative extrapolation from Grosicki 2026's HRV-CV finding (see recovery.hrvTrend) |

---

## season.phases

**Params:** `{ taperWeeks: 2, peakWeeks: 4, buildWeeks: 12, taperVolumeFactor: 0.5 }`. Base is the rest. **Evidence:** meta-analysis.

**Sources:**
- **Bosquet L, Montpetit J, Arvisais D, Mujika I (2007).** Effects of tapering on performance: a meta-analysis. *Med Sci Sports Exerc* 39(8):1358-65. https://doi.org/10.1249/mss.0b013e31806010e0
  - A meta-analysis of 27 studies in competitive athletes.
  - The best strategy was a **2-week taper** with volume cut exponentially by **41–60%**, keeping intensity and frequency unchanged.
- **Mujika I, Padilla S (2003).** Scientific bases for precompetition tapering strategies. *Med Sci Sports Exerc* 35(7):1182-7. https://doi.org/10.1249/01.MSS.0000074448.73931.11 (narrative review, labelled expert)
  - Keep intensity, cut volume (up to 60–90%), and cut frequency by no more than 20%.
  - Tapers ranged from 4 to more than 28 days.
- **Bompa TO, Buzzichelli CA (2019).** *Periodization: Theory and Methodology of Training*, 6th ed. Human Kinetics. https://us.humankinetics.com/products/periodization-6th-edition (textbook, labelled expert)
  - The standard reference for the base → build → peak → taper structure.

**Param choices:**
- `taperWeeks` 2 matches Bosquet.
- `taperVolumeFactor` 0.5 (a 50% cut) sits in the middle of Bosquet's 41–60%.
- The 4 peak and 12 build weeks are coaching convention.

**Caveat:** only the taper is meta-analysis-backed. The peak and build lengths are not tested values.

## season.gainPhase

**Params:** `{ maxWeeks: 26 }`, capped at the start of build. **Evidence:** practice (was expert; Iraki is now context).

**Sources:**
- **Iraki J, Fitschen P, Espinar S, Helms E (2019).** Nutrition Recommendations for Bodybuilders in the Off-Season: A Narrative Review. *Sports (Basel)* 7(7):154. https://doi.org/10.3390/sports7070154
  - Recommends a ~10–20% energy surplus.
  - Target gain is ~0.25–0.5% of bodyweight per week for novice and intermediate lifters, and slower for advanced.
  - Recommends protein at 1.6–2.2 g/kg/day.
  - It is a narrative review, so it is labelled `expert`, with **role: context**. It is about bodybuilders and gain *rate*, not phase length.

**Param choice:** Iraki gives no phase length. The 26 weeks is the spec's owner ruling ("months 1–6"), and the build-phase cap is the spec's §7 ruling. The gain *rate* belongs to the nutrition rules (a later plan), not here.

## season.recoveryWeek

**Params:** `{ every: 4, volumeFactor: 0.7 }`. **Evidence:** expert.

**Sources:**
- **Bompa & Buzzichelli (2019)**, as above. Describes step loading, such as 3 loading weeks followed by 1 unloading week (expert).
- **Bell L, Strafford BW, Coleman M, Androulakis Korakakis P, Nolan D (2023).** Integrating Deloading into Strength and Physique Sports Training Programmes: An International Delphi Consensus Approach. *Sports Med Open* 9(1):87. https://doi.org/10.1186/s40798-023-00633-0
  - A Delphi survey of 21–34 strength and physique coaches.
  - It defines a deload as "a period of reduced training stress designed to mitigate … fatigue".
  - It is coach opinion, not a formal position stand, so it is labelled `expert`, not `consensus`.
  - **Role: context**, because it concerns strength and physique athletes. The rule stays `expert` through Bompa.

**Considered but not cited as support:**
- **Coleman M et al. (2024).** *PeerJ* 12:e16777. https://doi.org/10.7717/peerj.16777
  - An RCT in which 1 week off at the midpoint of 9 weeks of resistance training gave no hypertrophy benefit and slightly *smaller* strength gains.
  - It tested full cessation, not a 70% week, and lifting, not endurance.
  - It sits in the caveat because citing it as support would mislabel the rule as `trial`.

**Param choice:** a 3:1 pattern at 70% is practice. No endurance trial tests it, and the caveat says so.

## volume.endurance

**Params:** `{ startHours: 5, peakHours: 11, maxWeeklyIncreasePct: 10, reentryBelowFraction: 0.5 }`. **Evidence:** trial.

**Sources:**
- **Lalonde F, Martin SM, Boucher VG, Gosselin M, Roch M, Comtois AS (2020).** Preparation for an Half-Ironman Triathlon amongst Amateur Athletes. *Int J Exerc Sci* 13(6):766-777. https://pubmed.ncbi.nlm.nih.gov/32509136/ (doi 10.70252/OWPW6610)
  - 32 first-time half-Ironman amateurs followed a 24-week program.
  - They averaged **410 ± 201 min/week**, and 31 of 32 finished.
- **Gilinsky N, Hawkins KR, Tokar TN, Cooper JA (2014).** Predictive variables for half-Ironman triathlon performance. *J Sci Med Sport* 17(3):300-5. https://doi.org/10.1016/j.jsams.2013.04.014
  - A cross-sectional study of 209 half-Ironman finishers, who averaged **13.9 ± 5.4 h/week**.
  - Hours did not differ between the fast and slow groups.
- **Gabbett TJ (2016).** The training-injury prevention paradox. *Br J Sports Med* 50(5):273-80. https://doi.org/10.1136/bjsports-2015-095788 (narrative review, labelled expert, **role: context** because it covers mainly team sports)
  - "Excessive and rapid increases in training loads" are linked to soft-tissue injuries.

**Param choices:**
- 5 h is within the first-timer range (~6.8 h ± 3.4 h).
- 11 h sits between the first-timer and general-finisher averages, matching the spec's 10–12 h target.
- The 10% weekly cap is conservative practice. No trial supports 10% specifically (see volume.run).
- `reentryBelowFraction` 0.5 is practice. A week under half the starting volume counts as missed. Without it, a zero week would cap every later week at zero. The next week then restarts at the starting volume (5 h), the same load as week 0. Above the threshold the 10% cap applies strictly.

## volume.run

**Params:** `{ startMinPerWeek: 45, maxWeeklyIncreasePct: 10, absoluteCapWeeklyIncreasePct: 30, reentryBelowFraction: 0.5, walkRunWeeks: 8, longRunMaxIncreasePct: 10, longRunLookbackDays: 30 }`. **Evidence:** trial.

**Sources:**
- **Nielsen RØ, Parner ET, Nohr EA, Sørensen H, Lind M, Rasmussen S (2014).** *J Orthop Sports Phys Ther* 44(10):739-47. https://doi.org/10.2519/jospt.2014.5164
  - A cohort of 874 novice runners.
  - Runners who increased by more than 30% over 2 weeks had more "distance-related" injuries than those under 10% (HR 1.59, 95% CI 0.96–2.66, p = 0.07, a borderline result).
  - There was no overall difference in injury rates.
  - The authors suggest novices stay under 30% a week.
- **Buist I, Bredeweg SW, van Mechelen W, et al. (2008).** *Am J Sports Med* 36(1):33-9. https://doi.org/10.1177/0363546507307505
  - An RCT in 532 novices.
  - A 13-week graded program based on the **10% rule** gave the same injury rate (20.8%) as a standard 8-week program (20.3%).
  - **The 10% rule showed no benefit.**
  - **Role: context.** It is evidence *against* the 10% param, so it is shown but not counted as support.
- **Schuster Brandt Frandsen J, Hulme A, Parner ET, Møller M, … Nielsen RO (2025).** How much running is too much? *Br J Sports Med* 59(17):1203-1210. https://doi.org/10.1136/bjsports-2024-109380
  - A cohort of 5,205 runners.
  - Injury risk rose when a **single run was more than 10% longer than the longest run in the past 30 days** (HRR 1.64 for a 10–30% spike).
  - The week-to-week ratio showed **no relationship**, and the ACWR showed a negative dose-response.

**Considered:**
- **Damsted C et al. (2018).** *Int J Sports Phys Ther* 13(6):931-942. PMID 30534459.
  - A systematic review concluding there is "very limited evidence" linking load changes to running injury.
  - It agrees with the caveat. It is not cited because it is a systematic review without pooled data, which fits no label cleanly.

**Param choices:**
- The 30% absolute cap comes from Nielsen 2014.
- The 10% default is kept as a cautious margin, labelled honestly as unproven.
- Walk–run for 8 weeks follows the spec ("low-impact-first").

### Single-run cap: `longRunMaxIncreasePct: 10`, `longRunLookbackDays: 30`

**Source:** Frandsen 2025 (BJSM), above. It is a cohort study, so it is labelled `trial` with role `supports`.

**What it found:**
- In 5,205 adult runners and 588,071 sessions tracked on Garmin devices, a session longer than the longest run of the previous 30 days raised the overuse-injury rate:
  - by more than 10% and up to 30%: HRR 1.64 (95% CI 1.31–2.05);
  - by more than 30% and up to 100%: HRR 1.52;
  - by more than 100%: HRR 2.28.
- Neither the week-to-week ratio nor the ACWR showed a positive relationship.

**Param choice:**
- The param equals the study's reference threshold: an increase of up to 10% was the reference group.
- Task 4 caps each planned run, the long run especially, at (longest run in the last `longRunLookbackDays`) × (1 + `longRunMaxIncreasePct`/100).

**Caveats:**
- The study is observational, and its runners were experienced adults (mean age 46), not novices.
- Injuries were self-reported.
- This is the best-supported running-load signal in the catalog, but it is still one cohort.

## volume.split

**Params:** `{ swim: 0.25, bike: 0.45, run: 0.30, earlyRunShare: 0.20, earlyWeeks: 8 }`. **Evidence:** practice (no citation).

**Param choices:**
- The split is coaching convention: the bike leg is the longest part of a 70.3, and swim and bike are low-impact.
- During the first `earlyWeeks`, run is capped at `earlyRunShare`, and the remaining 0.10 goes to swim and bike.
- Run minutes are also bound by the `volume.run` caps, whichever is lower.
- No study tests this split.

## volume.loadCheck

**Params:** `{ overPct: 20, weeks: 2, trailingWeeks: 4 }`. If (week strain ÷ trailing `trailingWeeks` average) is above 1.2 for 2 weeks in a row, the next week holds at the previous actual. **Evidence:** practice (was expert).

**Sources:**
- **Gabbett 2016**, as above.
  - Describes the acute:chronic workload ratio (ACWR) as a "best practice predictor" of injury.
  - Its often-quoted "sweet spot" is about 0.8–1.3.
- **Impellizzeri FM, Tenan MS, Kempton T, Novak A, Coutts AJ (2020).** Acute:Chronic Workload Ratio: Conceptual Issues and Fundamental Pitfalls. *Int J Sports Physiol Perform* 15(6):907-913. https://doi.org/10.1123/ijspp.2019-0864
  - Concludes "There is no evidence supporting the use of ACWR" for load management.
  - Also names its statistical artefacts.

**Roles:** both sources are context. Gabbett covers mainly team sports, and Impellizzeri is a critique. Neither supports this threshold for a solo endurance athlete, so the rule is `practice`.

**Param choice:** 1.2 is below Gabbett's 1.3 upper limit, so the check is cautious. It only *holds* load and never raises it, so the downside of a false alarm is small.

**Caveat (must stay):** ACWR is contested (Impellizzeri 2020). Frandsen 2025 also found the ACWR had a *negative* dose-response with running injury.

## intensity.distribution

**Params:** `{ lowShare: 0.8 }` by time. **Evidence:** meta-analysis.

**Sources:**
- **Seiler S (2010).** *Int J Sports Physiol Perform* 5(3):276-91. https://doi.org/10.1123/ijspp.5.3.276 (expert review, **role: context**: descriptive data from elite athletes)
  - In descriptive studies, about 80% of elite *sessions* are low intensity and about 20% are high.
- **Stöggl T, Sperlich B (2014).** *Front Physiol* 5:33. https://doi.org/10.3389/fphys.2014.00033 (trial)
  - In 48 well-trained athletes, polarized training improved key endurance measures most.
- **Silva Oliveira P, Boppre G, Fonseca H (2024).** *Sports Med* 54(8):2071-2095. https://doi.org/10.1007/s40279-024-02034-z
  - A meta-analysis of 17 studies.
  - Polarized training gave slightly more VO2peak (SMD 0.24), mainly in short interventions and highly trained athletes.
  - Time-trial and threshold results were the same as other distributions.
- **Rosenblat MA, … Seiler S (2025).** *Sports Med* 55(3):655-673. https://doi.org/10.1007/s40279-024-02149-3
  - A network meta-analysis of individual data.
  - Overall, polarized and pyramidal plans did not differ.
  - Recreational athletes may improve more with **pyramidal**.

**Param choice:** both polarized and pyramidal plans are mostly easy, so 0.8 low by time is safe either way.

**Caveat:** Seiler counted sessions; here the share is applied to time, which is stricter about easy volume.

## intensity.zones

**Params:** % of max HR, `{ z1: [0.5,0.6], z2: [0.6,0.7], z3: [0.7,0.8], z4: [0.8,0.9], z5: [0.9,1.0] }`. **Evidence:** practice.

**Sources:**
- **WHOOP, Inc.** "Max Heart Rate Training Zones", The Locker. https://www.whoop.com/thelocker/max-heart-rate-training-zones/
  - The site blocks automated fetches (Cloudflare 403). The 50/60/70/80/90% bands were confirmed through search-indexed copies of WHOOP's zone pages.
  - One WHOOP article says zones use the **heart-rate-reserve** method. The engine uses % of max HR as the spec asks, so expect small differences from the app.

**Considered:**
- **Garber CE et al. (2011)**, ACSM position stand. *Med Sci Sports Exerc* 43(7):1334-59. https://doi.org/10.1249/MSS.0b013e318213fefb
  - It classes moderate intensity as 64–76% and vigorous as 77–95% of max HR.
  - It is not cited as support because it does not define these five zones. Citing it would mislabel a product convention as `consensus`. It is mentioned in the caveat.

## recovery.color

**Params:** `{ green: 67, yellow: 34 }`: green ≥ 67, yellow 34–66, red ≤ 33. **Evidence:** practice.

**Sources:**
- **WHOOP, Inc.** "WHOOP 101", developer docs. https://developer.whoop.com/docs/whoop-101
  - Quotes the bands "GREEN (67-100%)", "YELLOW (34-66%)" and "RED (0-33%)".

**Caveat:** the bands are a proprietary product convention, not validated thresholds.

## recovery.yellowScale

**Params:** `{ durationFactor: 0.8, dropHighIntensity: true }`. **Evidence:** meta-analysis.

**Sources:**
- **Granero-Gallegos A, González-Quílez A, Plews D, Carrasco-Poyatos M (2020).** *Int J Environ Res Public Health* 17(21):7999. https://doi.org/10.3390/ijerph17217999
  - A meta-analysis of RCTs: HRV-guided training gave a small extra VO2max benefit over pre-planned training (ES between groups ≈ 0.19).
- **Kiviniemi AM, Hautala AJ, Kinnunen H, Tulppo MP (2007).** *Eur J Appl Physiol* 101(6):743-51. https://doi.org/10.1007/s00421-007-0552-2
  - An RCT in 26 men.
  - When HRV fell below the reference (10-day mean − SD, or a 2-day downward trend), they did **low-intensity training or rest** instead of high.
  - The HRV group improved max running speed more.
- **Javaloyes A, Sarabia JM, Lamberts RP, Moya-Ramon M (2019).** *Int J Sports Physiol Perform* 14(1):23-32. https://doi.org/10.1123/ijspp.2018-0122
  - 17 well-trained cyclists, with a 4-week HRV baseline.
  - HRV-guided training improved 40-min time trial and peak power.
  - There was no significant difference between groups, only a "likely beneficial" result by magnitude-based inference.

**Param choices:** `dropHighIntensity` comes straight from the studies. `durationFactor` 0.8 is practice: the studies changed intensity, not duration.

**Caveat:** the studies used raw HRV against a personal baseline, not WHOOP's composite recovery score.

## recovery.redSwap

**Params:** `{ swapTo: "z1_or_mobility", maxMin: 40 }`. **Evidence:** trial.

**Sources:**
- **Kiviniemi 2007**, as above. A clear HRV drop led to low intensity or rest, and all sessions were **40 min**, which is where `maxMin` comes from.
- **Plews DJ, Laursen PB, Stanley J, Kilding AE, Buchheit M (2013).** *Sports Med* 43(9):773-81. https://doi.org/10.1007/s40279-013-0071-8 (expert review)
  - Recommends rolling-average HRV and individual interpretation.

**Caveat:** red recovery is WHOOP's composite, not the raw HRV the trial used. Pain and joint rules apply first.

## recovery.hrvTrend

**Params:** `{ rollingDays: 7, baselineMinDays: 30, baselineMaxDays: 60, swcSd: 0.5, minNightsInWindow: 5 }`, using ln rMSSD. **Evidence:** trial.

**Sources:**
- **Plews DJ, Laursen PB, Kilding AE, Buchheit M (2012).** *Eur J Appl Physiol* 112(11):3729-41. https://doi.org/10.1007/s00421-012-2354-4
  - A case comparison of 2 elite triathletes.
  - The **7-day rolling average of ln rMSSD** declined steadily in the athlete who became non-functionally over-reached.
- **Plews 2013**, as above (expert): use averaging, not single days.
- **Javaloyes 2019**, as above: a 4-week baseline before HRV-guided decisions.
- **Buchheit M (2014).** Monitoring training status with HR measures: do all roads lead to Rome? *Front Physiol* 5:73. https://doi.org/10.3389/fphys.2014.00073 (expert review)
  - Notes that authors have used an SWC of 0.5× CV (Le Meur 2013) or 1× CV (Plews 2012/2013).
  - Says "there is currently no evidence that changes greater than any fraction of the CV would actually be meaningful".
- **Grosicki GJ, Carter JR, Laursen PB, Plews DJ, Altini M, Galpin AJ, … Holmes KE (2026).** *Am J Physiol Heart Circ Physiol* 330(1):H187-H199. https://doi.org/10.1152/ajpheart.00738.2025
  - About 2 million nights from more than 21,000 wearable users (WHOOP data).
  - Its finding: at least 5 of 7 nights are needed for a reliable **7-day HRV coefficient of variation (HRV-CV)**, with ICC ≥ 0.80 against the full week.
  - **The finding is about HRV-CV, the day-to-day spread, not the 7-day mean of ln rMSSD this rule uses.** Using it to gate the rolling mean is a conservative extrapolation. A mean is generally *more* stable than a CV computed from the same nights, so a CV threshold should be at least as strict as the mean needs.
  - Andy Galpin is a co-author.
  - **Role: context** (a different metric). It is still Galpin's peer-reviewed citation in this catalog.
- **Galpin A on Huberman Lab (2023)**, recovery episode (expert). https://www.hubermanlab.com/episode/guest-series-dr-andy-galpin-maximize-recovery-to-achieve-fitness-and-performance-goals
  - In the transcript, Galpin recommends measuring HRV "for at least a month" before acting on it, and comparing today with the last week's average and with your own history, not with other people.

**Param choices:**
- 7-day rolling window, as in Plews.
- A baseline of at least 30 days, as in Galpin and Javaloyes. The 60-day maximum is the spec's.
- 0.5 SD follows Le Meur 2013, as described by Buchheit 2014. It is not taken from Javaloyes, whose abstract does not state the band. For log-transformed rMSSD, the SD is close to the CV.
- `minNightsInWindow` 5 is practice, extrapolated from Grosicki's HRV-CV result (see above).

**Caveat:** Plews used 1× CV, which is less sensitive. No exact fraction is proven.

## recovery.rhrTrend

**Params:** `{ rollingDays: 7, elevatedBpm: 5 }`. **Evidence:** expert.

**Sources:**
- **Buchheit 2014**, as above. Its Table 1 gives resting HR a typical error of about 10% (CV) and an SWC of about −2%. Resting HR is cheap but noisy.

**Param choice:**
- 5 bpm is about 9% at a resting HR of 55. That is near the error of a single day, but about 2 typical errors for a 7-day average (≈10%/√7).
- So it is a clear but not hair-trigger signal. It is a practical choice, not a tested cut-off.

## recovery.lowStreak

**Params:** `{ days: 3, action: "rest_or_deload", volumeFactor: 0.6 }`. **Evidence:** expert.

**Sources:**
- **Plews 2013** (expert): sustained downward HRV trends, not single days, signal maladaptation.
- **Galpin on Huberman Lab (2023)**, recovery episode, as above (expert).
  - One bad day is normally ignored.
  - He first checks whether the pattern has gone on for more than five days. He acts once it "crosses more than seven days of consistent problems", then drops training to about 50% "until we start rebounding back to baseline".

**Param choice:**
- 3 days is practice, the spec's rule (§7). It is more cautious than Galpin's more than seven days.
- 0.6 is close to Galpin's ~50% and to the 0.5–0.6 taper and deload range.

## recovery.sleepDebt

**Params:** `{ windowDays: 3, debtMin: 90 }`. A shortfall of 90 min or more over 3 days moves hard sessions later and suggests an earlier bedtime. **Evidence:** consensus.

**Sources:**
- **Walsh NP, Halson SL, Sargent C, Roach GD, … Samuels CH (2021).** Sleep and the athlete: narrative review and 2021 expert consensus recommendations. *Br J Sports Med* 55(7):356-368. https://doi.org/10.1136/bjsports-2020-102025 (e-pub Nov 2020)
  - Athletes often sleep less than 7 h.
  - The effect of partial restriction over 1–3 nights on performance "remains unclear".
  - Recommends an individualised approach.
- **Watson NF, Badr MS, Belenky G, Bliwise DL, et al. (2015).** AASM/SRS joint consensus statement. *Sleep* 38(6):843-4. https://doi.org/10.5665/sleep.4716
  - Adults should sleep 7 h or more a night.
  - **Role: context**: general adult health, not athletes or performance.
- **Fullagar HH, Skorski S, Duffield R, Hammes D, Coutts AJ, Meyer T (2015).** *Sports Med* 45(2):161-86. https://doi.org/10.1007/s40279-014-0260-0 (expert review)
  - Sleep loss tends to hurt sport-specific performance and may cause autonomic imbalance.
- **Watson AM (2017).** Sleep and Athletic Performance. *Curr Sports Med Rep* 16(6):413-418. https://doi.org/10.1249/JSR.0000000000000418 (expert review)
  - The brief's "Watson 2017". The stronger AASM statement by Watson NF (2015) is added beside it.
- **Windred DP, Burns AC, Lane JM, Saxena R, Rutter MK, Cain SW, Phillips AJK (2024).** *Sleep* 47(1):zsad253. https://doi.org/10.1093/sleep/zsad253 (trial, cohort)
  - In 60,977 UK Biobank participants, sleep **regularity** predicted mortality better than sleep duration.
  - Backs the "consistent bedtime" part of the note.
  - **Role: context**: older adults, with mortality as the outcome.
- **Bryan Johnson, Blueprint protocol (n-of-1).** https://protocol.bryanjohnson.com
  - Advises a fixed bedtime ("In bed by 8:30 pm") and a 60-minute wind-down.
  - **Role: context**, as always for n-of-1 (see below).

**Policy check:** Walsh 2021 is an athlete consensus and supports the rule, so the label stays `consensus`. Fullagar and Watson AM support it as `expert`.

**Param choices:** 90 min over 3 days is about 30 min a night, a small but real debt. The trigger values are practice. The consensus supports the direction (protect sleep, keep timing consistent), not the numbers.

## recovery.greenStreak

**Params:** `{ days: 3 }`. **Evidence:** practice (no citation).

This is a spec §7 design choice. It unlocks only the *next planned* progression, and never passes a ramp cap or a pain hold.

## strength.volume

**Params:** `{ setsPerMusclePerWeek: [10, 14] }`. **Evidence:** consensus.

**Sources:**
- **Currier BS, D'Souza AC, Singh MAF, … Schoenfeld BJ, … Phillips SM (2026).** ACSM Position Stand: Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews. *Med Sci Sports Exerc* 58(4):851-872. https://doi.org/10.1249/MSS.0000000000003897
  - An overview of 137 systematic reviews.
  - "Muscle hypertrophy was enhanced by higher volumes (≥10 sets/wk)."
  - This replaces the ACSM 2009 stand.
- **Schoenfeld BJ, Ogborn D, Krieger JW (2017).** *J Sports Sci* 35(11):1073-1082. https://doi.org/10.1080/02640414.2016.1210197
  - A meta-regression showing a graded dose-response: each extra weekly set adds about 0.37% gain.
  - The 10+ set category trended highest.
- **Pelland JC, Remmert JF, Robinson ZP, Hinson SR, Zourdos MC (2026).** *Sports Med* 56(2):481-505. https://doi.org/10.1007/s40279-025-02344-w
  - Meta-regressions over 67 studies: more volume gives more growth and strength, with diminishing returns.
- **Galpin on Huberman Lab (2023)**, strength and hypertrophy episode (expert). https://www.hubermanlab.com/episode/dr-andy-galpin-optimal-protocols-to-build-strength-and-grow-muscles
  - From the transcript: a minimum of "10 working sets" per week, and "15 to 20 working sets per week" for intermediate to advanced lifters.

**Param choice:** start at the floor everyone agrees on (10) and stop at 14, below Galpin's 15–20, to save recovery for the endurance load.

## strength.frequency

**Params:** `{ perMusclePerWeek: 2 }`. **Evidence:** consensus.

**Sources:**
- **ACSM 2026**, as above. Voluntary strength improves with at least 2 sessions a week.
- **Schoenfeld BJ, Ogborn D, Krieger JW (2016).** *Sports Med* 46(11):1689-1697. https://doi.org/10.1007/s40279-016-0543-8
  - With volume equated, training twice a week beat once a week for hypertrophy.
- **Schoenfeld BJ, Grgic J, Krieger J (2019).** *J Sports Sci* 37(11):1286-1295. https://doi.org/10.1080/02640414.2018.1555906
  - With volume equated, frequency does not meaningfully affect hypertrophy.
- **Galpin on Huberman Lab (2023)**, strength episode (expert).
  - Don't train a muscle only once a week.
  - He prefers about 3 full-body days, with 48–72 h between sessions for the same muscle.

**Caveat:** twice a week is mostly a practical way to spread 10 or more sets.

## strength.repRange

**Params:** `{ min: 10, max: 12, rirTarget: [1, 3] }`. **Evidence:** consensus.

**Sources:**
- **ACSM (2009).** Progression models in resistance training for healthy adults. *Med Sci Sports Exerc* 41(3):687-708. https://doi.org/10.1249/MSS.0b013e3181915670
  - Writing group led by Ratamess NA. PubMed lists the author as "American College of Sports Medicine".
  - For hypertrophy, use loads of 1–12 RM with emphasis on **6–12 RM**. Novices use 8–12 RM.
- **Schoenfeld BJ, Grgic J, Ogborn D, Krieger JW (2017).** *J Strength Cond Res* 31(12):3508-3523. https://doi.org/10.1519/JSC.0000000000002200
  - When sets go to failure, hypertrophy is similar with low and high loads. Heavy loads give more 1RM strength.
- **Robinson ZP, Pelland JC, Remmert JF, Refalo MC, Jukic I, Steele J, Zourdos MC (2024).** *Sports Med* 54(9):2209-2231. https://doi.org/10.1007/s40279-024-02069-2
  - Hypertrophy improves as sets end closer to failure.
  - Strength is similar across a wide range of reps in reserve.
- **Galpin on Huberman Lab (2023)**, strength episode (expert).
  - Hypertrophy works from "four to 30 reps" a set, but spend most time in "eight to 15".
  - Stop "within two or so reps of failure", and take sets to true failure only sparingly.

**Param choice:** 10–12 reps with 1–3 reps in reserve fits ACSM, Galpin and Robinson, and limits joint load for someone also running.

**Caveat:** ACSM 2026 found training to failure gives no consistent extra benefit.

## strength.progression

**Params:** `{ addLbUpper: 5, addLbLower: 10, whenAllSetsAtMax: true }`, double progression. **Evidence:** consensus.

**Sources:**
- **ACSM 2009**, as above.
  - "A 2-10% increase in load" when you can do 1–2 reps over the target number.
  - The brief's "Ratamess et al." is this stand.

**Param choice:** 5 and 10 lb are the usual plate steps.

**Caveat:** on light lifts a fixed step can exceed 10%. Task 5 should use the smallest available increment there.

## strength.taper

**Params:** `{ volumeFactor: 0.6 }`. **Evidence:** expert (was meta-analysis).

Fix round 1 restored the planner's 0.6. The first pass had changed it to 0.5 to fit Bosquet, which is endurance-only.

**Sources:**
- **Travis SK, Mujika I, Gentles JA, Stone MH, Bazyler CD (2020).** Tapering and Peaking Maximal Strength for Powerlifting Performance: A Review. *Sports (Basel)* 8(9):125. https://doi.org/10.3390/sports8090125 (narrative review, `expert`, supports)
  - Most taper research is in endurance sports, and "evidence regarding peaking protocols for strength and power athletes is lacking".
  - Practitioners rely on trial and error.
- **Winwood PW, Travis SK, Barnes MJ, Keogh JWL, Pritchard HJ (2026).** Tapering and Peaking in the Weight Lifting Sports: A Systematic Review of Athletes' Self-Reported Strategies. *Sports Med*, online ahead of print. https://doi.org/10.1007/s40279-026-02500-w
  - Labelled `practice` with role supports, because it documents what athletes *do*.
  - Across 7 survey and interview studies, taper phases cut training volume by about **40–45%**, usually as a step taper lasting 5–9 days.
- **Bosquet 2007** and **Mujika & Padilla 2003**, as above.
  - **Role: context.** They cover endurance-performance tapering, a different outcome from strength.

**Param choice:**
- 0.6 is a 40% cut, matching the ~40–45% that strength athletes report.
- Here the strength taper only sheds fatigue for an endurance race, so the low end of that range is fine.
- The number is practice, and the caveat says so.

## concurrent.spacing

**Params:** `{ minHoursBetweenHardCardioAndLift: 6, noLowerDayWithinHoursBeforeKeyRun: 24 }`. **Evidence:** meta-analysis.

**Sources:**
- **Schumann M, Feuerbacher JF, Sünkeler M, Freitag N, Rønnestad BR, Doma K, Lundberg TR (2022).** *Sports Med* 52(3):601-612. https://doi.org/10.1007/s40279-021-01587-7
  - A meta-analysis of 43 studies.
  - Concurrent training did **not** hurt hypertrophy or max strength.
  - Explosive strength was blunted, mainly when both were done in the same session, and not when sessions were at least 3 h apart.
- **Wilson JM, Marin PJ, Rhea MR, Wilson SM, Loenneke JP, Anderson JC (2012).** *J Strength Cond Res* 26(8):2293-307. https://doi.org/10.1519/JSC.0b013e31823a3e2d
  - Interference grew with endurance frequency and duration.
  - It was larger with **running** than with cycling.
- **Robineau J, Babault N, Piscione J, Lacome M, Bigard AX (2016).** *J Strength Cond Res* 30(3):672-83. https://doi.org/10.1519/JSC.0000000000000798
  - An RCT comparing 0, 6 and 24 h of recovery between sessions.
  - The authors advise "less than 6-hour recovery" should be avoided between contradictory qualities. 24 h was best.
- **Doma K, Deakin GB (2013).** *Appl Physiol Nutr Metab* 38(6):651-6. https://doi.org/10.1139/apnm-2012-0362
  - Running economy and time to exhaustion were impaired **the day after** a strength session followed by a run.

**Param choices:** 6 h comes from Robineau, and 24 h before a key run comes from Doma.

## pain.monitoring

**Params:** `{ maxDuring: 3, risingSessions: 2, holdUntilBelowDays: 3 }`, on a 0–10 scale. **Evidence:** practice (was trial).

**Sources:**
- **Silbernagel KG, Thomeé R, Eriksson BI, Karlsson J (2007).** *Am J Sports Med* 35(6):897-906. https://doi.org/10.1177/0363546506298279
  - An RCT in 38 patients with Achilles tendinopathy.
  - Continuing running and jumping under a pain-monitoring model had no negative effect compared with rest.
  - The model's rules, confirmed through a published summary because the full text is paywalled:
    - pain during activity must stay **below 5/10**;
    - pain after activity should settle **by the next morning**;
    - pain and stiffness must **not increase week to week**.
  - **Role: context.** The population is supervised Achilles tendinopathy rehab, not shin or joint pain in a returning runner.
  - The rule *adapts* the model, so its label is `practice`.

**Param choices:**
- `maxDuring` 3 is deliberately stricter than the model's 5, because this is shins and joints in a returning runner, not supervised tendon rehab.
- `risingSessions` 2 and `holdUntilBelowDays` 3 are practice versions of "not increasing" and "settles".

**Required wording:** the rule says "consider talking to your doctor" and never diagnoses.

## pain.jointStatus

**Params:** `{ caution: { plyo: false, runIncreaseFactor: 0.5 }, restricted: { run: false, plyo: false } }`. **Evidence:** practice (no citation).

This is practice plus the spec's doctor follow-up rule. "Caution" halves the run ramp cap and removes plyometrics. "Restricted" removes running and plyometrics. It never diagnoses.

## lower_leg.block

**Params:** `{ sessionsPerWeek: 2, tibialisSets: 2, soleusSets: 2, gastrocSets: 2 }`. **Evidence:** practice (was trial).

**Sources:**
- **Dorn TW, Schache AG, Pandy MG (2012).** *J Exp Biol* 215(Pt 11):1944-56. https://doi.org/10.1242/jeb.064527
  - Musculoskeletal modelling of 9 runners.
  - Up to 7 m/s, **soleus and gastrocnemius** contribute most of the vertical support force.
  - This is why the calf work is split into bent-knee (soleus) and straight-knee (gastrocnemius) raises.
  - **Role: context**, because it is mechanistic modelling. The set counts and frequency are practice.

**Considered and left out:**
- **Lauersen JB, Bertelsen DM, Andersen LB (2014).** *Br J Sports Med* 48(11):871-7. https://doi.org/10.1136/bjsports-2013-092538
  - A meta-analysis finding that strength training cut sports injuries to under a third.
  - Not cited: it supports strength training in general, not these drills, and citing it would mislabel this rule as `meta-analysis`. The general point already sits behind the strength rules.
- No trial was found showing that tibialis raises prevent shin pain or MTSS. That evidence is weaker still: mechanistic or anecdotal.

**Spec §8 note:** graded load (`volume.run`) is the best-supported measure. This block is a low-cost extra, labelled honestly.

## week.template

**Params:** `{ sessionsPerWeek: { swim: [2, 3], bike: [2, 3], run: [2, 4] }, typicalSessionMin: { swim: 40, bike: 60, run: 30 }, longShare: 0.4, qualityMinMin: 15, minWarmUpMin: 10, minCoolDownMin: 5, maxHardShareOfSession: 0.5, strengthMin: 50, lowerLegMin: 10, coreMin: 10, coreSessionsPerWeek: 2, walkRun: { startRunMin: 1, walkMin: 1, stepRunMin: 1, everyWeeks: 2 }, strides: { reps: 6, seconds: 20 } }`. **Evidence:** practice (no citation).

Added in Task 4 (weekly session template) so `buildWeek` never inlines a number. Every value is coaching practice, not a tested number:

| Param | Value | Use |
|---|---|---|
| `sessionsPerWeek` | swim 2–3, bike 2–3, run 2–4 | session-count range per sport (owner decision) |
| `typicalSessionMin` | swim 40, bike 60, run 30 | session count = the sport's minutes ÷ this, rounded, then clamped to the range |
| `longShare` | 0.4 | the long session takes ~40% of the sport's minutes (owner: 35–45%); with 2 sessions it is an even split so the long one is never shorter |
| `qualityMinMin` | 15 | shortest worthwhile hard block (tempo/threshold/intervals); below this the session stays easy z2 |
| `minWarmUpMin`, `minCoolDownMin` | 10, 5 | every quality session keeps at least this much easy warm-up and cool-down (Ruling 9); spare easy minutes split evenly, warm-up takes the odd minute |
| `maxHardShareOfSession` | 0.5 | the hard block is at most half the session (Ruling 9) |
| `strengthMin`, `lowerLegMin`, `coreMin` | 50, 10, 10 | planned durations for the calendar; prescriptions come from Task 5 |
| `coreSessionsPerWeek` | 2 | core attaches to two strength days (upper days first) |
| `walkRun` | start 1 min run / 1 min walk, +1 min run every 2 weeks | walk-run intervals for the first `volume.run.walkRunWeeks` weeks |
| `strides` | 6 × 20 s | the strides note on one easy base-phase run |

**How the other rules bound it:** the weekly minutes come from `volume.*`; every run is capped by `volume.run.longRunMaxIncreasePct` over the longest run in the last `longRunLookbackDays` (Ruling 6); hard minutes stay within `1 − intensity.distribution.lowShare` of the week; the Lower day is never the day before a key run (`concurrent.spacing`); plyometrics follow `pain.jointStatus`.

**Quality sessions (Rulings 8-9):** a quality session keeps its full planned duration. Only its hard block (`details.hardMin`) counts against the `1 − lowShare` budget. The block is the smallest of: the remaining budget, `maxHardShareOfSession` of the session, and the session minus `minWarmUpMin` and `minCoolDownMin`. Below `qualityMinMin` the session stays easy z2. Under joint status `restricted` no quality is planned at all, so a tighter status never adds hard minutes.

---

## Galpin & Johnson

### Andy Galpin: used

**Peer-reviewed:**
- **Grosicki … Galpin AJ … Holmes KE (2026)**, *Am J Physiol Heart Circ Physiol*.
  - Used on `recovery.hrvTrend` as a `trial` (an observational wearable study) with role **context**.
  - Its "≥5 of 7 nights" finding is for **7-day HRV-CV**. The rule applies it to the 7-day ln rMSSD mean as a conservative extrapolation.

**Huberman Lab Guest Series, labelled `expert`:**
- **"Optimal Protocols to Build Strength & Grow Muscles"** (released 2023-01-25), used on `strength.volume`, `strength.frequency` and `strength.repRange`.
  - Numbers were read from the episode transcript on hubermanlab.com:
    - at least 10 sets a week, and 15–20 for intermediates;
    - most work at 8–15 reps, about 2 reps in reserve;
    - each muscle trained more than once a week, 48–72 h apart.
- **"Maximize Recovery to Achieve Fitness & Performance Goals"** (released 2023-02-15), used on `recovery.hrvTrend` and `recovery.lowStreak`.
  - At least a month of HRV before acting on it.
  - Compare with the last week's average.
  - Ignore single bad days. Look at patterns lasting more than five days, act once a decline "crosses more than seven days", and drop to about 50%.

### Andy Galpin: considered, left out

- **Refalo MC, Nuckols G, Galpin AJ, et al. (2025).** *PeerJ* 13:e19042. https://doi.org/10.7717/peerj.19042
  - A Bayesian meta-analysis of sex differences in hypertrophy.
  - Verified, but no rule depends on sex differences.
- **Bathgate KE, … Galpin AJ (2018).** *Eur J Appl Physiol* 118(10):2097-2110.
  - A twin case study of 30 years of different exercise habits.
  - Interesting, but not a dose or threshold source.
- **Galpin's fiber-type papers** (for example Serrano et al. 2019 on weightlifters, and Arevalo et al. 2018).
  - Mechanistic. None sets a training number used here.
- **"How to Build Strength, Muscle Size & Endurance"** (Huberman Lab, 2022-03-28).
  - Has a segment on combining endurance and strength work.
  - The part that was readable only said the interference field "has changed quite a bit". It gave no number, so `concurrent.spacing` cites the meta-analyses and trials instead.
- **Hydration guidance** (from the Guest Series). There is no hydration rule in this plan. It belongs with the nutrition rules later.
- **Galpin's books** (for example *Unplugged*, 2017). Not reviewed directly, so not cited.

### Bryan Johnson (Blueprint): used

- **Blueprint protocol page** (https://protocol.bryanjohnson.com), on `recovery.sleepDebt` as `n-of-1`.
  - It covers a fixed bedtime, "being consistent is as important as getting enough sleep", and a 60-minute wind-down.
  - **Context only.** That rule's evidence is `consensus` (Walsh 2021, AASM 2015), and Windred 2024 independently supports sleep regularity.
  - The test suite enforces that Johnson is never the only, or strongest, support.

### Bryan Johnson: left out

- His "100% sleep score for months" claims and his biomarker age claims.
  - These are self-reported device metrics with no control. No threshold here could rest on them.
- His exercise and supplement protocols.
  - No rule in this catalog needs them. Supplements belong to a later plan, which has its own evidence rules.

---

## Could not fully verify

- **WHOOP heart-rate zones page.** The page returns HTTP 403 to automated fetches. The zone bands were confirmed only through search-indexed WHOOP pages, and WHOOP's own pages disagree on % of max HR versus heart-rate reserve. The rule is labelled `practice` and the caveat says so.
- **Silbernagel 2007 model details.** The full text is paywalled. The study, the authors and the RCT result were verified on PubMed, but the "<5/10, settles by morning, not increasing week to week" rules come from a published secondary summary. They match the model as it is usually described.
- **Javaloyes 2019, "0.5 SD" band.** The abstract doesn't state it. The 0.5 band is instead supported by Buchheit 2014's description of Le Meur's 0.5× CV. `swcSd` is therefore not attributed to Javaloyes; only the 4-week baseline is.
- **Bompa & Buzzichelli 2019.** Verified as a real book (publisher page, ©2019, ISBN 9781492544807), but the text wasn't read. It is cited only for the general periodization structure.

---

# Nutrition, hydration and supplements (Plan 4, Task 2)

Checked on 2026-10-21. Bibliographic details (authors, year, title, journal, volume, pages, DOI) were confirmed through PubMed E-utilities or Crossref. Claims were checked against abstracts, Europe PMC full text where open, the Dietitians of Canada copy of the joint position paper (Thomas 2016), the FAO report pages, the Compendium site (pacompendium.com) and the Huberman Lab episode page. The NIH ODS fact sheets block automated reading, so ODS values were confirmed through search-indexed copies of those same ODS pages (listed under "Could not verify" below). The same evidence-label policy applies as above.

**Additive params** (names beyond the plan's table, so later tasks never inline a number):

| Param | Value | Label | Why |
|---|---|---|---|
| `nutrition.energyAvailability.ffmFallbackFraction` | 0.85 | practice | Task 5: fat-free mass when there is no scan (assumes ~15% body fat) |
| `nutrition.initialTdee.whoopWindowDays` | 14 | practice | Task 5: "WHOOP cycle kcal average over the last 14 days" |
| `nutrition.initialTdee.mifflin` | 10 / 6.25 / 5 / +5 / −161 | trial | Mifflin 1990's simplified per-sex equation, from the abstract |
| `nutrition.timeline` (new rule) | `wakeBeforeWindowMin` 45, `snackAfterWakeMin` 10 | practice | Task 8 wake time and the "wake + 10 min" snack edge case |
| `nutrition.exerciseKcal` (new rule) | MET per sport, `kcalPerMetKgHour` 1, `historyMinWorkouts` 3, `historyLookbackDays` 90 | expert / practice | Task 7: planned exercise kcal; WHOOP history preferred |
| `hydration.sweatTest` (new rule) | `minDurationMin` 20, `maxGainLb` 2, `litersPerKgLost` 1 | consensus (method) / practice (checks) | Task 6 sweat-test validation |
| `supplements.evidence.caffeine.minutesBefore` | 60 | consensus | Guest 2021: most common timing |
| `supplements.evidence.vitaminD.rdaUg` / `ulUg` | 15 / 100 | consensus | ODS; lets the UI show "never above the upper limit" |

**Values changed from the planner's starting points:**
- `nutrition.carbsByLoad` third tier `maxMin` 180 → **240**. Thomas 2016's "high" tier is 1–3 h/day and "very high" is over 4–5 h/day. With 180, a 3–4 h day jumped to 8–12 g/kg, which the source doesn't support. With 240 it stays at 6–10.
- `nutrition.initialTdee.fallbackActivityFactor` 1.6 → **1.7**. In FAO/WHO/UNU 2004, 1.6 is "sedentary or light activity" (1.40–1.69). One hour a day of exercise moves a person to about 1.75, and 1.70 is the bottom of the "active" band. The app is for a person training 5+ h a week plus lifting.

## nutrition.protein

**Params:** `{ gPerKg: 1.8, minGPerKg: 1.6, maxGPerKg: 2.2 }`. **Evidence:** consensus.

- **Jäger R, Kerksick CM, Campbell BI, et al. (2017).** ISSN Position Stand: protein and exercise. *J Int Soc Sports Nutr* 14:20. https://doi.org/10.1186/s12970-017-0177-8 (consensus). Says 1.4–2.0 g/kg/day is "sufficient for most exercising individuals".
- **Thomas DT, Erdman KA, Burke LM (2016).** ACSM/AND/DC joint position statement: Nutrition and Athletic Performance. *Med Sci Sports Exerc* 48(3):543-68. https://doi.org/10.1249/MSS.0000000000000852 (consensus; also *J Acad Nutr Diet* 116(3):501-528, doi 10.1016/j.jand.2015.12.006). Gives 1.2–2.0 g/kg/day for athletes.
- **Morton RW, Murphy KT, McKellar SR, et al. (2018).** *Br J Sports Med* 52(6):376-384. https://doi.org/10.1136/bjsports-2017-097608 (meta-analysis; 49 RCTs, 1863 people). Gains in fat-free mass plateau at **1.62 g/kg/day (95% CI 1.03–2.20)**, per the full text in Europe PMC. Supports: the population (healthy adults doing resistance training) matches a typical lifting program.

**Param choice:** 1.6 is Morton's breakpoint; 2.2 is the top of its CI. 1.8 is a choice inside the consensus ranges.

## nutrition.proteinPerMeal

**Params:** `{ gPerKgPerMeal: 0.4, minMeals: 4 }`. **Evidence:** expert.

- **Schoenfeld BJ, Aragon AA (2018).** *J Int Soc Sports Nutr* 15:10. https://doi.org/10.1186/s12970-018-0215-1 (narrative review → expert). The abstract concludes "0.4 g/kg/meal across a minimum of four meals". **Supports** both params.
- **Jäger 2017**, **context**: 0.25 g/kg or 20–40 g per dose, every 3–4 h. It backs even distribution, but not the 0.4 number, so it doesn't raise the label.
- **Areta JL, Burke LM, et al. (2013).** *J Physiol* 591(9):2319-31. https://doi.org/10.1113/jphysiol.2012.244897 (trial, **context**). An acute protein-synthesis study, so the mechanism only.

## nutrition.carbsByLoad

**Params:** tiers `≤30 → 3–5`, `≤75 → 5–7`, `≤240 → 6–10`, else `8–12` g/kg/day, keyed by the day's planned endurance minutes. **Evidence:** consensus.

- **Thomas 2016**, Table "daily needs for fuel and recovery": light (low-intensity or skill-based) 3–5; moderate (~1 h/day) 5–7; high (1–3 h/day of moderate-to-high intensity) 6–10; very high (>4–5 h/day) 8–12 g/kg/day.

**Caveat:** Thomas sets the tiers by load, not exact minutes. The minute cut-offs are the app's mapping (practice). See the 180 → 240 change above.

## nutrition.fatMin

**Params:** `{ pctKcalMin: 20 }`. **Evidence:** consensus. **Thomas 2016:** "Athletes should be discouraged from chronic implementation of fat intakes below 20% of energy intake". Typical intakes are 20–35%.

## nutrition.energyAvailability

**Params:** `{ floorKcalPerKgFfm: 30, targetKcalPerKgFfm: 45, ffmFallbackFraction: 0.85 }`. **Evidence:** consensus.

- **Thomas 2016** (supports). "The concept was first studied in females, where an EA of 45 kcal/kg FFM/d was found to be associated with energy balance and optimal health; meanwhile, a chronic reduction in EA (particularly below 30 kcal/kg FFM/d) was associated with impairments of a variety of body functions."
- **Mountjoy M, Ackerman KE, Bailey DM, et al. (2023).** 2023 IOC consensus statement on REDs. *Br J Sports Med* 57(17):1073-1097. https://doi.org/10.1136/bjsports-2023-106994. **Context.** The abstract covers LEA in women and men and separates "problematic" from "adaptable" LEA. I could **not** open the full text (BMJ and the IOC PDF blocked automated access), so I could not check what it says about the 30/45 numbers. It is not counted as support.
- **Loucks AB, Thuma JR (2003).** *J Clin Endocrinol Metab* 88(1):297-311. https://doi.org/10.1210/jc.2002-020369 (trial, **context**). 29 regularly menstruating, habitually **sedentary young women**, over 5 days. LH pulsatility was unaffected at 30 kcal/kg LBM/day but disrupted below it. This is a mechanism in a different population.
- **Loucks AB, Kiens B, Wright HH (2011).** *J Sports Sci* 29 Suppl 1:S7-15. https://doi.org/10.1080/02640414.2011.588958 (review → expert, **context**).

**Population, stated honestly:** the thresholds come from short lab studies in women. Evidence in men is thinner, and men may tolerate lower EA before harm, so for adult men this floor is cautious rather than proven. `ffmFallbackFraction` 0.85 is practice.

## nutrition.gainRate

**Params:** `{ pctBodyweightPerWeek: 0.5, minPct: 0.25 }`. **Evidence:** practice.

- **Iraki 2019**, as above. Recommends "a target weight gain of ~0.25–0.5% of bodyweight/week for novice/intermediate bodybuilders" (Europe PMC full text). It is **context**, not support, because it is a different population (competitive bodybuilders, not a triathlete who lifts). So the rule is `practice`, which is stricter than labelling it expert. Applying 0.25% outside the gain phase is the owner's decision.

## nutrition.calibration

**Params:** `{ windowDays: 14, minDaysWithData: 10, kcalPerLbChange: 3500, maxWeeklyStepKcal: 150, highConfidenceDays: 21 }`. **Evidence:** practice.

- **Hall KD (2008).** What is the required energy deficit per unit weight loss? *Int J Obes* 32(3):573-6. https://doi.org/10.1038/sj.ijo.0803720 (modelling → trial label, **context**). The 3500 kcal/lb rule roughly fits obese people with >30 kg of fat, but overestimates for leaner people, because more of their weight change is lean tissue with low energy density.
- **Thomas DM, Martin CK, Lettieri S, et al. (2013).** *Int J Obes* 37(12):1611-3. https://doi.org/10.1038/ijo.2013.51 (commentary → expert, **context**). The rule "grossly overestimates" long-term weight loss compared with seven controlled experiments.

**Honest framing:** the 3500 factor is used only to turn a short, smoothed weight trend into kcal/day. That is the adaptive-TDEE-app practice. The estimate will be biased for lean people and during muscle gain, which is part of why each weekly step is capped at 150 kcal. Every number in this rule is practice.

## nutrition.initialTdee

**Params:** `{ whoopDaysMin: 7, whoopWindowDays: 14, fallbackActivityFactor: 1.7, mifflin: { kgCoef: 10, cmCoef: 6.25, ageCoef: 5, maleConst: 5, femaleConst: -161 } }`. **Evidence:** consensus.

- **FAO/WHO/UNU (2004).** *Human energy requirements: Report of a Joint FAO/WHO/UNU Expert Consultation.* FAO Food and Nutrition Technical Report Series No. 1, Rome. https://www.fao.org/4/y5686e/y5686e00.htm (consensus). Table 5.3: sedentary 1.40–1.69, active 1.70–1.99, vigorous 2.00–2.40. Section 5.3.2: an hour a day of moderate-to-vigorous exercise raises PAL from 1.55 to 1.75. Supports the BMR × PAL method and 1.7.
- **Mifflin MD, St Jeor ST, Hill LA, et al. (1990).** *Am J Clin Nutr* 51(2):241-7. https://doi.org/10.1093/ajcn/51.2.241 (trial; 498 adults aged 19–78). The abstract gives REE (men) = 10·kg + 6.25·cm − 5·age + 5, and REE (women) = … − 161.
- **Shcherbina A, et al. (2017).** *J Pers Med* 7(2):3. https://doi.org/10.3390/jpm7020003 (trial, **context**). Across 7 wrist devices, median energy-expenditure error was 27.4%–92.6%. WHOOP was not among them.

**Caveat:** the WHOOP-first order and the 7-day minimum are practice. Task 5 should apply the factor to Mifflin's resting estimate, as the statement says.

## nutrition.dayDistribution

**Params:** `{ maxDailySwingPct: 25 }`. **Evidence:** practice. Thomas 2016 (**context**) says nutrition should be periodized to daily training needs. The 25% cap is practice.

## nutrition.preWorkout

**Params:** `{ minSessionMin: 60, carbsGPerKg: [1, 2], hoursBefore: [1, 3], swimNoHeavyMealMin: 90 }`. **Evidence:** consensus. Thomas 2016's table: "Before exercise >60 min: 1–4 g/kg consumed 1–4 h before exercise". The app uses the lower part of both ranges for training days. The 90-min swim rule is practice.

## nutrition.postWorkout

**Params:** `{ withinHours: 2, carbsGPerKg: 1.0, proteinGPerKg: 0.3 }`. **Evidence:** consensus.
- Thomas 2016: protein of "0.25–0.3 g/kg BW … in the early recovery phase (0 to 2 hours after exercise)".
- Thomas 2016 also gives "speedy refuelling" for <8 h between sessions: "1–1.2 g/kg/h for first 4 h". The single 1 g/kg serving is a simplification (practice, stated in the caveat).
- Jäger 2017 is **context**.

## nutrition.micros

**Params:** four profiles (`male_19_30`, `female_19_30`, `male_31_50`, `female_31_50`). Each maps a micro key (plus `fiber_g`) to `{ value, unit, kind }`, using the units from `src/lib/engine/nutrients.ts`. **Evidence:** consensus.

| Key | Men 19–30 / 31–50 | Women 19–30 / 31–50 | Kind | Source |
|---|---|---|---|---|
| fiber_g | 38 | 25 | AI | IOM 2005 macronutrients (10.17226/10490) |
| calcium_mg | 1000 | 1000 | RDA | IOM 2011 (10.17226/13050); ODS |
| iron_mg | 8 | 18 | RDA | IOM 2001 (10.17226/10026); ODS |
| magnesium_mg | 400 / 420 | 310 / 320 | RDA | IOM 1997 (10.17226/5776); ODS |
| potassium_mg | 3400 | 2600 | AI | NASEM 2019 (10.17226/25353); ODS |
| sodium_mg | 2300 | 2300 | **upper** (CDRR) | NASEM 2019 |
| zinc_mg | 11 | 8 | RDA | IOM 2001; ODS |
| vitamin_a_ug (RAE) | 900 | 700 | RDA | IOM 2001; ODS |
| vitamin_c_mg | 90 | 75 | RDA | IOM 2000 (10.17226/9810); ODS |
| vitamin_d_ug | 15 | 15 | RDA | IOM 2011; ODS |
| vitamin_e_mg | 15 | 15 | RDA | IOM 2000; ODS |
| vitamin_k_ug | 120 | 90 | AI | IOM 2001; ODS |
| vitamin_b12_ug | 2.4 | 2.4 | RDA | IOM 1998 (10.17226/6015); ODS |
| folate_ug (DFE) | 400 | 400 | RDA | IOM 1998; ODS |

**Notes:**
- Sodium's `kind: "upper"` lets the UI say "stay under". The sodium AI is 1500 mg.
- Smokers need 35 mg more vitamin C. People who train hard may need more iron (ODS sports fact sheet). Neither is modelled.
- Health/Cronometer may not report vitamin A as RAE or folate as DFE.

## nutrition.timeline

**Params:** `{ wakeBeforeWindowMin: 45, snackAfterWakeMin: 10 }`. **Evidence:** practice, no citation. Scheduling defaults for Task 8.

## nutrition.exerciseKcal

**Params:** `{ defaultMet: { swim: 5.8, bike: 7.0, run: 7.5, strength: 3.5, lower_leg: 3.0, core: 2.8, mobility: 2.3 }, kcalPerMetKgHour: 1, historyMinWorkouts: 3, historyLookbackDays: 90 }`. **Evidence:** expert.

- **Herrmann SD, Willis EA, Ainsworth BE, et al. (2024).** 2024 Adult Compendium of Physical Activities. *J Sport Health Sci* 13(1):6-12. https://doi.org/10.1016/j.jshs.2023.10.010.
  - Codes checked on pacompendium.com: 18240 swimming laps, freestyle, slow, recreational = 5.8; 01014 bicycling, general = 7.0; 12020 jogging, general, self-selected pace = 7.5; 02054 resistance training, multiple exercises, 8–15 reps = 3.5; 02056 body-weight resistance, general = 3.0; 02024 calisthenics, light (plank, crunches) = 2.8; 02101 stretching, mild = 2.3.
  - Labelled **expert**: it is a curated table of measured averages, not a single trial or meta-analysis.
- Shcherbina 2017, **context** (device error in WHOOP history).

**Use:** kcal/min = MET × weightKg × `kcalPerMetKgHour` / 60. The brief asked for "kcal/min per sport". METs were chosen instead because they scale with bodyweight and have a published source; a fixed kcal/min default would have been unsourced practice. The values are gross METs, which slightly overstate exercise kcal and so raise the energy floor (the safe direction). WHOOP history, when present, is preferred (`historyMinWorkouts`, `historyLookbackDays`: practice).

## hydration.daily

**Params:** `{ totalWaterL: { male: 3.7, female: 2.7 }, beverageShare: 0.8 }`. **Evidence:** consensus.

- **Institute of Medicine (2005).** *Dietary Reference Intakes for Water, Potassium, Sodium, Chloride, and Sulfate.* National Academies Press. https://doi.org/10.17226/10925.
  - The AI for **total water**, which **includes water from food**, is 3.7 L (men) and 2.7 L (women). It is the median intake of adequately hydrated US adults, not a minimum requirement.
  - About 80% comes from drinks and 20% from food. This split is confirmed by secondary summaries of the report (Mayo Clinic; the 2004 LSU AgCenter release). I could not open the report text itself.

The app's drink baseline is `totalWaterL × beverageShare`.

## hydration.exercise

**Params:** `{ maxBodyMassLossPct: 2, defaultLph: 0.6, minLph: 0.4, maxLph: 1.0, minSessionMin: 60 }`. **Evidence:** consensus.

- **ACSM; Sawka MN, Burke LM, Eichner ER, Maughan RJ, Montain SJ, Stachenfeld NS (2007).** Exercise and fluid replacement. *Med Sci Sports Exerc* 39(2):377-90. https://doi.org/10.1249/mss.0b013e31802ca597. The abstract sets the goal of preventing ">2% body weight loss from water deficit" and calls for customized plans using pre/post weights.
- **Thomas 2016:** "The fluid plan that suits most athletes … will typically achieve an intake of 0.4 to 0.8 L/h", citing Sawka 2007. Sweat rates range 0.3–2.4 L/h.
- **Galpin (2023), context.** On the Huberman Lab Guest Series episode "Optimal Nutrition & Supplementation for Fitness" (22 Feb 2023), Galpin gives his equation: bodyweight (lb) / 30 = fl oz every 15–20 min, about 2 mL/kg. https://www.hubermanlab.com/episode/dr-andy-galpin-optimal-nutrition-and-supplementation-for-fitness

**Param choices:**
- 0.6 is the middle of 0.4–0.8.
- `maxLph` 1.0 and `minSessionMin` 60 are practice. `maxLph` caps only the during-session drinking target. The daily target adds the measured sweat loss uncapped (floored at `minLph`), times `replacePctOfLoss`/100, so very heavy sweaters are not under-counted.

## hydration.sweatTest

**Params:** `{ minDurationMin: 20, maxGainLb: 2, litersPerKgLost: 1 }`. **Evidence:** consensus. The method comes from Sawka 2007 (body weight before and after). The 1 kg ≈ 1 L conversion is from Thomas 2016. The 20-min and 2-lb input checks are practice.

## hydration.rehydrate

**Params:** `{ replacePctOfLoss: 125 }`. **Evidence:** consensus.
- **Thomas 2016:** "drinking a volume of fluid that is equivalent to ~125 to 150% of the remaining fluid deficit (e.g., 1.25 to 1.5 L fluid for every 1 kg BW lost)".
- **Galpin 2023** (expert, supports): "about 125%".
- **Shirreffs SM, Taylor AJ, Leiper JB, Maughan RJ (1996).** *Med Sci Sports Exerc* 28(10):1260-71. https://doi.org/10.1097/00005768-199610000-00009 (trial, 12 men, **context**). A drink volume larger than the sweat loss restores balance only if it contains enough sodium.

## supplements.evidence

**Params:** `{ creatine: { gPerDay: [3, 5] }, caffeine: { mgPerKg: [3, 6], minutesBefore: 60 }, vitaminD: { labGuided: true, rdaUg: 15, ulUg: 100 } }`. **Evidence:** consensus.

- **Kreider RB, Kalman DS, Antonio J, et al. (2017).** ISSN position stand on creatine. *J Int Soc Sports Nutr* 14:18. https://doi.org/10.1186/s12970-017-0173-z. Stores "can generally be maintained by ingesting 3–5 g/day". Larger athletes may need 5–10 g/day; the app stays at 3–5.
- **Guest NS, VanDusseldorp TA, Nelson MT, et al. (2021).** ISSN position stand on caffeine. *J Int Soc Sports Nutr* 18(1):1. https://doi.org/10.1186/s12970-020-00383-4. Effective at "3–6 mg/kg"; "the most commonly used timing … is 60 min pre-exercise".
- **NIH ODS, Vitamin D fact sheet**, and **IOM 2011**. The RDA is 15 µg (600 IU) for ages 19–70. The UL is 100 µg (4000 IU) from all sources, and does not apply under physician treatment. `labGuided: true` is practice: the app does not dose vitamin D; it says to test and ask a doctor.
- **Galpin 2023** (expert): creatine 3–5 g/day.

The caveat carries the "talk to your doctor or a registered dietitian" line, per the global constraints.

## Bryan Johnson

Not cited in these rules. None of the nutrition or hydration numbers depend on his protocol, and adding him as decoration would add nothing.

## Could not verify (left out or labelled context)

- **IOC REDs 2023 full text.** bjsm.bmj.com returned 403, and the IOC PDF timed out or reset. The abstract and metadata are verified. Whether it endorses 30/45 kcal/kg FFM is **not** verified, so it is context only.
- **Shirreffs & Sawka 2011** (*J Sports Sci* 29 Suppl 1:S39-46, doi 10.1080/02640414.2011.614269). The metadata is verified, but the abstract gives no replacement percentage and the full text was not accessible. **Not cited.**
- **NIH ODS fact-sheet pages.** Direct fetches were blocked (403/bot check). The values in the micros table were confirmed through search-engine readings of those ODS pages (Magnesium, Potassium, Vitamin K, Iron, Vitamin D, Zinc, Calcium, Vitamin A, Vitamin C, Vitamin E, B12, Folate). They match the National Academies values I know. The NCBI Bookshelf DRI tables were behind a reCAPTCHA, which I did not attempt.
- **IOM 2005 water report text**, for the 80/20 drinks/food split. Confirmed only through secondary summaries.
- **Apple Shortcuts "Find Health Samples" type names** in `nutrients.ts`. Apple publishes no list, so they are best-known Health app display names. Check them in the Shortcuts picker (Task 4).
