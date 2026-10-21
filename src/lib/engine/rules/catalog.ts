/**
 * The rules catalog. Every number the engine uses comes from a rule's `params`.
 * Each citation was checked against PubMed / the publisher; see docs/rules-sources.md
 * for what each source says, why each param was chosen, and the caveats.
 */
import type { Citation, DeepReadonly, Rule } from "./types";

/** Mark a shared source as context for one rule (not counted toward `evidence`). */
const ctx = (c: Citation): Citation => ({ ...c, role: "context" });

// ---------------------------------------------------------------------------
// Sources (shared between rules)
// ---------------------------------------------------------------------------

const BOSQUET_2007: Citation = {
  authors: "Bosquet L, Montpetit J, Arvisais D, Mujika I",
  year: 2007,
  title: "Effects of tapering on performance: a meta-analysis",
  venue: "Med Sci Sports Exerc 39(8):1358-65",
  url: "https://doi.org/10.1249/mss.0b013e31806010e0",
  doi: "10.1249/mss.0b013e31806010e0",
  evidence: "meta-analysis",
};

const MUJIKA_PADILLA_2003: Citation = {
  authors: "Mujika I, Padilla S",
  year: 2003,
  title: "Scientific bases for precompetition tapering strategies",
  venue: "Med Sci Sports Exerc 35(7):1182-7",
  url: "https://doi.org/10.1249/01.MSS.0000074448.73931.11",
  doi: "10.1249/01.MSS.0000074448.73931.11",
  evidence: "expert",
};

const BOMPA_2019: Citation = {
  authors: "Bompa TO, Buzzichelli CA",
  year: 2019,
  title: "Periodization: Theory and Methodology of Training (6th ed.)",
  venue: "Human Kinetics (book)",
  url: "https://us.humankinetics.com/products/periodization-6th-edition",
  evidence: "expert",
};

const GABBETT_2016: Citation = {
  authors: "Gabbett TJ",
  year: 2016,
  title: "The training-injury prevention paradox: should athletes be training smarter and harder?",
  venue: "Br J Sports Med 50(5):273-80",
  url: "https://doi.org/10.1136/bjsports-2015-095788",
  doi: "10.1136/bjsports-2015-095788",
  evidence: "expert",
};

const IMPELLIZZERI_2020: Citation = {
  authors: "Impellizzeri FM, Tenan MS, Kempton T, Novak A, Coutts AJ",
  year: 2020,
  title: "Acute:Chronic Workload Ratio: Conceptual Issues and Fundamental Pitfalls",
  venue: "Int J Sports Physiol Perform 15(6):907-913",
  url: "https://doi.org/10.1123/ijspp.2019-0864",
  doi: "10.1123/ijspp.2019-0864",
  evidence: "expert",
};

const KIVINIEMI_2007: Citation = {
  authors: "Kiviniemi AM, Hautala AJ, Kinnunen H, Tulppo MP",
  year: 2007,
  title: "Endurance training guided individually by daily heart rate variability measurements",
  venue: "Eur J Appl Physiol 101(6):743-51",
  url: "https://doi.org/10.1007/s00421-007-0552-2",
  doi: "10.1007/s00421-007-0552-2",
  evidence: "trial",
};

const JAVALOYES_2019: Citation = {
  authors: "Javaloyes A, Sarabia JM, Lamberts RP, Moya-Ramon M",
  year: 2019,
  title: "Training Prescription Guided by Heart-Rate Variability in Cycling",
  venue: "Int J Sports Physiol Perform 14(1):23-32",
  url: "https://doi.org/10.1123/ijspp.2018-0122",
  doi: "10.1123/ijspp.2018-0122",
  evidence: "trial",
};

const GRANERO_GALLEGOS_2020: Citation = {
  authors: "Granero-Gallegos A, González-Quílez A, Plews D, Carrasco-Poyatos M",
  year: 2020,
  title: "HRV-Based Training for Improving VO2max in Endurance Athletes. A Systematic Review with Meta-Analysis",
  venue: "Int J Environ Res Public Health 17(21):7999",
  url: "https://doi.org/10.3390/ijerph17217999",
  doi: "10.3390/ijerph17217999",
  evidence: "meta-analysis",
};

const PLEWS_2012: Citation = {
  authors: "Plews DJ, Laursen PB, Kilding AE, Buchheit M",
  year: 2012,
  title:
    "Heart rate variability in elite triathletes, is variation in variability the key to effective training? A case comparison",
  venue: "Eur J Appl Physiol 112(11):3729-41",
  url: "https://doi.org/10.1007/s00421-012-2354-4",
  doi: "10.1007/s00421-012-2354-4",
  evidence: "trial",
};

const PLEWS_2013: Citation = {
  authors: "Plews DJ, Laursen PB, Stanley J, Kilding AE, Buchheit M",
  year: 2013,
  title: "Training adaptation and heart rate variability in elite endurance athletes: opening the door to effective monitoring",
  venue: "Sports Med 43(9):773-81",
  url: "https://doi.org/10.1007/s40279-013-0071-8",
  doi: "10.1007/s40279-013-0071-8",
  evidence: "expert",
};

const BUCHHEIT_2014: Citation = {
  authors: "Buchheit M",
  year: 2014,
  title: "Monitoring training status with HR measures: do all roads lead to Rome?",
  venue: "Front Physiol 5:73",
  url: "https://doi.org/10.3389/fphys.2014.00073",
  doi: "10.3389/fphys.2014.00073",
  evidence: "expert",
};

const GROSICKI_2026: Citation = {
  authors:
    "Grosicki GJ, Carter JR, Laursen PB, Plews DJ, Altini M, Galpin AJ, Fielding F, Hippel WV, Chapman C, Jasinski SR, Beattie UK, Holmes KE",
  year: 2026,
  title:
    "Heart rate variability coefficient of variation during sleep as a digital biomarker that reflects behavior and varies by age and sex",
  venue: "Am J Physiol Heart Circ Physiol 330(1):H187-H199",
  url: "https://doi.org/10.1152/ajpheart.00738.2025",
  doi: "10.1152/ajpheart.00738.2025",
  evidence: "trial",
};

const GALPIN_RECOVERY_2023: Citation = {
  authors: "Galpin A (guest), Huberman A (host)",
  year: 2023,
  title: "Guest Series | Dr. Andy Galpin: Maximize Recovery to Achieve Fitness & Performance Goals",
  venue: "Huberman Lab podcast (episode page and transcript)",
  url: "https://www.hubermanlab.com/episode/guest-series-dr-andy-galpin-maximize-recovery-to-achieve-fitness-and-performance-goals",
  evidence: "expert",
};

const GALPIN_STRENGTH_2023: Citation = {
  authors: "Galpin A (guest), Huberman A (host)",
  year: 2023,
  title: "Guest Series | Dr. Andy Galpin: Optimal Protocols to Build Strength & Grow Muscles",
  venue: "Huberman Lab podcast (episode page and transcript)",
  url: "https://www.hubermanlab.com/episode/dr-andy-galpin-optimal-protocols-to-build-strength-and-grow-muscles",
  evidence: "expert",
};

const ACSM_2009: Citation = {
  authors: "American College of Sports Medicine (Ratamess NA et al., writing group)",
  year: 2009,
  title: "American College of Sports Medicine position stand. Progression models in resistance training for healthy adults",
  venue: "Med Sci Sports Exerc 41(3):687-708",
  url: "https://doi.org/10.1249/MSS.0b013e3181915670",
  doi: "10.1249/MSS.0b013e3181915670",
  evidence: "consensus",
};

const ACSM_2026: Citation = {
  authors:
    "Currier BS, D'Souza AC, Singh MAF, Lowisz CV, Rawson ES, Schoenfeld BJ, Smith-Ryan AE, Steen JP, Thomas GA, Triplett NT, Washington TA, Werner TJ, Phillips SM",
  year: 2026,
  title:
    "American College of Sports Medicine Position Stand. Resistance Training Prescription for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults: An Overview of Reviews",
  venue: "Med Sci Sports Exerc 58(4):851-872",
  url: "https://doi.org/10.1249/MSS.0000000000003897",
  doi: "10.1249/MSS.0000000000003897",
  evidence: "consensus",
};

const WHOOP_101: Citation = {
  authors: "WHOOP, Inc.",
  year: 2026,
  title: "WHOOP 101 (Recovery: green 67-100%, yellow 34-66%, red 0-33%)",
  venue: "WHOOP Developer Platform documentation (accessed 2026-10-21)",
  url: "https://developer.whoop.com/docs/whoop-101",
  evidence: "practice",
};

const WHOOP_ZONES: Citation = {
  authors: "WHOOP, Inc.",
  year: 2026,
  title: "Max Heart Rate Training Zones",
  venue: "WHOOP The Locker (accessed 2026-10-21)",
  url: "https://www.whoop.com/thelocker/max-heart-rate-training-zones/",
  evidence: "practice",
};

// ---------------------------------------------------------------------------
// Param types
// ---------------------------------------------------------------------------

type Range = readonly [number, number];

type SeasonPhasesParams = { taperWeeks: number; peakWeeks: number; buildWeeks: number; taperVolumeFactor: number };
type GainPhaseParams = { maxWeeks: number };
type RecoveryWeekParams = { every: number; volumeFactor: number };
type EnduranceVolumeParams = {
  startHours: number;
  peakHours: number;
  maxWeeklyIncreasePct: number;
  reentryBelowFraction: number;
};
type RunVolumeParams = {
  startMinPerWeek: number;
  maxWeeklyIncreasePct: number;
  absoluteCapWeeklyIncreasePct: number;
  reentryBelowFraction: number;
  walkRunWeeks: number;
  longRunMaxIncreasePct: number;
  longRunLookbackDays: number;
};
type SplitParams = { swim: number; bike: number; run: number; earlyRunShare: number; earlyWeeks: number };
type LoadCheckParams = { overPct: number; weeks: number; trailingWeeks: number };
type DistributionParams = { lowShare: number };
type ZonesParams = { z1: Range; z2: Range; z3: Range; z4: Range; z5: Range };
type ColorParams = { green: number; yellow: number };
type YellowScaleParams = { durationFactor: number; dropHighIntensity: boolean };
type RedSwapParams = { swapTo: "z1_or_mobility"; maxMin: number };
type HrvTrendParams = {
  rollingDays: number;
  baselineMinDays: number;
  baselineMaxDays: number;
  swcSd: number;
  minNightsInWindow: number;
};
type RhrTrendParams = { rollingDays: number; elevatedBpm: number };
type LowStreakParams = { days: number; action: "rest_or_deload"; volumeFactor: number };
type SleepDebtParams = { windowDays: number; debtMin: number };
type GreenStreakParams = { days: number };
type StrengthVolumeParams = { setsPerMusclePerWeek: Range };
type StrengthFrequencyParams = { perMusclePerWeek: number };
type RepRangeParams = { min: number; max: number; rirTarget: Range };
type ProgressionParams = { addLbUpper: number; addLbLower: number; whenAllSetsAtMax: boolean };
type StrengthTaperParams = { volumeFactor: number };
type StrengthTemplateParams = {
  indirectSetCredit: number;
  maxSetsPerSession: number;
  core: { sets: number; reps: Range; holdSeconds: Range };
  lowerLegRepRange: Range;
  plyo: { sets: number; reps: number };
};
type SpacingParams = { minHoursBetweenHardCardioAndLift: number; noLowerDayWithinHoursBeforeKeyRun: number };
type PainMonitoringParams = { maxDuring: number; risingSessions: number; holdUntilBelowDays: number };
type JointStatusParams = {
  caution: { plyo: boolean; runIncreaseFactor: number };
  restricted: { run: boolean; plyo: boolean };
};
type LowerLegParams = { sessionsPerWeek: number; tibialisSets: number; soleusSets: number; gastrocSets: number };
type WeekTemplateParams = {
  sessionsPerWeek: { swim: Range; bike: Range; run: Range };
  typicalSessionMin: { swim: number; bike: number; run: number };
  longShare: number;
  qualityMinMin: number;
  minWarmUpMin: number;
  minCoolDownMin: number;
  maxHardShareOfSession: number;
  strengthMin: number;
  lowerLegMin: number;
  coreMin: number;
  coreSessionsPerWeek: number;
  walkRun: { startRunMin: number; walkMin: number; stepRunMin: number; everyWeeks: number };
  strides: { reps: number; seconds: number };
};

function rule<P>(r: Rule<P>): Rule<P> {
  return r;
}

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export const RULES = deepFreeze({
  // ----- season -------------------------------------------------------------
  "season.phases": rule<SeasonPhasesParams>({
    id: "season.phases",
    area: "season",
    statement:
      "Count back from race day: 2 taper weeks, 4 peak weeks, 12 build weeks; everything before is base. Taper cuts volume to about half and keeps intensity.",
    why: "A 2-week taper that halves volume but keeps intensity gives the best race-day boost in pooled studies.",
    params: { taperWeeks: 2, peakWeeks: 4, buildWeeks: 12, taperVolumeFactor: 0.5 },
    evidence: "meta-analysis",
    citations: [BOSQUET_2007, MUJIKA_PADILLA_2003, BOMPA_2019],
    caveat:
      "Only the taper (length and ~41-60% volume cut) is backed by a meta-analysis. Peak and build lengths are standard periodization practice, not tested values.",
  }),

  "season.gainPhase": rule<GainPhaseParams>({
    id: "season.gainPhase",
    area: "season",
    statement:
      "The muscle-gain phase runs from season start for at most 26 weeks and always ends before the build phase starts.",
    why: "Gain muscle while endurance volume is still low; stop before the hard endurance build begins.",
    params: { maxWeeks: 26 },
    evidence: "practice",
    citations: [
      {
        authors: "Iraki J, Fitschen P, Espinar S, Helms E",
        year: 2019,
        title: "Nutrition Recommendations for Bodybuilders in the Off-Season: A Narrative Review",
        venue: "Sports (Basel) 7(7):154",
        url: "https://doi.org/10.3390/sports7070154",
        doi: "10.3390/sports7070154",
        evidence: "expert",
        role: "context",
      },
    ],
    caveat:
      "Iraki et al. support a slow gain (~0.25-0.5% bodyweight/week) in an off-season, but give no phase length (context only). The 26 weeks is practice: the spec's owner ruling (months 1-6).",
  }),

  "season.recoveryWeek": rule<RecoveryWeekParams>({
    id: "season.recoveryWeek",
    area: "season",
    statement: "Every 4th week (never in taper) is a recovery week at 70% of the surrounding volume, with no hard sessions.",
    why: "A lighter week every month lets fatigue clear so the next block can build. Common practice, lightly studied.",
    params: { every: 4, volumeFactor: 0.7 },
    evidence: "expert",
    citations: [
      BOMPA_2019,
      {
        authors: "Bell L, Strafford BW, Coleman M, Androulakis Korakakis P, Nolan D",
        year: 2023,
        title: "Integrating Deloading into Strength and Physique Sports Training Programmes: An International Delphi Consensus Approach",
        venue: "Sports Med Open 9(1):87",
        url: "https://doi.org/10.1186/s40798-023-00633-0",
        doi: "10.1186/s40798-023-00633-0",
        evidence: "expert",
        role: "context",
      },
    ],
    caveat:
      "The 4-week cycle and 70% are practice. Bell 2023 is strength coaches' opinion (context). No trial tests a 3:1 endurance pattern. One RT trial (Coleman 2024) found a full week off mid-program did not help muscle growth and slightly reduced strength gains.",
  }),

  // ----- volume -------------------------------------------------------------
  "volume.endurance": rule<EnduranceVolumeParams>({
    id: "volume.endurance",
    area: "volume",
    statement:
      "Swim+bike+run hours start at 5 h/week and build toward 11 h/week at peak, rising at most 10% over the previous week's actual hours. After a missed week (under 50% of the starting volume), restart at the starting volume.",
    why: "Amateur half-Ironman finishers train in this range; small weekly steps avoid sudden load spikes.",
    params: { startHours: 5, peakHours: 11, maxWeeklyIncreasePct: 10, reentryBelowFraction: 0.5 },
    evidence: "trial",
    citations: [
      {
        authors: "Lalonde F, Martin SM, Boucher VG, Gosselin M, Roch M, Comtois AS",
        year: 2020,
        title: "Preparation for an Half-Ironman Triathlon amongst Amateur Athletes: Finishing Rate and Physiological Adaptation",
        venue: "Int J Exerc Sci 13(6):766-777",
        url: "https://pubmed.ncbi.nlm.nih.gov/32509136/",
        doi: "10.70252/OWPW6610",
        evidence: "trial",
      },
      {
        authors: "Gilinsky N, Hawkins KR, Tokar TN, Cooper JA",
        year: 2014,
        title: "Predictive variables for half-Ironman triathlon performance",
        venue: "J Sci Med Sport 17(3):300-5",
        url: "https://doi.org/10.1016/j.jsams.2013.04.014",
        doi: "10.1016/j.jsams.2013.04.014",
        evidence: "trial",
      },
      ctx(GABBETT_2016),
    ],
    caveat:
      "The hours come from what amateur half-Ironman athletes actually did, not a dose trial. The 10% weekly cap is conservative practice; no study shows 10% beats other rates. The 50% missed-week threshold for restarting at the starting volume is practice too, not a studied value.",
  }),

  "volume.run": rule<RunVolumeParams>({
    id: "volume.run",
    area: "volume",
    statement:
      "Running starts at 45 min/week as walk-run for the first 8 weeks. Weekly run minutes rise at most 10% over last week's actual, never more than 30%. After a missed week (under 50% of the starting minutes), restart at the starting minutes. When you have run in the past 30 days, no single run is more than 10% longer than the longest of those runs.",
    why: "Novice runners who raised weekly distance >30% had more overuse injuries. 10% is a cautious margin, not proven.",
    params: {
      startMinPerWeek: 45,
      maxWeeklyIncreasePct: 10,
      absoluteCapWeeklyIncreasePct: 30,
      reentryBelowFraction: 0.5,
      walkRunWeeks: 8,
      longRunMaxIncreasePct: 10,
      longRunLookbackDays: 30,
    },
    evidence: "trial",
    citations: [
      {
        authors: "Nielsen RØ, Parner ET, Nohr EA, Sørensen H, Lind M, Rasmussen S",
        year: 2014,
        title:
          "Excessive progression in weekly running distance and risk of running-related injuries: an association which varies according to type of injury",
        venue: "J Orthop Sports Phys Ther 44(10):739-47",
        url: "https://doi.org/10.2519/jospt.2014.5164",
        doi: "10.2519/jospt.2014.5164",
        evidence: "trial",
      },
      {
        authors: "Buist I, Bredeweg SW, van Mechelen W, Lemmink KA, Pepping GJ, Diercks RL",
        year: 2008,
        title:
          "No effect of a graded training program on the number of running-related injuries in novice runners: a randomized controlled trial",
        venue: "Am J Sports Med 36(1):33-9",
        url: "https://doi.org/10.1177/0363546507307505",
        doi: "10.1177/0363546507307505",
        evidence: "trial",
        role: "context",
      },
      {
        authors: "Schuster Brandt Frandsen J, Hulme A, Parner ET, Møller M, et al. (Nielsen RO senior author)",
        year: 2025,
        title: "How much running is too much? Identifying high-risk running sessions in a 5200-person cohort study",
        venue: "Br J Sports Med 59(17):1203-1210",
        url: "https://doi.org/10.1136/bjsports-2024-109380",
        doi: "10.1136/bjsports-2024-109380",
        evidence: "trial",
      },
    ],
    caveat:
      "The weekly 10% is practice: an RCT (Buist 2008, context) found no injury benefit and Frandsen 2025 found no link with the week-to-week ratio. The 30% cap (Nielsen) and the single-run cap (Frandsen) are cohort findings. The 50% missed-week threshold for restarting at the starting minutes is practice, not a studied value.",
  }),

  "volume.split": rule<SplitParams>({
    id: "volume.split",
    area: "volume",
    statement:
      "Endurance hours split 25% swim, 45% bike, 30% run. For the first 8 weeks run is capped at 20%, with the rest going to swim and bike.",
    why: "Bike is the longest leg of a half-Ironman; low-impact swim and bike carry more load while running is new.",
    params: { swim: 0.25, bike: 0.45, run: 0.3, earlyRunShare: 0.2, earlyWeeks: 8 },
    evidence: "practice",
    citations: [],
    caveat: "Coaching convention, not a studied ratio. Run minutes are still limited by volume.run caps, whichever is lower.",
  }),

  "volume.loadCheck": rule<LoadCheckParams>({
    id: "volume.loadCheck",
    area: "volume",
    statement:
      "If weekly strain ÷ its trailing 4-week average is above 1.2 for 2 weeks in a row, next week holds at last week's actual instead of increasing.",
    why: "Two weeks well above your recent normal is a sign to hold steady before adding more.",
    params: { overPct: 20, weeks: 2, trailingWeeks: 4 },
    evidence: "practice",
    citations: [ctx(GABBETT_2016), ctx(IMPELLIZZERI_2020)],
    caveat:
      "The acute:chronic workload ratio is contested: Impellizzeri 2020 argues it has no causal evidence and statistical flaws. The 1.2 / 2-week / 4-week values are practice, used only as a gentle hold, never to push load up.",
  }),

  // ----- intensity ----------------------------------------------------------
  "intensity.distribution": rule<DistributionParams>({
    id: "intensity.distribution",
    area: "intensity",
    statement: "About 80% of endurance training time is easy (Z1 or Z2); the rest is moderate or hard.",
    why: "Successful endurance athletes do most training easy; pooled trials show mostly-easy plans work at least as well.",
    params: { lowShare: 0.8 },
    evidence: "meta-analysis",
    citations: [
      {
        authors: "Seiler S",
        year: 2010,
        title: "What is best practice for training intensity and duration distribution in endurance athletes?",
        venue: "Int J Sports Physiol Perform 5(3):276-91",
        url: "https://doi.org/10.1123/ijspp.5.3.276",
        doi: "10.1123/ijspp.5.3.276",
        evidence: "expert",
        role: "context",
      },
      {
        authors: "Stöggl T, Sperlich B",
        year: 2014,
        title: "Polarized training has greater impact on key endurance variables than threshold, high intensity, or high volume training",
        venue: "Front Physiol 5:33",
        url: "https://doi.org/10.3389/fphys.2014.00033",
        doi: "10.3389/fphys.2014.00033",
        evidence: "trial",
      },
      {
        authors: "Silva Oliveira P, Boppre G, Fonseca H",
        year: 2024,
        title:
          "Comparison of Polarized Versus Other Types of Endurance Training Intensity Distribution on Athletes' Endurance Performance: A Systematic Review with Meta-analysis",
        venue: "Sports Med 54(8):2071-2095",
        url: "https://doi.org/10.1007/s40279-024-02034-z",
        doi: "10.1007/s40279-024-02034-z",
        evidence: "meta-analysis",
      },
      {
        authors: "Rosenblat MA, Watt JA, Arnold JI, Treff G, et al. (Seiler S senior author)",
        year: 2025,
        title:
          "Which Training Intensity Distribution Intervention will Produce the Greatest Improvements in Maximal Oxygen Uptake and Time-Trial Performance in Endurance Athletes? A Systematic Review and Network Meta-analysis of Individual Participant Data",
        venue: "Sports Med 55(3):655-673",
        url: "https://doi.org/10.1007/s40279-024-02149-3",
        doi: "10.1007/s40279-024-02149-3",
        evidence: "meta-analysis",
      },
    ],
    caveat:
      "Seiler's ~80/20 counts sessions in elite athletes; here it is applied to time. Meta-analyses show polarized and pyramidal plans perform similarly; recreational athletes may do slightly better with pyramidal. Both are mostly easy.",
  }),

  "intensity.zones": rule<ZonesParams>({
    id: "intensity.zones",
    area: "intensity",
    statement: "Heart-rate zones as a share of max HR: Z1 50-60%, Z2 60-70%, Z3 70-80%, Z4 80-90%, Z5 90-100%.",
    why: "These match the zones your WHOOP shows, so the plan and your strap speak the same language.",
    params: { z1: [0.5, 0.6], z2: [0.6, 0.7], z3: [0.7, 0.8], z4: [0.8, 0.9], z5: [0.9, 1.0] },
    evidence: "practice",
    citations: [WHOOP_ZONES],
    caveat:
      "A product convention, not a study. ACSM (Garber 2011) uses different bands (moderate 64-76%, vigorous 77-95% of max HR). Some WHOOP pages say zones use heart-rate reserve.",
  }),

  // ----- recovery -----------------------------------------------------------
  "recovery.color": rule<ColorParams>({
    id: "recovery.color",
    area: "recovery",
    statement: "WHOOP recovery ≥67 is green, 34-66 is yellow, ≤33 is red.",
    why: "These are WHOOP's own recovery bands.",
    params: { green: 67, yellow: 34 },
    evidence: "practice",
    citations: [WHOOP_101],
    caveat: "WHOOP's recovery score is a proprietary composite (HRV, resting HR, sleep, respiratory rate); its bands are not validated thresholds.",
  }),

  "recovery.yellowScale": rule<YellowScaleParams>({
    id: "recovery.yellowScale",
    area: "recovery",
    statement: "On a yellow day, keep the session but cut its duration to 80% and replace any hard work with easy aerobic work.",
    why: "Easing off on lower-readiness days, as HRV-guided plans do, gave equal or slightly better fitness gains.",
    params: { durationFactor: 0.8, dropHighIntensity: true },
    evidence: "meta-analysis",
    citations: [GRANERO_GALLEGOS_2020, KIVINIEMI_2007, JAVALOYES_2019],
    caveat:
      "Studies used raw HRV vs. a personal baseline, not WHOOP's composite score. Dropping intensity is from the studies; the 80% duration cut is practice.",
  }),

  "recovery.redSwap": rule<RedSwapParams>({
    id: "recovery.redSwap",
    area: "recovery",
    statement: "On a red day, swap the session for easy zone 1 or mobility, at most 40 minutes.",
    why: "In HRV-guided training, a clear drop meant easy work or rest that day; those athletes still improved.",
    params: { swapTo: "z1_or_mobility", maxMin: 40 },
    evidence: "trial",
    citations: [KIVINIEMI_2007, PLEWS_2013],
    caveat: "Kiviniemi's sessions were 40 min and used raw HRV, not WHOOP recovery. Pain and joint rules still apply first.",
  }),

  "recovery.hrvTrend": rule<HrvTrendParams>({
    id: "recovery.hrvTrend",
    area: "recovery",
    statement:
      "Compare the 7-day rolling mean of ln rMSSD with a 30-60 day personal baseline. Below baseline by more than 0.5 SD counts as a low trend. Needs ≥5 of 7 nights.",
    why: "A week's average HRV is more reliable than one night. Compare it with your own normal, not anyone else's.",
    params: { rollingDays: 7, baselineMinDays: 30, baselineMaxDays: 60, swcSd: 0.5, minNightsInWindow: 5 },
    evidence: "trial",
    citations: [PLEWS_2012, PLEWS_2013, JAVALOYES_2019, BUCHHEIT_2014, ctx(GROSICKI_2026), GALPIN_RECOVERY_2023],
    caveat:
      "The 0.5 SD band follows Le Meur 2013 (as described by Buchheit 2014); Plews used 1×CV, and no fraction is proven. The ≥5 of 7 nights rule is Grosicki's finding for HRV-CV, conservatively extrapolated to the mean.",
  }),

  "recovery.rhrTrend": rule<RhrTrendParams>({
    id: "recovery.rhrTrend",
    area: "recovery",
    statement: "If the 7-day average resting HR is 5+ bpm above baseline, treat it as a fatigue signal alongside HRV.",
    why: "A resting heart rate that stays higher than usual for a week can signal fatigue or illness.",
    params: { rollingDays: 7, elevatedBpm: 5 },
    evidence: "expert",
    citations: [BUCHHEIT_2014],
    caveat:
      "Buchheit puts single-day resting HR noise near 10%, so only a weekly average is used. The 5 bpm threshold is a practical choice, not a tested cut-off.",
  }),

  "recovery.lowStreak": rule<LowStreakParams>({
    id: "recovery.lowStreak",
    area: "recovery",
    statement: "3+ red recovery days in a row: each day the streak lasts, cut that day's endurance sessions to 60%, or take a rest day instead.",
    why: "One bad day is noise; several in a row suggests you need to back off until you rebound.",
    params: { days: 3, action: "rest_or_deload", volumeFactor: 0.6 },
    evidence: "expert",
    citations: [PLEWS_2013, GALPIN_RECOVERY_2023],
    caveat:
      "Galpin waits until a decline lasts more than seven days, then cuts to ~50%. The 3-day trigger and 60% are practice (spec §7), more cautious than that.",
  }),

  "recovery.sleepDebt": rule<SleepDebtParams>({
    id: "recovery.sleepDebt",
    area: "recovery",
    statement:
      "If sleep falls 90+ min short of need over 3 days, move hard sessions later in the week and suggest an earlier, consistent bedtime.",
    why: "Short or irregular sleep hurts training and recovery. Make it up with a steady, earlier bedtime.",
    params: { windowDays: 3, debtMin: 90 },
    evidence: "consensus",
    citations: [
      {
        authors: "Walsh NP, Halson SL, Sargent C, Roach GD, et al.",
        year: 2021,
        title: "Sleep and the athlete: narrative review and 2021 expert consensus recommendations",
        venue: "Br J Sports Med 55(7):356-368",
        url: "https://doi.org/10.1136/bjsports-2020-102025",
        doi: "10.1136/bjsports-2020-102025",
        evidence: "consensus",
      },
      {
        authors: "Watson NF, Badr MS, Belenky G, Bliwise DL, et al.",
        year: 2015,
        title:
          "Recommended Amount of Sleep for a Healthy Adult: A Joint Consensus Statement of the American Academy of Sleep Medicine and Sleep Research Society",
        venue: "Sleep 38(6):843-4",
        url: "https://doi.org/10.5665/sleep.4716",
        doi: "10.5665/sleep.4716",
        evidence: "consensus",
        role: "context",
      },
      {
        authors: "Fullagar HH, Skorski S, Duffield R, Hammes D, Coutts AJ, Meyer T",
        year: 2015,
        title:
          "Sleep and athletic performance: the effects of sleep loss on exercise performance, and physiological and cognitive responses to exercise",
        venue: "Sports Med 45(2):161-86",
        url: "https://doi.org/10.1007/s40279-014-0260-0",
        doi: "10.1007/s40279-014-0260-0",
        evidence: "expert",
      },
      {
        authors: "Watson AM",
        year: 2017,
        title: "Sleep and Athletic Performance",
        venue: "Curr Sports Med Rep 16(6):413-418",
        url: "https://doi.org/10.1249/JSR.0000000000000418",
        doi: "10.1249/JSR.0000000000000418",
        evidence: "expert",
      },
      {
        authors: "Windred DP, Burns AC, Lane JM, Saxena R, Rutter MK, Cain SW, Phillips AJK",
        year: 2024,
        title: "Sleep regularity is a stronger predictor of mortality risk than sleep duration: A prospective cohort study",
        venue: "Sleep 47(1):zsad253",
        url: "https://doi.org/10.1093/sleep/zsad253",
        doi: "10.1093/sleep/zsad253",
        evidence: "trial",
        role: "context",
      },
      {
        authors: "Bryan Johnson",
        year: 2026,
        title: "Blueprint protocol: sleep (fixed bedtime, 60-min wind-down)",
        venue: "protocol.bryanjohnson.com (self-experiment, accessed 2026-10-21)",
        url: "https://protocol.bryanjohnson.com",
        evidence: "n-of-1",
        role: "context",
      },
    ],
    caveat:
      "The athlete consensus (Walsh) backs protecting sleep; the 90 min / 3 day trigger is practice. Walsh notes effects of 1-3 short nights on performance are unclear.",
  }),

  "recovery.greenStreak": rule<GreenStreakParams>({
    id: "recovery.greenStreak",
    area: "recovery",
    statement: "3 green days in a row allow the next planned progression only, never past a ramp cap or a pain hold.",
    why: "A good run of days lets the plan move on as scheduled, but never faster than the safety caps.",
    params: { days: 3 },
    evidence: "practice",
    citations: [],
    caveat: "Spec §7 design choice; no study tests green streaks as a progression trigger.",
  }),

  // ----- strength -----------------------------------------------------------
  "strength.volume": rule<StrengthVolumeParams>({
    id: "strength.volume",
    area: "strength",
    statement: "Aim for 10-14 hard sets per muscle group per week.",
    why: "10+ weekly sets per muscle reliably builds more muscle; the low end leaves energy for endurance training.",
    params: { setsPerMusclePerWeek: [10, 14] },
    evidence: "consensus",
    citations: [
      ACSM_2026,
      {
        authors: "Schoenfeld BJ, Ogborn D, Krieger JW",
        year: 2017,
        title:
          "Dose-response relationship between weekly resistance training volume and increases in muscle mass: A systematic review and meta-analysis",
        venue: "J Sports Sci 35(11):1073-1082",
        url: "https://doi.org/10.1080/02640414.2016.1210197",
        doi: "10.1080/02640414.2016.1210197",
        evidence: "meta-analysis",
      },
      {
        authors: "Pelland JC, Remmert JF, Robinson ZP, Hinson SR, Zourdos MC",
        year: 2026,
        title:
          "The Resistance Training Dose Response: Meta-Regressions Exploring the Effects of Weekly Volume and Frequency on Muscle Hypertrophy and Strength Gains",
        venue: "Sports Med 56(2):481-505",
        url: "https://doi.org/10.1007/s40279-025-02344-w",
        doi: "10.1007/s40279-025-02344-w",
        evidence: "meta-analysis",
      },
      GALPIN_STRENGTH_2023,
    ],
    caveat:
      "More volume keeps helping with diminishing returns (Galpin suggests 15-20 for intermediates). 10-14 is chosen to limit fatigue alongside endurance work. Legs get fewer than 10 direct weekly sets by design: one main lower day, because endurance training already loads the legs (the owner-approved direction). Helper-muscle credit is set in strength.template.",
  }),

  "strength.frequency": rule<StrengthFrequencyParams>({
    id: "strength.frequency",
    area: "strength",
    statement: "Train each muscle group at least twice a week.",
    why: "Twice a week per muscle beats once a week for growth and helps strength; it also spreads the weekly sets.",
    params: { perMusclePerWeek: 2 },
    evidence: "consensus",
    citations: [
      ACSM_2026,
      {
        authors: "Schoenfeld BJ, Ogborn D, Krieger JW",
        year: 2016,
        title: "Effects of Resistance Training Frequency on Measures of Muscle Hypertrophy: A Systematic Review and Meta-Analysis",
        venue: "Sports Med 46(11):1689-1697",
        url: "https://doi.org/10.1007/s40279-016-0543-8",
        doi: "10.1007/s40279-016-0543-8",
        evidence: "meta-analysis",
      },
      {
        authors: "Schoenfeld BJ, Grgic J, Krieger J",
        year: 2019,
        title:
          "How many times per week should a muscle be trained to maximize muscle hypertrophy? A systematic review and meta-analysis of studies examining the effects of resistance training frequency",
        venue: "J Sports Sci 37(11):1286-1295",
        url: "https://doi.org/10.1080/02640414.2018.1555906",
        doi: "10.1080/02640414.2018.1555906",
        evidence: "meta-analysis",
      },
      GALPIN_STRENGTH_2023,
    ],
    caveat:
      "When weekly volume is equal, frequency barely matters for growth (Schoenfeld 2019). Twice a week is mainly a practical way to fit 10+ sets.",
  }),

  "strength.repRange": rule<RepRangeParams>({
    id: "strength.repRange",
    area: "strength",
    statement: "Work sets of 10-12 reps, stopping 1-3 reps short of failure.",
    why: "Muscle grows across many rep ranges if sets end close to failure; 1-3 reps in reserve keeps fatigue manageable.",
    params: { min: 10, max: 12, rirTarget: [1, 3] },
    evidence: "consensus",
    citations: [
      ACSM_2009,
      {
        authors: "Schoenfeld BJ, Grgic J, Ogborn D, Krieger JW",
        year: 2017,
        title: "Strength and Hypertrophy Adaptations Between Low- vs. High-Load Resistance Training: A Systematic Review and Meta-analysis",
        venue: "J Strength Cond Res 31(12):3508-3523",
        url: "https://doi.org/10.1519/JSC.0000000000002200",
        doi: "10.1519/JSC.0000000000002200",
        evidence: "meta-analysis",
      },
      {
        authors: "Robinson ZP, Pelland JC, Remmert JF, Refalo MC, Jukic I, Steele J, Zourdos MC",
        year: 2024,
        title:
          "Exploring the Dose-Response Relationship Between Estimated Resistance Training Proximity to Failure, Strength Gain, and Muscle Hypertrophy: A Series of Meta-Regressions",
        venue: "Sports Med 54(9):2209-2231",
        url: "https://doi.org/10.1007/s40279-024-02069-2",
        doi: "10.1007/s40279-024-02069-2",
        evidence: "meta-analysis",
      },
      GALPIN_STRENGTH_2023,
    ],
    caveat:
      "10-12 is a choice inside a wide effective range (Galpin: mostly 8-15). Heavier loads build more max strength. ACSM 2026 found training to failure gives no consistent extra benefit.",
  }),

  "strength.progression": rule<ProgressionParams>({
    id: "strength.progression",
    area: "strength",
    statement:
      "Double progression: when every set reaches the top of the rep range, add 5 lb (upper body) or 10 lb (lower body) next time.",
    why: "Add weight once you own the rep range; that small, steady overload is how strength keeps rising.",
    params: { addLbUpper: 5, addLbLower: 10, whenAllSetsAtMax: true },
    evidence: "consensus",
    citations: [ACSM_2009],
    caveat:
      "ACSM advises a 2-10% increase. On light lifts a fixed 5 lb can exceed 10% (e.g. 5 lb on a 30 lb dumbbell is ~17%); use the smallest available step there.",
  }),

  "strength.template": rule<StrengthTemplateParams>({
    id: "strength.template",
    area: "strength",
    statement:
      "Core gets 2 sets of 8-12 reps (planks 20-40 seconds). Lower-leg lifts use 12-15 reps. Plyometrics, when allowed, are 3 sets of 5. No lifting session has more than 22 sets. Helper muscles get half a set of credit per set.",
    why: "Small stabiliser and lower-leg muscles respond to higher reps; plyometrics stay low-volume and crisp.",
    params: {
      core: { sets: 2, reps: [8, 12], holdSeconds: [20, 40] },
      lowerLegRepRange: [12, 15],
      plyo: { sets: 3, reps: 5 },
      maxSetsPerSession: 22,
      indirectSetCredit: 0.5,
    },
    evidence: "practice",
    citations: [],
    caveat:
      "Every number here is coaching practice, not a tested value: core volume and holds, the higher rep range for calf and tibialis work, the plyometric dose and the 22-set session cap (a time budget for someone also training for endurance). The 0.5 credit for helper muscles is practice: the Pelland et al. preprint modelled a 0.5 fractional-set scheme alongside others, but we could not confirm the final paper, so it is not cited as support. Calf and tibialis lifts use the upper-body progression step because they are small muscles.",
  }),

  "strength.taper": rule<StrengthTaperParams>({
    id: "strength.taper",
    area: "strength",
    statement: "In taper weeks, cut strength volume to 60% and keep the loads.",
    why: "Less lifting volume at the same loads should shed fatigue before the race; strength likely holds, though less studied.",
    params: { volumeFactor: 0.6 },
    evidence: "expert",
    citations: [
      {
        authors: "Travis SK, Mujika I, Gentles JA, Stone MH, Bazyler CD",
        year: 2020,
        title: "Tapering and Peaking Maximal Strength for Powerlifting Performance: A Review",
        venue: "Sports (Basel) 8(9):125",
        url: "https://doi.org/10.3390/sports8090125",
        doi: "10.3390/sports8090125",
        evidence: "expert",
      },
      {
        authors: "Winwood PW, Travis SK, Barnes MJ, Keogh JWL, Pritchard HJ",
        year: 2026,
        title: "Tapering and Peaking in the Weight Lifting Sports: A Systematic Review of Athletes' Self-Reported Strategies",
        venue: "Sports Med (online ahead of print)",
        url: "https://doi.org/10.1007/s40279-026-02500-w",
        doi: "10.1007/s40279-026-02500-w",
        evidence: "practice",
      },
      ctx(BOSQUET_2007),
      ctx(MUJIKA_PADILLA_2003),
    ],
    caveat:
      "60% is practice: strength athletes report ~40-45% volume cuts (Winwood 2026), and Travis 2020 says strength-taper evidence is lacking. Bosquet's endurance meta-analysis is context only.",
  }),

  // ----- concurrent ---------------------------------------------------------
  "concurrent.spacing": rule<SpacingParams>({
    id: "concurrent.spacing",
    area: "concurrent",
    statement:
      "Keep hard cardio and lifting at least 6 h apart on the same day, and no lower-body lifting within 24 h before a key run.",
    why: "Spacing cardio and lifting limits interference, and fresh legs make the next day's key run better.",
    params: { minHoursBetweenHardCardioAndLift: 6, noLowerDayWithinHoursBeforeKeyRun: 24 },
    evidence: "meta-analysis",
    citations: [
      {
        authors: "Schumann M, Feuerbacher JF, Sünkeler M, Freitag N, Rønnestad BR, Doma K, Lundberg TR",
        year: 2022,
        title:
          "Compatibility of Concurrent Aerobic and Strength Training for Skeletal Muscle Size and Function: An Updated Systematic Review and Meta-Analysis",
        venue: "Sports Med 52(3):601-612",
        url: "https://doi.org/10.1007/s40279-021-01587-7",
        doi: "10.1007/s40279-021-01587-7",
        evidence: "meta-analysis",
      },
      {
        authors: "Wilson JM, Marin PJ, Rhea MR, Wilson SM, Loenneke JP, Anderson JC",
        year: 2012,
        title: "Concurrent training: a meta-analysis examining interference of aerobic and resistance exercises",
        venue: "J Strength Cond Res 26(8):2293-307",
        url: "https://doi.org/10.1519/JSC.0b013e31823a3e2d",
        doi: "10.1519/JSC.0b013e31823a3e2d",
        evidence: "meta-analysis",
      },
      {
        authors: "Robineau J, Babault N, Piscione J, Lacome M, Bigard AX",
        year: 2016,
        title: "Specific Training Effects of Concurrent Aerobic and Strength Exercises Depend on Recovery Duration",
        venue: "J Strength Cond Res 30(3):672-83",
        url: "https://doi.org/10.1519/JSC.0000000000000798",
        doi: "10.1519/JSC.0000000000000798",
        evidence: "trial",
      },
      {
        authors: "Doma K, Deakin GB",
        year: 2013,
        title: "The effects of strength training and endurance training order on running economy and performance",
        venue: "Appl Physiol Nutr Metab 38(6):651-6",
        url: "https://doi.org/10.1139/apnm-2012-0362",
        doi: "10.1139/apnm-2012-0362",
        evidence: "trial",
      },
    ],
    caveat:
      "Schumann 2022 found little interference for size or max strength, only for explosive strength in same-session training. The 6 h and 24 h values come from single trials.",
  }),

  // ----- pain ---------------------------------------------------------------
  "pain.monitoring": rule<PainMonitoringParams>({
    id: "pain.monitoring",
    area: "pain",
    statement:
      "Pain above 3/10, or after-run pain rising over 2 runs in a row, starts a hold: runs become easy rides and plyometrics are dropped. The hold clears after 3 separate days with pain logged at 3/10 or below; not logging doesn't clear it. Consider talking to your doctor.",
    why: "Training can continue with some pain if it stays mild and isn't climbing. Rising pain means hold and get it checked.",
    params: { maxDuring: 3, risingSessions: 2, holdUntilBelowDays: 3 },
    evidence: "practice",
    citations: [
      {
        authors: "Silbernagel KG, Thomeé R, Eriksson BI, Karlsson J",
        year: 2007,
        title:
          "Continued sports activity, using a pain-monitoring model, during rehabilitation in patients with Achilles tendinopathy: a randomized controlled study",
        venue: "Am J Sports Med 35(6):897-906",
        url: "https://doi.org/10.1177/0363546506298279",
        doi: "10.1177/0363546506298279",
        evidence: "trial",
        role: "context",
      },
    ],
    caveat:
      "Practice, adapted from Silbernagel's model (pain below 5/10 in Achilles tendinopathy rehab, a different population). 3/10 is stricter on purpose for shins and joints. Not medical advice.",
  }),

  "pain.jointStatus": rule<JointStatusParams>({
    id: "pain.jointStatus",
    area: "pain",
    statement:
      "Joint status 'caution': no plyometrics and run increases at half the normal cap. 'restricted': no running or plyometrics; consider talking to your doctor.",
    why: "When a joint is flagged, impact work waits and running grows more slowly until your doctor clears it.",
    params: { caution: { plyo: false, runIncreaseFactor: 0.5 }, restricted: { run: false, plyo: false } },
    evidence: "practice",
    citations: [],
    caveat: "Practice plus the spec's doctor follow-up rule; no study tests these exact settings. Never a diagnosis.",
  }),

  // ----- lower leg ----------------------------------------------------------
  "lower_leg.block": rule<LowerLegParams>({
    id: "lower_leg.block",
    area: "lower_leg",
    statement:
      "Twice a week, on non-consecutive days: 2 sets each of tibialis raises, bent-knee calf raises (soleus) and straight-knee calf raises (gastrocnemius).",
    why: "Calf muscles carry much of the load in running. Evidence for these exact drills is weak; slow ramp-up matters most.",
    params: { sessionsPerWeek: 2, tibialisSets: 2, soleusSets: 2, gastrocSets: 2 },
    evidence: "practice",
    citations: [
      {
        authors: "Dorn TW, Schache AG, Pandy MG",
        year: 2012,
        title: "Muscular strategy shift in human running: dependence of running speed on hip and ankle muscle performance",
        venue: "J Exp Biol 215(Pt 11):1944-56",
        url: "https://doi.org/10.1242/jeb.064527",
        doi: "10.1242/jeb.064527",
        evidence: "trial",
        role: "context",
      },
    ],
    caveat:
      "Set counts are practice. Context only: a 9-person modelling study shows soleus and gastrocnemius provide most support force in running. No trial shows these drills prevent shin injury; tibialis evidence is weaker still. Graded load (volume.run) is the main measure.",
  }),

  // ----- week template -------------------------------------------------------
  "week.template": rule<WeekTemplateParams>({
    id: "week.template",
    area: "week",
    statement:
      "Each week has one rest day, 2-3 swims, 2-3 rides and 2-4 runs. The long ride and long run fall on their set days; a sport's long session is about 40% of its minutes. Core goes on 2 of the strength days. Walk-run starts at 1 min run / 1 min walk and adds 1 min of running every 2 weeks.",
    why: "A steady weekly pattern spreads the load: easy days sit around long and hard days, and running builds slowly.",
    params: {
      sessionsPerWeek: { swim: [2, 3], bike: [2, 3], run: [2, 4] },
      typicalSessionMin: { swim: 40, bike: 60, run: 30 },
      longShare: 0.4,
      qualityMinMin: 15,
      minWarmUpMin: 10,
      minCoolDownMin: 5,
      maxHardShareOfSession: 0.5,
      strengthMin: 50,
      lowerLegMin: 10,
      coreMin: 10,
      coreSessionsPerWeek: 2,
      walkRun: { startRunMin: 1, walkMin: 1, stepRunMin: 1, everyWeeks: 2 },
      strides: { reps: 6, seconds: 20 },
    },
    evidence: "practice",
    citations: [],
    caveat:
      "Every value here is coaching practice, not a tested number: the session counts, the 40% long-session share, typical session lengths, the shortest worthwhile quality block, the minimum warm-up and cool-down and the cap on a session's hard share, strength, lower-leg and core durations, the walk-run progression and the strides. The volume caps (volume.*) and intensity.distribution still bound the week.",
  }),
});

export type RuleId = keyof typeof RULES;

export const RULE_IDS = Object.keys(RULES) as RuleId[];

export function getRule<K extends RuleId>(id: K): (typeof RULES)[K] {
  const r = RULES[id];
  if (!r) throw new Error(`Unknown rule id: ${String(id)}`);
  return r;
}
