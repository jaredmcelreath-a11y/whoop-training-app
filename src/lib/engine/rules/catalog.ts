/**
 * The rules catalog. Every number the engine uses comes from a rule's `params`.
 * Each citation was checked against PubMed / the publisher; see docs/rules-sources.md
 * for what each source says, why each param was chosen, and the caveats.
 */
import type { MicroKey, NutrientUnit } from "../nutrients";
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

// ----- nutrition and hydration sources (Plan 4) -------------------------------

const THOMAS_2016: Citation = {
  authors: "Thomas DT, Erdman KA, Burke LM",
  year: 2016,
  title: "American College of Sports Medicine Joint Position Statement. Nutrition and Athletic Performance",
  venue: "Med Sci Sports Exerc 48(3):543-68 (also J Acad Nutr Diet 116(3):501-528)",
  url: "https://doi.org/10.1249/MSS.0000000000000852",
  doi: "10.1249/MSS.0000000000000852",
  evidence: "consensus",
};

const JAGER_2017: Citation = {
  authors:
    "Jäger R, Kerksick CM, Campbell BI, Cribb PJ, Wells SD, Skwiat TM, Purpura M, Ziegenfuss TN, Ferrando AA, Arent SM, Smith-Ryan AE, Stout JR, Arciero PJ, Ormsbee MJ, Taylor LW, Wilborn CD, Kalman DS, Kreider RB, Willoughby DS, Hoffman JR, Krzykowski JL, Antonio J",
  year: 2017,
  title: "International Society of Sports Nutrition Position Stand: protein and exercise",
  venue: "J Int Soc Sports Nutr 14:20",
  url: "https://doi.org/10.1186/s12970-017-0177-8",
  doi: "10.1186/s12970-017-0177-8",
  evidence: "consensus",
};

const MORTON_2018: Citation = {
  authors:
    "Morton RW, Murphy KT, McKellar SR, Schoenfeld BJ, Henselmans M, Helms E, Aragon AA, Devries MC, Banfield L, Krieger JW, Phillips SM",
  year: 2018,
  title:
    "A systematic review, meta-analysis and meta-regression of the effect of protein supplementation on resistance training-induced gains in muscle mass and strength in healthy adults",
  venue: "Br J Sports Med 52(6):376-384",
  url: "https://doi.org/10.1136/bjsports-2017-097608",
  doi: "10.1136/bjsports-2017-097608",
  evidence: "meta-analysis",
};

const IRAKI_2019: Citation = {
  authors: "Iraki J, Fitschen P, Espinar S, Helms E",
  year: 2019,
  title: "Nutrition Recommendations for Bodybuilders in the Off-Season: A Narrative Review",
  venue: "Sports (Basel) 7(7):154",
  url: "https://doi.org/10.3390/sports7070154",
  doi: "10.3390/sports7070154",
  evidence: "expert",
};

const SHCHERBINA_2017: Citation = {
  authors: "Shcherbina A, Mattsson CM, Waggott D, Salisbury H, Christle JW, Hastie T, Wheeler MT, Ashley EA",
  year: 2017,
  title: "Accuracy in Wrist-Worn, Sensor-Based Measurements of Heart Rate and Energy Expenditure in a Diverse Cohort",
  venue: "J Pers Med 7(2):3",
  url: "https://doi.org/10.3390/jpm7020003",
  doi: "10.3390/jpm7020003",
  evidence: "trial",
};

const SAWKA_2007: Citation = {
  authors: "American College of Sports Medicine; Sawka MN, Burke LM, Eichner ER, Maughan RJ, Montain SJ, Stachenfeld NS",
  year: 2007,
  title: "American College of Sports Medicine position stand. Exercise and fluid replacement",
  venue: "Med Sci Sports Exerc 39(2):377-90",
  url: "https://doi.org/10.1249/mss.0b013e31802ca597",
  doi: "10.1249/mss.0b013e31802ca597",
  evidence: "consensus",
};

const GALPIN_NUTRITION_2023: Citation = {
  authors: "Galpin A (guest), Huberman A (host)",
  year: 2023,
  title: "Guest Series | Dr. Andy Galpin: Optimal Nutrition & Supplementation for Fitness",
  venue: "Huberman Lab podcast (episode page and transcript)",
  url: "https://www.hubermanlab.com/episode/dr-andy-galpin-optimal-nutrition-and-supplementation-for-fitness",
  evidence: "expert",
};

const ODS_RECOMMENDATIONS: Citation = {
  authors: "NIH Office of Dietary Supplements",
  year: 2026,
  title: "Nutrient Recommendations and Databases (Dietary Reference Intakes) and the Health Professional fact sheets",
  venue: "ods.od.nih.gov (accessed 2026-10-21)",
  url: "https://ods.od.nih.gov/HealthInformation/nutrientrecommendations.aspx",
  evidence: "consensus",
};

const ODS_VITAMIN_D: Citation = {
  authors: "NIH Office of Dietary Supplements",
  year: 2026,
  title: "Vitamin D: Fact Sheet for Health Professionals",
  venue: "ods.od.nih.gov (accessed 2026-10-21)",
  url: "https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/",
  evidence: "consensus",
};

/** A National Academies (IOM / NASEM) Dietary Reference Intakes report. */
const dri = (year: number, title: string, doi: string, authors = "Institute of Medicine, Food and Nutrition Board"): Citation => ({
  authors,
  year,
  title,
  venue: "National Academies Press (Washington, DC)",
  url: `https://doi.org/${doi}`,
  doi,
  evidence: "consensus",
});

const DRI_1997 = dri(1997, "Dietary Reference Intakes for Calcium, Phosphorus, Magnesium, Vitamin D, and Fluoride", "10.17226/5776");
const DRI_1998 = dri(
  1998,
  "Dietary Reference Intakes for Thiamin, Riboflavin, Niacin, Vitamin B6, Folate, Vitamin B12, Pantothenic Acid, Biotin, and Choline",
  "10.17226/6015",
);
const DRI_2000 = dri(2000, "Dietary Reference Intakes for Vitamin C, Vitamin E, Selenium, and Carotenoids", "10.17226/9810");
const DRI_2001 = dri(
  2001,
  "Dietary Reference Intakes for Vitamin A, Vitamin K, Arsenic, Boron, Chromium, Copper, Iodine, Iron, Manganese, Molybdenum, Nickel, Silicon, Vanadium, and Zinc",
  "10.17226/10026",
);
const DRI_2005_MACRO = dri(
  2005,
  "Dietary Reference Intakes for Energy, Carbohydrate, Fiber, Fat, Fatty Acids, Cholesterol, Protein, and Amino Acids",
  "10.17226/10490",
);
const DRI_2005_WATER = dri(2005, "Dietary Reference Intakes for Water, Potassium, Sodium, Chloride, and Sulfate", "10.17226/10925");
const DRI_2011 = dri(2011, "Dietary Reference Intakes for Calcium and Vitamin D", "10.17226/13050");
const DRI_2019 = dri(
  2019,
  "Dietary Reference Intakes for Sodium and Potassium",
  "10.17226/25353",
  "National Academies of Sciences, Engineering, and Medicine",
);

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

// ----- nutrition and hydration (Plan 4) -----
type ProteinParams = { gPerKg: number; minGPerKg: number; maxGPerKg: number };
type ProteinPerMealParams = { gPerKgPerMeal: number; minMeals: number };
/** `maxMin`: the tier applies while the day's planned endurance minutes are ≤ maxMin. */
type CarbTier = { maxMin: number; gPerKg: Range };
type CarbsByLoadParams = { tiers: CarbTier[] };
type FatMinParams = { pctKcalMin: number };
type EnergyAvailabilityParams = { floorKcalPerKgFfm: number; targetKcalPerKgFfm: number; ffmFallbackFraction: number };
type GainRateParams = { pctBodyweightPerWeek: number; minPct: number };
type CalibrationParams = {
  windowDays: number;
  minDaysWithData: number;
  kcalPerLbChange: number;
  maxWeeklyStepKcal: number;
  highConfidenceDays: number;
};
/** Mifflin-St Jeor REE = kgCoef×kg + cmCoef×cm − ageCoef×years + (maleConst | femaleConst). */
type MifflinParams = { kgCoef: number; cmCoef: number; ageCoef: number; maleConst: number; femaleConst: number };
type InitialTdeeParams = {
  whoopDaysMin: number;
  whoopWindowDays: number;
  fallbackActivityFactor: number;
  mifflin: MifflinParams;
};
type DayDistributionParams = { maxDailySwingPct: number };
type PreWorkoutParams = { minSessionMin: number; carbsGPerKg: Range; hoursBefore: Range; swimNoHeavyMealMin: number };
type PostWorkoutParams = { withinHours: number; carbsGPerKg: number; proteinGPerKg: number };
export type MicroTarget = { value: number; unit: NutrientUnit; kind: "rda" | "ai" | "upper" };
export type MicroProfileName = "male_19_30" | "female_19_30" | "male_31_50" | "female_31_50";
type MicroProfile = Record<MicroKey | "fiber_g", MicroTarget>;
type MicrosParams = { profiles: Record<MicroProfileName, MicroProfile> };
type TimelineParams = {
  wakeBeforeWindowMin: number;
  snackAfterWakeMin: number;
  fallbackAwakeMin: number;
  morningSupplementsAfterWakeMin: number;
  firstMealAfterWakeMin: number;
  eveningSupplementsBeforeBedMin: number;
  morningLightAfterWakeMin: number;
};
type ExerciseKind = "swim" | "bike" | "run" | "strength" | "lower_leg" | "core" | "mobility";
type ExerciseKcalParams = {
  defaultMet: Record<ExerciseKind, number>;
  kcalPerMetKgHour: number;
  historyMinWorkouts: number;
  historyLookbackDays: number;
};
type HydrationDailyParams = { totalWaterL: { male: number; female: number }; beverageShare: number };
type HydrationExerciseParams = {
  maxBodyMassLossPct: number;
  defaultLph: number;
  minLph: number;
  maxLph: number;
  minSessionMin: number;
};
type SweatTestParams = { minDurationMin: number; maxGainLb: number; litersPerKgLost: number };
type RehydrateParams = { replacePctOfLoss: number };
type CreatineBrainParams = { studiedGPerDay: Range; youngNoEffectGPerDay: Range; splitAboveG: number; splitDoses: number; splitDoseG: number };
type Omega3Params = { safeUpToG: number; athleteG: number; afSignalAboveG: number };
type MagnesiumParams = { rdaMgMen: { "19-30": number; "31+": number }; ageBands: readonly number[]; supplementUlMg: number };
type VitaminK2Params = { aiUgMen: number; interactionFromUg: number };
type CollagenParams = { peptidesGPerDay: number; gelatinG: Range; vitaminCMg: number; hoursBefore: number; jointPainGPerDay: Range };

type MorningLightParams = { lampLux: number; lampMin: number; outdoorMin: { clear: number; cloudy: number; overcast: Range }; dimHoursBeforeBed: number };
type AnchorBedtimeParams = { baselineDays: number; maxEarlierMin: number; minNights: number };
type SupplementsParams = {
  creatine: { gPerDay: Range };
  caffeine: { mgPerKg: Range; minutesBefore: number };
  vitaminD: { labGuided: boolean; rdaUg: number; ulUg: number };
};

/**
 * DRI values (NIH ODS fact sheets / National Academies), non-pregnant adults.
 * Units match src/lib/engine/nutrients.ts. Sodium is the 2019 CDRR, an upper target.
 */
function microProfile(sex: "male" | "female", band: "19_30" | "31_50"): MicroProfile {
  const m = sex === "male";
  const t = (value: number, unit: NutrientUnit, kind: MicroTarget["kind"]): MicroTarget => ({ value, unit, kind });
  return {
    fiber_g: t(m ? 38 : 25, "g", "ai"),
    calcium_mg: t(1000, "mg", "rda"),
    iron_mg: t(m ? 8 : 18, "mg", "rda"),
    magnesium_mg: t(m ? (band === "19_30" ? 400 : 420) : band === "19_30" ? 310 : 320, "mg", "rda"),
    potassium_mg: t(m ? 3400 : 2600, "mg", "ai"),
    sodium_mg: t(2300, "mg", "upper"),
    zinc_mg: t(m ? 11 : 8, "mg", "rda"),
    vitamin_a_ug: t(m ? 900 : 700, "ug", "rda"),
    vitamin_c_mg: t(m ? 90 : 75, "mg", "rda"),
    vitamin_d_ug: t(15, "ug", "rda"),
    vitamin_e_mg: t(15, "mg", "rda"),
    vitamin_k_ug: t(m ? 120 : 90, "ug", "ai"),
    vitamin_b12_ug: t(2.4, "ug", "rda"),
    folate_ug: t(400, "ug", "rda"),
  };
}

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

  "recovery.morningLight": rule<MorningLightParams>({
    id: "recovery.morningLight",
    area: "recovery",
    statement:
      "Get bright light soon after waking. With a 10,000-lux lamp, sit about 30 min each morning at the lamp's rated distance, facing it without staring. Outside, about 10 min on clear days, 20 when cloudy and 30-60 when very overcast. Keep light dim for the 3 h before bed.",
    why: "Morning light sets your body clock earlier and steadies sleep; evening light pushes it later.",
    params: { lampLux: 10000, lampMin: 30, outdoorMin: { clear: 10, cloudy: 20, overcast: [30, 60] }, dimHoursBeforeBed: 3 },
    evidence: "consensus",
    citations: [
      {
        authors: "Khalsa SBS, Jewett ME, Cajochen C, Czeisler CA",
        year: 2003,
        title: "A phase response curve to single bright light pulses in human subjects",
        venue: "J Physiol 549(Pt 3):945-952",
        url: "https://doi.org/10.1113/jphysiol.2003.040477",
        doi: "10.1113/jphysiol.2003.040477",
        evidence: "trial",
      },
      {
        authors: "St Hilaire MA, Gooley JJ, Khalsa SBS, Kronauer RE, et al.",
        year: 2012,
        title: "Human phase response curve to a 1 h pulse of bright white light",
        venue: "J Physiol 590(13):3035-3045",
        url: "https://doi.org/10.1113/jphysiol.2012.227892",
        doi: "10.1113/jphysiol.2012.227892",
        evidence: "trial",
      },
      {
        authors: "Wright KP Jr, McHill AW, Birks BR, Griffin BR, Rusterholz T, Chinoy ED",
        year: 2013,
        title: "Entrainment of the human circadian clock to the natural light-dark cycle",
        venue: "Curr Biol 23(16):1554-1558",
        url: "https://doi.org/10.1016/j.cub.2013.06.039",
        doi: "10.1016/j.cub.2013.06.039",
        evidence: "trial",
      },
      {
        authors: "van Maanen A, Meijer AM, van der Heijden KB, Oort FJ",
        year: 2016,
        title: "The effects of light therapy on sleep problems: a systematic review and meta-analysis",
        venue: "Sleep Med Rev 29:52-62",
        url: "https://doi.org/10.1016/j.smrv.2015.08.009",
        doi: "10.1016/j.smrv.2015.08.009",
        evidence: "meta-analysis",
      },
      {
        authors: "Lam RW, Levitt AJ, Levitan RD, Michalak EE, et al.",
        year: 2016,
        title: "Efficacy of Bright Light Treatment, Fluoxetine, and the Combination in Patients With Nonseasonal Major Depressive Disorder: A Randomized Clinical Trial",
        venue: "JAMA Psychiatry 73(1):56-63",
        url: "https://doi.org/10.1001/jamapsychiatry.2015.2235",
        doi: "10.1001/jamapsychiatry.2015.2235",
        evidence: "trial",
      },
      {
        authors: "Penders TM, Stanciu CN, Schoemann AM, Ninan PT, et al.",
        year: 2016,
        title: "Bright Light Therapy as Augmentation of Pharmacotherapy for Treatment of Depression: A Systematic Review and Meta-Analysis",
        venue: "Prim Care Companion CNS Disord 18(5)",
        url: "https://doi.org/10.4088/PCC.15r01906",
        doi: "10.4088/PCC.15r01906",
        evidence: "meta-analysis",
      },
      {
        authors: "Brown TM, Brainard GC, Cajochen C, Czeisler CA, et al.",
        year: 2022,
        title: "Recommendations for daytime, evening, and nighttime indoor light exposure to best support physiology, sleep, and wakefulness in healthy adults",
        venue: "PLoS Biol 20(3):e3001571",
        url: "https://doi.org/10.1371/journal.pbio.3001571",
        doi: "10.1371/journal.pbio.3001571",
        evidence: "consensus",
      },
      {
        authors: "Chang AM, Aeschbach D, Duffy JF, Czeisler CA",
        year: 2015,
        title: "Evening use of light-emitting eReaders negatively affects sleep, circadian timing, and next-morning alertness",
        venue: "Proc Natl Acad Sci USA 112(4):1232-1237",
        url: "https://doi.org/10.1073/pnas.1418490112",
        doi: "10.1073/pnas.1418490112",
        evidence: "trial",
      },
      {
        authors: "Windred DP, Burns AC, Lane JM, Olivier P, Rutter MK, Saxena R, Phillips AJK, Cain SW",
        year: 2024,
        title: "Brighter nights and darker days predict higher mortality risk: a prospective analysis of personal light exposure in >88,000 individuals",
        venue: "Proc Natl Acad Sci USA 121(43):e2405924121",
        url: "https://doi.org/10.1073/pnas.2405924121",
        doi: "10.1073/pnas.2405924121",
        evidence: "trial",
        role: "context",
      },
      {
        authors: "Burns AC, Windred DP, Rutter MK, Olivier P, Vetter C, et al.",
        year: 2023,
        title: "Day and night light exposure are associated with psychiatric disorders: an objective light study in >85,000 people",
        venue: "Nat Ment Health 1(11):853-862",
        url: "https://doi.org/10.1038/s44220-023-00135-8",
        doi: "10.1038/s44220-023-00135-8",
        evidence: "trial",
        role: "context",
      },
      {
        authors: "Knaier R, Schäfer J, Rossmeissl A, Klenk C, et al.",
        year: 2017,
        title: "Prime time light exposures do not seem to improve maximal physical performance in male elite athletes, but enhance end-spurt performance",
        venue: "Front Physiol 8:264",
        url: "https://doi.org/10.3389/fphys.2017.00264",
        doi: "10.3389/fphys.2017.00264",
        evidence: "trial",
        role: "context",
      },
      {
        authors: "Brouwer A, Nguyen HT, Snoek FJ, van Raalte DH, et al.",
        year: 2017,
        title: "Light therapy: is it safe for the eyes?",
        venue: "Acta Psychiatr Scand 136(6):534-548",
        url: "https://doi.org/10.1111/acps.12785",
        doi: "10.1111/acps.12785",
        evidence: "meta-analysis",
        role: "context",
      },
      {
        authors: "Terman M, Terman JS",
        year: 2005,
        title: "Light therapy for seasonal and nonseasonal depression: efficacy, protocol, safety, and side effects",
        venue: "CNS Spectr 10(8):647-663",
        url: "https://doi.org/10.1017/s1092852900019611",
        doi: "10.1017/s1092852900019611",
        evidence: "expert",
        role: "context",
      },
      {
        authors: "Huberman A",
        year: 2023,
        title: "Toolkit for Sleep",
        venue: "Huberman Lab newsletter",
        url: "https://www.hubermanlab.com/newsletter/toolkit-for-sleep",
        evidence: "expert",
        role: "context",
      },
      {
        authors: "Attia P (host), Huberman A (guest)",
        year: 2024,
        title: "Journal club with Andrew Huberman: light exposure and mental health",
        venue: "The Drive podcast (show notes)",
        url: "https://peterattiamd.com/andrewhuberman3",
        evidence: "expert",
        role: "context",
      },
      {
        authors: "Bryan Johnson",
        year: 2026,
        title: "Blueprint protocol: morning light",
        venue: "protocol.bryanjohnson.com (self-experiment, accessed 2026-10-22)",
        url: "https://protocol.bryanjohnson.com",
        evidence: "n-of-1",
        role: "context",
      },
    ],
    caveat:
      "Morning light shifting the clock earlier, and evening light shifting it later, is well shown (Khalsa 2003, St Hilaire 2012, Wright 2013). Light therapy helps sleep problems moderately (van Maanen 2016). The 10,000 lux for 30 min dose comes from treatment trials (Lam 2016, for depression; Penders 2016). Brown 2022 sets the evening target of 10 lux or less from 3 h before bed; Chang 2015 found screens before bed delay sleep. The health links (Windred 2024, Burns 2023, context) are observational studies of older adults, not proof that light causes them. There is no direct evidence that morning light improves training or WHOOP recovery; the only athlete trial (Knaier 2017, context) used evening light and found no gain. The outdoor minutes come from Huberman (expert, context); Attia (context) notes windows block most of the effect; Bryan Johnson (n-of-1, context) uses a lamp for only 3-4 min. Brouwer 2017 found no eye harm in healthy users. Skip or ask a clinician with bipolar history, eye disease or light-sensitizing medication (Terman 2005). Never look directly at the sun. Not medical advice.",
  }),

  "recovery.anchorBedtime": rule<AnchorBedtimeParams>({
    id: "recovery.anchorBedtime",
    area: "recovery",
    statement:
      "Keep one steady bedtime: your average WHOOP baseline sleep need over the last 14 days plus your usual time awake in bed, counted back from your wake time. When WHOOP shows extra need from sleep debt or hard training, go to bed up to 30 min earlier, never later. It needs at least 3 scored nights.",
    why: "Regular sleep times matter for health and training, and enough time in bed covers what you need.",
    params: { baselineDays: 14, maxEarlierMin: 30, minNights: 3 },
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
        authors: "Windred DP, Burns AC, Lane JM, Saxena R, Rutter MK, Cain SW, Phillips AJK",
        year: 2024,
        title: "Sleep regularity is a stronger predictor of mortality risk than sleep duration: A prospective cohort study",
        venue: "Sleep 47(1):zsad253",
        url: "https://doi.org/10.1093/sleep/zsad253",
        doi: "10.1093/sleep/zsad253",
        evidence: "trial",
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
    ],
    caveat:
      "Walsh 2021 recommends consistent sleep and wake times for athletes; Windred 2024, a large observational cohort, found sleep regularity predicted mortality better than sleep duration (an association, not proof of cause). Watson 2015 (context) sets 7+ h for adults. The 14-day average, the 30-min cap, the 3-night minimum and using WHOOP's average time awake in bed as the buffer are scheduling practice, not studied values. WHOOP's need figures are its own estimates. Not medical advice.",
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
  // ----- nutrition (Plan 4) -------------------------------------------------
  "nutrition.protein": rule<ProteinParams>({
    id: "nutrition.protein",
    area: "nutrition",
    statement: "Eat about 1.8 g of protein per kg of bodyweight a day, never below 1.6 g/kg. Up to 2.2 g/kg is fine.",
    why: "Muscle gains from lifting level off near 1.6 g/kg a day in pooled trials; a bit more covers endurance work.",
    params: { gPerKg: 1.8, minGPerKg: 1.6, maxGPerKg: 2.2 },
    evidence: "consensus",
    citations: [JAGER_2017, THOMAS_2016, MORTON_2018],
    caveat:
      "Jäger 2017 gives 1.4-2.0 g/kg/day for most exercising people and Thomas 2016 gives 1.2-2.0 for athletes. Morton 2018 found muscle gains plateau at 1.62 g/kg/day (95% CI 1.03-2.20) in resistance-training trials; 2.2 is that interval's top. 1.8 is a choice inside these ranges, not a tested optimum.",
  }),

  "nutrition.proteinPerMeal": rule<ProteinPerMealParams>({
    id: "nutrition.proteinPerMeal",
    area: "nutrition",
    statement: "Spread protein over at least 4 meals, each with about 0.4 g per kg of bodyweight.",
    why: "Even doses through the day keep muscle repair going; one huge serving is used less well.",
    params: { gPerKgPerMeal: 0.4, minMeals: 4 },
    evidence: "expert",
    citations: [
      {
        authors: "Schoenfeld BJ, Aragon AA",
        year: 2018,
        title: "How much protein can the body use in a single meal for muscle-building? Implications for daily protein distribution",
        venue: "J Int Soc Sports Nutr 15:10",
        url: "https://doi.org/10.1186/s12970-018-0215-1",
        doi: "10.1186/s12970-018-0215-1",
        evidence: "expert",
      },
      ctx(JAGER_2017),
      {
        authors:
          "Areta JL, Burke LM, Ross ML, Camera DM, West DW, Broad EM, Jeacocke NA, Moore DR, Stellingwerff T, Phillips SM, Hawley JA, Coffey VG",
        year: 2013,
        title:
          "Timing and distribution of protein ingestion during prolonged recovery from resistance exercise alters myofibrillar protein synthesis",
        venue: "J Physiol 591(9):2319-31",
        url: "https://doi.org/10.1113/jphysiol.2012.244897",
        doi: "10.1113/jphysiol.2012.244897",
        evidence: "trial",
        role: "context",
      },
    ],
    caveat:
      "The 0.4 g/kg x 4 meals figure comes from a narrative review (Schoenfeld & Aragon 2018). The ISSN stand (context) suggests 0.25 g/kg or 20-40 g every 3-4 h, so this target is on the generous side. Areta 2013 (context) is a short protein-synthesis study, not a muscle-growth trial.",
  }),

  "nutrition.carbsByLoad": rule<CarbsByLoadParams>({
    id: "nutrition.carbsByLoad",
    area: "nutrition",
    statement:
      "Daily carbs follow the day's planned endurance minutes: up to 30 min, 3-5 g/kg; up to 75 min, 5-7 g/kg; up to 240 min, 6-10 g/kg; longer days, 8-12 g/kg. The middle of the range is the target.",
    why: "Carbs fuel endurance training, so they rise and fall with each day's load instead of staying fixed.",
    params: {
      tiers: [
        { maxMin: 30, gPerKg: [3, 5] },
        { maxMin: 75, gPerKg: [5, 7] },
        { maxMin: 240, gPerKg: [6, 10] },
        { maxMin: 9999, gPerKg: [8, 12] },
      ],
    },
    evidence: "consensus",
    citations: [THOMAS_2016],
    caveat:
      "Thomas 2016 sets these ranges by load (light or skill work; about 1 h/day; 1-3 h/day of moderate-high intensity; over 4-5 h/day), not by exact minutes. The minute cut-offs are the app's mapping (practice). Days of 3-4 h stay in the 6-10 tier because the statement gives no range for them; the planner's 180-min cut-off was moved to 240 for that reason.",
  }),

  "nutrition.fatMin": rule<FatMinParams>({
    id: "nutrition.fatMin",
    area: "nutrition",
    statement: "Fat never drops below 20% of the day's calories.",
    why: "Very low-fat eating cuts fat-soluble vitamins and essential fats, so athletes are advised to stay above this.",
    params: { pctKcalMin: 20 },
    evidence: "consensus",
    citations: [THOMAS_2016],
    caveat: "Thomas 2016 discourages chronic fat intakes below 20% of energy and says typical intakes run 20-35%.",
  }),

  "nutrition.energyAvailability": rule<EnergyAvailabilityParams>({
    id: "nutrition.energyAvailability",
    area: "nutrition",
    statement:
      "Calories eaten minus exercise calories must stay at or above 30 kcal per kg of fat-free mass a day; about 45 is the healthy target. Without a body scan, fat-free mass is assumed to be 85% of bodyweight. This floor overrides every other calorie rule.",
    why: "Too little energy left after training harms hormones, bone and recovery, so this floor always wins.",
    params: { floorKcalPerKgFfm: 30, targetKcalPerKgFfm: 45, ffmFallbackFraction: 0.85 },
    evidence: "consensus",
    citations: [
      THOMAS_2016,
      {
        authors:
          "Mountjoy M, Ackerman KE, Bailey DM, Burke LM, Constantini N, Hackney AC, Heikura IA, Melin A, Pensgaard AM, Stellingwerff T, Sundgot-Borgen JK, Torstveit MK, Jacobsen AU, Verhagen E, Budgett R, Engebretsen L, Erdener U",
        year: 2023,
        title: "2023 International Olympic Committee's (IOC) consensus statement on Relative Energy Deficiency in Sport (REDs)",
        venue: "Br J Sports Med 57(17):1073-1097",
        url: "https://doi.org/10.1136/bjsports-2023-106994",
        doi: "10.1136/bjsports-2023-106994",
        evidence: "consensus",
        role: "context",
      },
      {
        authors: "Loucks AB, Thuma JR",
        year: 2003,
        title: "Luteinizing hormone pulsatility is disrupted at a threshold of energy availability in regularly menstruating women",
        venue: "J Clin Endocrinol Metab 88(1):297-311",
        url: "https://doi.org/10.1210/jc.2002-020369",
        doi: "10.1210/jc.2002-020369",
        evidence: "trial",
        role: "context",
      },
      {
        authors: "Loucks AB, Kiens B, Wright HH",
        year: 2011,
        title: "Energy availability in athletes",
        venue: "J Sports Sci 29 Suppl 1:S7-15",
        url: "https://doi.org/10.1080/02640414.2011.588958",
        doi: "10.1080/02640414.2011.588958",
        evidence: "expert",
        role: "context",
      },
    ],
    caveat:
      "Thomas 2016 states the 45 (energy balance) and below-30 (impaired function) values and notes the concept was first studied in women. They come from short lab studies of young, mostly sedentary women (Loucks & Thuma 2003: 29 women, 5 days). Evidence in men is thinner, so for a man this floor is a cautious choice, not a proven threshold. The IOC 2023 REDs consensus (context) covers low energy availability in women and men; its full text could not be checked for these exact numbers. The 85% fat-free-mass fallback (about 15% body fat) is practice; a scan replaces it. Not medical advice.",
  }),

  "nutrition.gainRate": rule<GainRateParams>({
    id: "nutrition.gainRate",
    area: "nutrition",
    statement:
      "In the muscle-gain phase, aim to gain about 0.5% of bodyweight a week. After it, base and build weeks use 0.25% while some of the goal remains. Peak, taper and race weeks get no surplus.",
    why: "Slow gains favour muscle over fat. Race preparation always comes before gaining.",
    params: { pctBodyweightPerWeek: 0.5, minPct: 0.25 },
    evidence: "practice",
    citations: [ctx(IRAKI_2019)],
    caveat:
      "Iraki 2019 (a narrative review for bodybuilders, a different population; context) suggests about 0.25-0.5% of bodyweight a week for novice and intermediate lifters, with a 10-20% energy surplus. Using it for a triathlete who lifts, and the 0.25% rate outside the gain phase, are the owner's decisions (practice).",
  }),

  "nutrition.calibration": rule<CalibrationParams>({
    id: "nutrition.calibration",
    area: "nutrition",
    statement:
      "Each week the calorie burn estimate is recalculated from the last 14 days: average intake minus the weight trend's daily change x 3500 kcal per lb. It needs 10 days with both intake and weight, moves at most 150 kcal a week, and counts as high confidence after 21 days of data.",
    why: "What you ate and how your weight moved show your real burn better than a formula or a wristband.",
    params: { windowDays: 14, minDaysWithData: 10, kcalPerLbChange: 3500, maxWeeklyStepKcal: 150, highConfidenceDays: 21 },
    evidence: "practice",
    citations: [
      {
        authors: "Hall KD",
        year: 2008,
        title: "What is the required energy deficit per unit weight loss?",
        venue: "Int J Obes (Lond) 32(3):573-6",
        url: "https://doi.org/10.1038/sj.ijo.0803720",
        doi: "10.1038/sj.ijo.0803720",
        evidence: "trial",
        role: "context",
      },
      {
        authors: "Thomas DM, Martin CK, Lettieri S, Bredlau C, Kaiser K, Church T, Bouchard C, Heymsfield SB",
        year: 2013,
        title: "Can a weight loss of one pound a week be achieved with a 3500-kcal deficit? Commentary on a commonly accepted rule",
        venue: "Int J Obes (Lond) 37(12):1611-3",
        url: "https://doi.org/10.1038/ijo.2013.51",
        doi: "10.1038/ijo.2013.51",
        evidence: "expert",
        role: "context",
      },
    ],
    caveat:
      "Practice, as used by adaptive calorie apps. The 3500 kcal/lb rule is a known oversimplification: Hall 2008 (a model) shows the energy in a pound of weight change depends on body fat and on how much of it is lean tissue, so a lean person's change, or a gain with muscle, holds less than 3500 kcal per lb. Thomas 2013 shows the rule badly over-predicts long-term loss. Here it only converts a short, smoothed trend; water swings add noise, which is why the weekly step is capped. The window, data minimum, cap and confidence days are practice.",
  }),

  "nutrition.initialTdee": rule<InitialTdeeParams>({
    id: "nutrition.initialTdee",
    area: "nutrition",
    statement:
      "The first calorie burn estimate is the average WHOOP daily burn over the last 14 days when at least 7 days exist; otherwise the body scan's BMR x 1.7; otherwise the Mifflin-St Jeor resting estimate x 1.7. Weekly calibration then takes over.",
    why: "Start from the best data available, then let your real intake and weight correct it.",
    params: {
      whoopDaysMin: 7,
      whoopWindowDays: 14,
      fallbackActivityFactor: 1.7,
      mifflin: { kgCoef: 10, cmCoef: 6.25, ageCoef: 5, maleConst: 5, femaleConst: -161 },
    },
    evidence: "consensus",
    citations: [
      {
        authors: "FAO, WHO, UNU",
        year: 2004,
        title: "Human energy requirements: Report of a Joint FAO/WHO/UNU Expert Consultation (Rome, 17-24 October 2001)",
        venue: "FAO Food and Nutrition Technical Report Series No. 1 (Rome)",
        url: "https://www.fao.org/4/y5686e/y5686e00.htm",
        evidence: "consensus",
      },
      {
        authors: "Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO",
        year: 1990,
        title: "A new predictive equation for resting energy expenditure in healthy individuals",
        venue: "Am J Clin Nutr 51(2):241-7",
        url: "https://doi.org/10.1093/ajcn/51.2.241",
        doi: "10.1093/ajcn/51.2.241",
        evidence: "trial",
      },
      ctx(SHCHERBINA_2017),
    ],
    caveat:
      "1.7 is the bottom of the FAO/WHO/UNU 'active or moderately active' band (1.70-1.99; about an hour of daily exercise moves a person from 1.55 to 1.75); the planner's 1.6 was raised to match. Mifflin's simplified per-sex equation (498 adults aged 19-78) estimates resting burn. Wrist devices misjudge energy burn (Shcherbina 2017: median errors of 27-93% across seven devices; WHOOP was not tested), so WHOOP is only a starting point. The WHOOP-first order and the 7-day minimum are practice.",
  }),

  "nutrition.dayDistribution": rule<DayDistributionParams>({
    id: "nutrition.dayDistribution",
    area: "nutrition",
    statement: "Daily calories move above or below the weekly average with that day's planned load, by at most 25%.",
    why: "Eat more on big training days and less on rest days, while the weekly total stays on target.",
    params: { maxDailySwingPct: 25 },
    evidence: "practice",
    citations: [ctx(THOMAS_2016)],
    caveat:
      "Thomas 2016 (context) says nutrition should be periodized to each day's training, mainly through carbohydrate. The 25% cap is practice, not a tested value.",
  }),

  "nutrition.preWorkout": rule<PreWorkoutParams>({
    id: "nutrition.preWorkout",
    area: "nutrition",
    statement:
      "Before a session of 60 min or more, eat a carb snack of 1-2 g/kg, 1-3 h before. Before a swim, no heavy meal in the last 90 min.",
    why: "Carbs before longer sessions top up fuel. A full stomach makes swimming uncomfortable.",
    params: { minSessionMin: 60, carbsGPerKg: [1, 2], hoursBefore: [1, 3], swimNoHeavyMealMin: 90 },
    evidence: "consensus",
    citations: [THOMAS_2016],
    caveat:
      "Thomas 2016 gives 1-4 g/kg, 1-4 h before exercise lasting over 60 min, mainly for competition. The app uses the lower part of that range for training days. The 90-min swim rule is practice.",
  }),

  "nutrition.postWorkout": rule<PostWorkoutParams>({
    id: "nutrition.postWorkout",
    area: "nutrition",
    statement: "Within 2 h after a session, eat about 1 g/kg of carbs and 0.3 g/kg of protein.",
    why: "Carbs refill muscle fuel and protein starts repair; both help most soon after training.",
    params: { withinHours: 2, carbsGPerKg: 1.0, proteinGPerKg: 0.3 },
    evidence: "consensus",
    citations: [THOMAS_2016, ctx(JAGER_2017)],
    caveat:
      "Thomas 2016 gives 0.25-0.3 g/kg of protein in the first 0-2 h, and, when the next hard session is under 8 h away, 1.0-1.2 g/kg of carbs per hour for 4 h. One 1 g/kg serving is a simplification for normal days (practice). Jäger 2017 (context) says pre- or post-workout protein both work.",
  }),

  "nutrition.micros": rule<MicrosParams>({
    id: "nutrition.micros",
    area: "nutrition",
    statement:
      "Daily fiber, vitamin and mineral targets come from the US Dietary Reference Intakes for your sex and age band. Sodium is a stay-under limit of 2300 mg; the rest are amounts to reach.",
    why: "These official amounts cover nearly all healthy adults. Set your profile to pick the right row.",
    params: {
      profiles: {
        male_19_30: microProfile("male", "19_30"),
        female_19_30: microProfile("female", "19_30"),
        male_31_50: microProfile("male", "31_50"),
        female_31_50: microProfile("female", "31_50"),
      },
    },
    evidence: "consensus",
    citations: [ODS_RECOMMENDATIONS, DRI_1997, DRI_1998, DRI_2000, DRI_2001, DRI_2005_MACRO, DRI_2011, DRI_2019],
    caveat:
      "An RDA covers 97-98% of healthy people; an AI (fiber, potassium, vitamin K) is a best estimate where no RDA could be set. Sodium uses the 2019 Chronic Disease Risk Reduction level; its AI is lower (1500 mg), and heavy sweaters lose more in training. Vitamin A is in µg RAE and folate in µg DFE, which Health and Cronometer totals may not match exactly. Hard training can raise iron needs. Not medical advice: talk to your doctor or a registered dietitian.",
  }),

  "nutrition.timeline": rule<TimelineParams>({
    id: "nutrition.timeline",
    area: "nutrition",
    statement:
      "Wake time defaults to 45 min before the first training window. A pre-session snack is never placed earlier than 10 min after waking; if it would be, it moves there and shrinks to the low end of its carb range. Without a WHOOP sleep need, meals are spread over an assumed 960-min awake day.",
    why: "Leaves time to wake up and eat before training, without planning food before you are up.",
    params: {
      wakeBeforeWindowMin: 45,
      snackAfterWakeMin: 10,
      fallbackAwakeMin: 960,
      morningSupplementsAfterWakeMin: 10,
      firstMealAfterWakeMin: 20,
      eveningSupplementsBeforeBedMin: 60,
      morningLightAfterWakeMin: 15,
    },
    evidence: "practice",
    citations: [],
    caveat:
      "All seven values are scheduling practice, not studied numbers. Morning supplements are grouped 10 min after waking, morning light starts 15 min after waking, breakfast is 20 min after waking, and evening supplements come 60 min before bed. The 960-min awake day only spaces meals when no bedtime can be shown; it is not a sleep recommendation.",
  }),

  "nutrition.exerciseKcal": rule<ExerciseKcalParams>({
    id: "nutrition.exerciseKcal",
    area: "nutrition",
    statement:
      "Planned exercise calories = planned minutes x your median WHOOP kcal per minute for that sport, from at least 3 workouts in the last 90 days. Without that history, a standard MET value is used (1 MET is about 1 kcal per kg per hour).",
    why: "Your own workout history fits you best; standard tables cover sports with no history yet.",
    params: {
      defaultMet: { swim: 5.8, bike: 7.0, run: 7.5, strength: 3.5, lower_leg: 3.0, core: 2.8, mobility: 2.3 },
      kcalPerMetKgHour: 1,
      historyMinWorkouts: 3,
      historyLookbackDays: 90,
    },
    evidence: "expert",
    citations: [
      {
        authors: "Herrmann SD, Willis EA, Ainsworth BE, Barreira TV, Hastert M, Kracht CL, Schuna JM Jr, Cai Z, et al.",
        year: 2024,
        title: "2024 Adult Compendium of Physical Activities: A third update of the energy costs of human activities",
        venue: "J Sport Health Sci 13(1):6-12 (codes at pacompendium.com)",
        url: "https://doi.org/10.1016/j.jshs.2023.10.010",
        doi: "10.1016/j.jshs.2023.10.010",
        evidence: "expert",
      },
      ctx(SHCHERBINA_2017),
    ],
    caveat:
      "Defaults are 2024 Compendium codes for easy-to-moderate effort: swim 18240 (freestyle laps, slow), bike 01014 (general), run 12020 (jogging, self-selected pace), strength 02054 (multiple exercises, 8-15 reps), lower leg 02056 (body-weight resistance, general), core 02024 (light calisthenics, plank), mobility 02101 (mild stretching). The Compendium is a curated table of measured averages (labelled expert), not a trial. METs are gross (they include resting burn), so they slightly overstate exercise calories, which keeps the energy floor on the safe side. Hard sessions burn more. WHOOP history has device error too (Shcherbina 2017, context). The 3-workout and 90-day limits are practice.",
  }),

  // ----- hydration ------------------------------------------------------------
  "hydration.daily": rule<HydrationDailyParams>({
    id: "hydration.daily",
    area: "hydration",
    statement:
      "Baseline drinking target: 80% of the daily total-water intake (3.7 L for men, 2.7 L for women), because food supplies the rest. Training sweat is added on top.",
    why: "The official water figure includes water in food; drinks supply most of it.",
    params: { totalWaterL: { male: 3.7, female: 2.7 }, beverageShare: 0.8 },
    evidence: "consensus",
    citations: [DRI_2005_WATER],
    caveat:
      "The Adequate Intake is the median total-water intake of healthy, adequately hydrated US adults, not a minimum requirement, and it already includes water from food (about a fifth). Heat and training raise needs (hydration.exercise). Without a profile the app uses the lower value.",
  }),

  "hydration.exercise": rule<HydrationExerciseParams>({
    id: "hydration.exercise",
    area: "hydration",
    statement:
      "For sessions of 60 min or more, drink to keep sweat loss under 2% of bodyweight. Use your measured sweat rate, else 0.6 L/h (never below 0.4 L/h), to size the day's water. During the session, drink at that rate but no more than 1 L/h.",
    why: "Losing more than 2% of bodyweight as sweat hurts endurance; drinking far more than you sweat is risky too.",
    params: { maxBodyMassLossPct: 2, defaultLph: 0.6, minLph: 0.4, maxLph: 1.0, minSessionMin: 60 },
    evidence: "consensus",
    citations: [SAWKA_2007, THOMAS_2016, ctx(GALPIN_NUTRITION_2023)],
    caveat:
      "Sawka 2007 and Thomas 2016 back the 2% limit and a personal plan; Thomas says most athletes drink 0.4-0.8 L/h, and 0.6 is the middle. The 1 L/h cap is practice (gut tolerance, avoiding over-drinking) and limits only what you drink during a session. The daily target adds your full measured sweat loss, uncapped, so a heavy sweater is not under-counted; the gap between a rate above 1 L/h and what you drink during the session is made up afterwards. The 60-min cut-off is practice. Galpin's rule of thumb (bodyweight in lb / 30 = oz every 15-20 min, about 0.6 L/h at 154 lb) is shown as context.",
  }),

  "hydration.sweatTest": rule<SweatTestParams>({
    id: "hydration.sweatTest",
    area: "hydration",
    statement:
      "Sweat rate = (weight before - weight after + fluid drunk) / hours, counting 1 kg lost as 1 L. A test shorter than 20 min, or one showing a gain of more than 2 lb, is rejected.",
    why: "Weighing before and after a session is the standard way to learn your own sweat rate.",
    params: { minDurationMin: 20, maxGainLb: 2, litersPerKgLost: 1 },
    evidence: "consensus",
    citations: [SAWKA_2007, THOMAS_2016],
    caveat:
      "Sawka 2007 recommends estimating sweat rate from body weight before and after exercise; Thomas 2016 says 1 kg lost is about 1 L of sweat. The 20-min and 2-lb input checks are practice, to catch typos. Weigh without clothes after towelling off, and avoid passing urine between weigh-ins.",
  }),

  "hydration.rehydrate": rule<RehydrateParams>({
    id: "hydration.rehydrate",
    area: "hydration",
    statement: "After training, drink about 125% of the sweat you lost.",
    why: "You keep losing fluid as urine after exercise, so replacing only what you sweated leaves you short.",
    params: { replacePctOfLoss: 125 },
    evidence: "consensus",
    citations: [
      THOMAS_2016,
      GALPIN_NUTRITION_2023,
      {
        authors: "Shirreffs SM, Taylor AJ, Leiper JB, Maughan RJ",
        year: 1996,
        title: "Post-exercise rehydration in man: effects of volume consumed and drink sodium content",
        venue: "Med Sci Sports Exerc 28(10):1260-71",
        url: "https://doi.org/10.1097/00005768-199610000-00009",
        doi: "10.1097/00005768-199610000-00009",
        evidence: "trial",
        role: "context",
      },
    ],
    caveat:
      "Thomas 2016 gives 125-150% of the remaining deficit; the app uses the low end, as does Galpin. Shirreffs 1996 (12 men, context) showed that drinking more than was lost only restores balance when the drink holds enough sodium, so pair it with a salty meal or a sodium drink after heavy sweating.",
  }),

  // ----- supplements ----------------------------------------------------------
  "supplements.evidence": rule<SupplementsParams>({
    id: "supplements.evidence",
    area: "supplements",
    statement:
      "Creatine monohydrate: 3-5 g a day. Caffeine, if you use it: 3-6 mg/kg about 60 min before key sessions. Vitamin D: dose only from a blood test with your doctor; the RDA is 15 µg and the upper limit 100 µg a day.",
    why: "These are the doses the evidence backs, and the app never suggests more. Check with your doctor or dietitian.",
    params: {
      creatine: { gPerDay: [3, 5] },
      caffeine: { mgPerKg: [3, 6], minutesBefore: 60 },
      vitaminD: { labGuided: true, rdaUg: 15, ulUg: 100 },
    },
    evidence: "consensus",
    citations: [
      {
        authors: "Kreider RB, Kalman DS, Antonio J, Ziegenfuss TN, Wildman R, Collins R, Candow DG, Kleiner SM, Almada AL, Lopez HL",
        year: 2017,
        title:
          "International Society of Sports Nutrition position stand: safety and efficacy of creatine supplementation in exercise, sport, and medicine",
        venue: "J Int Soc Sports Nutr 14:18",
        url: "https://doi.org/10.1186/s12970-017-0173-z",
        doi: "10.1186/s12970-017-0173-z",
        evidence: "consensus",
      },
      {
        authors:
          "Guest NS, VanDusseldorp TA, Nelson MT, Grgic J, Schoenfeld BJ, Jenkins NDM, Arent SM, Antonio J, Stout JR, Trexler ET, Smith-Ryan AE, Goldstein ER, Kalman DS, Campbell BI",
        year: 2021,
        title: "International society of sports nutrition position stand: caffeine and exercise performance",
        venue: "J Int Soc Sports Nutr 18(1):1",
        url: "https://doi.org/10.1186/s12970-020-00383-4",
        doi: "10.1186/s12970-020-00383-4",
        evidence: "consensus",
      },
      ODS_VITAMIN_D,
      DRI_2011,
      GALPIN_NUTRITION_2023,
    ],
    caveat:
      "Not medical advice: talk to your doctor or a registered dietitian before starting any supplement, especially with kidney problems (creatine), heart or sleep problems (caffeine, which can disturb sleep if taken late), or regular medications. Kreider 2017 notes larger athletes may need 5-10 g/day of creatine to maintain stores; the app stays at 3-5. The vitamin D RDA assumes little sun, and the upper limit does not apply to treatment under a physician.",
  }),

  "supplements.creatineBrain": rule<CreatineBrainParams>({
    id: "supplements.creatineBrain",
    area: "supplements",
    statement:
      "For memory, reviews find a small creatine benefit across studied doses of 2.2-20 g a day, mostly in older adults and during sleep loss. Young, rested adults show little or no effect, including at 10 and 20 g a day. At 10 g a day or more, split it into doses of 5 g or less.",
    why: "Brain effects are real but small and not dose-driven; splitting a big dose eases the stomach.",
    params: { studiedGPerDay: [2.2, 20], youngNoEffectGPerDay: [10, 20], splitAboveG: 10, splitDoses: 2, splitDoseG: 5 },
    evidence: "meta-analysis",
    citations: [
      {
        authors: "Prokopidis K, Giannos P, Triantafyllidis KK, Kechagias KS, Forbes SC, Candow DG",
        year: 2023,
        title: "Effects of creatine supplementation on memory in healthy individuals: a systematic review and meta-analysis of randomized controlled trials",
        venue: "Nutr Rev 81(4):416-427",
        url: "https://doi.org/10.1093/nutrit/nuac064",
        doi: "10.1093/nutrit/nuac064",
        evidence: "meta-analysis",
      },
      {
        authors: "Xu C, Bi S, Zhang W, Luo L",
        year: 2024,
        title: "The effects of creatine supplementation on cognitive function in adults: a systematic review and meta-analysis",
        venue: "Front Nutr 11:1424972",
        url: "https://doi.org/10.3389/fnut.2024.1424972",
        doi: "10.3389/fnut.2024.1424972",
        evidence: "meta-analysis",
      },
      {
        authors: "Avgerinos KI, Spyrou N, Bougioukas KI, Kapogiannis D",
        year: 2018,
        title: "Effects of creatine supplementation on cognitive function of healthy individuals: A systematic review of randomized controlled trials",
        venue: "Exp Gerontol 108:166-173",
        url: "https://doi.org/10.1016/j.exger.2018.04.013",
        doi: "10.1016/j.exger.2018.04.013",
        evidence: "meta-analysis",
      },
      {
        authors: "Moriarty T, Bourbeau K, Dorman K, Runyon L, Glaser N, Brandt J, Hoodjer M, Forbes SC, Candow DG",
        year: 2023,
        title: "Dose-Response of Creatine Supplementation on Cognitive Function in Healthy Young Adults",
        venue: "Brain Sci 13(9):1276",
        url: "https://doi.org/10.3390/brainsci13091276",
        doi: "10.3390/brainsci13091276",
        evidence: "trial",
      },
      {
        authors: "Ostojic SM, Ahmetovic Z",
        year: 2008,
        title: "Gastrointestinal Distress After Creatine Supplementation in Athletes: Are Side Effects Dose Dependent?",
        venue: "Res Sports Med 16(1):15-22",
        url: "https://doi.org/10.1080/15438620701693280",
        doi: "10.1080/15438620701693280",
        evidence: "trial",
      },
      {
        authors: "Dolan E, Gualano B, Rawson ES",
        year: 2019,
        title: "Beyond muscle: the effects of creatine supplementation on brain creatine, cognitive processing, and traumatic brain injury",
        venue: "Eur J Sport Sci 19(1):1-14",
        url: "https://doi.org/10.1080/17461391.2018.1500644",
        doi: "10.1080/17461391.2018.1500644",
        evidence: "expert",
        role: "context",
      },
      {
        authors: "Gordji-Nejad A, Matusch A, Kleedörfer S, Jayeshkumar Patel H, Drzezga A, Elmenhorst D, Binkofski F, Bauer A",
        year: 2024,
        title: "Single dose creatine improves cognitive performance and induces changes in cerebral high energy phosphates during sleep deprivation",
        venue: "Sci Rep 14:4937",
        url: "https://doi.org/10.1038/s41598-024-54249-9",
        doi: "10.1038/s41598-024-54249-9",
        evidence: "trial",
        role: "context",
      },
      {
        authors: "Antonio J, Candow DG, Forbes SC, Gualano B, Jagim AR, Kreider RB, Rawson ES, Smith-Ryan AE, VanDusseldorp TA, Willoughby DS, et al.",
        year: 2021,
        title: "Common questions and misconceptions about creatine supplementation: what does the scientific evidence really show?",
        venue: "J Int Soc Sports Nutr 18:13",
        url: "https://doi.org/10.1186/s12970-021-00412-w",
        doi: "10.1186/s12970-021-00412-w",
        evidence: "consensus",
        role: "context",
      },
      ctx(GALPIN_NUTRITION_2023),
      {
        authors: "Bryan Johnson",
        year: 2026,
        title: "Blueprint protocol: daily supplement stack",
        venue: "protocol.bryanjohnson.com (self-experiment, accessed 2026-10-22)",
        url: "https://protocol.bryanjohnson.com",
        evidence: "n-of-1",
        role: "context",
      },
    ],
    caveat:
      "The memory benefit is small (pooled SMD about 0.3) and shows mainly in older adults and under sleep deprivation; Prokopidis 2023 found about no effect in people aged 11-31, and Moriarty 2023 found none at 10 or 20 g a day for 6 weeks in young adults. No study shows doses above 5 g beat 5 g for cognition in young adults. Dolan 2019 (context) notes brain uptake may need higher or longer dosing than muscle. Gordji-Nejad 2024 (context) tested a single 0.35 g/kg dose during one night of sleep loss, not an everyday protocol. Antonio 2021 (context) finds no kidney harm at recommended doses in healthy people; reports of up to 30 g a day for 5 years being safe come mainly from clinical populations, so long-term data at 10 g a day in young athletes are thinner. Creatine raises serum creatinine on lab tests. Many authors have industry ties. Galpin (context) uses 3-5 g; Johnson (n-of-1, context) lists 7.5 g. Not medical advice: talk to your doctor or a registered dietitian.",
  }),

  "supplements.omega3": rule<Omega3Params>({
    id: "supplements.omega3",
    area: "supplements",
    statement:
      "Omega-3 (EPA + DHA): up to 5 g a day combined is considered safe for adults, and about 2 g a day is the dose cited for athletes, with inconsistent effects on soreness. In trials of older, at-risk adults, more than 1 g a day came with more atrial fibrillation.",
    why: "Safe at common doses, but the recovery benefit is small; fatty fish works too.",
    params: { safeUpToG: 5, athleteG: 2, afSignalAboveG: 1 },
    evidence: "consensus",
    citations: [
      {
        authors: "Maughan RJ, Burke LM, Dvorak J, Larson-Meyer DE, Peeling P, Phillips SM, Rawson ES, Walsh NP, Garthe I, Geyer H, et al.",
        year: 2018,
        title: "IOC consensus statement: dietary supplements and the high-performance athlete",
        venue: "Br J Sports Med 52(7):439-455",
        url: "https://doi.org/10.1136/bjsports-2018-099027",
        doi: "10.1136/bjsports-2018-099027",
        evidence: "consensus",
      },
      {
        authors: "EFSA Panel on Dietetic Products, Nutrition and Allergies (NDA)",
        year: 2012,
        title: "Scientific Opinion on the Tolerable Upper Intake Level of eicosapentaenoic acid (EPA), docosahexaenoic acid (DHA) and docosapentaenoic acid (DPA)",
        venue: "EFSA Journal 10(7):2815",
        url: "https://doi.org/10.2903/j.efsa.2012.2815",
        doi: "10.2903/j.efsa.2012.2815",
        evidence: "consensus",
      },
      {
        authors: "U.S. Food and Drug Administration",
        year: 2019,
        title: "Letter of enforcement discretion to GOED: health claim for EPA and DHA and reduction of blood pressure (Docket FDA-2014-Q-1146)",
        venue: "FDA letter, 2019-06-19",
        url: "https://www.fda.gov/media/128043/download",
        evidence: "consensus",
      },
      {
        authors: "Lv Zt, Zhang Jm, Zhu Wt",
        year: 2020,
        title: "Omega-3 Polyunsaturated Fatty Acid Supplementation for Reducing Muscle Soreness after Eccentric Exercise: A Systematic Review and Meta-Analysis of Randomized Controlled Trials",
        venue: "Biomed Res Int 2020:8062017",
        url: "https://doi.org/10.1155/2020/8062017",
        doi: "10.1155/2020/8062017",
        evidence: "meta-analysis",
      },
      {
        authors: "Gencer B, Djousse L, Al-Ramady OT, Cook NR, Manson JE, Albert CM",
        year: 2021,
        title: "Effect of Long-Term Marine Omega-3 Fatty Acids Supplementation on the Risk of Atrial Fibrillation in Randomized Controlled Trials of Cardiovascular Outcomes: A Systematic Review and Meta-Analysis",
        venue: "Circulation 144(25):1981-1990",
        url: "https://doi.org/10.1161/CIRCULATIONAHA.121.055654",
        doi: "10.1161/CIRCULATIONAHA.121.055654",
        evidence: "meta-analysis",
      },
      {
        authors: "Xin G, Eshaghi H",
        year: 2021,
        title: "Effect of omega-3 fatty acids supplementation on indirect blood markers of exercise-induced muscle damage: Systematic review and meta-analysis of randomized controlled trials",
        venue: "Food Sci Nutr 9(11):6429-6442",
        url: "https://doi.org/10.1002/fsn3.2598",
        doi: "10.1002/fsn3.2598",
        evidence: "meta-analysis",
        role: "context",
      },
      ctx(GALPIN_NUTRITION_2023),
      {
        authors: "Bryan Johnson",
        year: 2026,
        title: "Blueprint protocol: daily supplement stack",
        venue: "protocol.bryanjohnson.com (self-experiment, accessed 2026-10-22)",
        url: "https://protocol.bryanjohnson.com",
        evidence: "n-of-1",
        role: "context",
      },
    ],
    caveat:
      "No sports body recommends omega-3 for endurance performance; the IOC calls the soreness benefit inconsistent and suggests fatty fish as an alternative. Lv 2020 found a soreness drop below what people notice. Xin 2021 (context) found lower muscle-damage blood markers, not better performance. The atrial fibrillation finding (Gencer 2021) comes from people averaging 65 years with heart risk, not young athletes. Possible bleeding tendency and stomach upset; ask a clinician if you take blood thinners. Galpin (context) cites 2-5 g; Johnson (n-of-1, context) lists 800 mg. Not medical advice: talk to your doctor or a registered dietitian.",
  }),

  "supplements.magnesium": rule<MagnesiumParams>({
    id: "supplements.magnesium",
    area: "supplements",
    statement:
      "Magnesium: the RDA for men is 400 mg a day at ages 19-30 and 420 mg from 31, from food and supplements together. From supplements alone, stay at or under 350 mg of elemental magnesium a day. Sleep benefits are small, seen mostly in older adults or people low in magnesium.",
    why: "Most people get enough from food; more from pills mainly risks an upset stomach.",
    params: { rdaMgMen: { "19-30": 400, "31+": 420 }, ageBands: [19, 30, 31], supplementUlMg: 350 },
    evidence: "consensus",
    citations: [
      {
        authors: "Institute of Medicine (US) Standing Committee on the Scientific Evaluation of Dietary Reference Intakes",
        year: 1997,
        title: "Dietary Reference Intakes for Calcium, Phosphorus, Magnesium, Vitamin D, and Fluoride",
        venue: "National Academies Press, Washington DC",
        url: "https://doi.org/10.17226/5776",
        doi: "10.17226/5776",
        evidence: "consensus",
      },
      {
        authors: "Mah J, Pitre T",
        year: 2021,
        title: "Oral magnesium supplementation for insomnia in older adults: a Systematic Review & Meta-Analysis",
        venue: "BMC Complement Med Ther 21:125",
        url: "https://doi.org/10.1186/s12906-021-03297-z",
        doi: "10.1186/s12906-021-03297-z",
        evidence: "meta-analysis",
      },
      {
        authors: "Wang R, Chen C, Liu W, Zhou T, Xun P, He K, Chen P",
        year: 2017,
        title: "The effect of magnesium supplementation on muscle fitness: a meta-analysis and systematic review",
        venue: "Magnes Res 30(4):120-132",
        url: "https://doi.org/10.1684/mrh.2018.0430",
        doi: "10.1684/mrh.2018.0430",
        evidence: "meta-analysis",
      },
      {
        authors: "Arab A, Rafie N, Amani R, Shirani F",
        year: 2023,
        title: "The Role of Magnesium in Sleep Health: a Systematic Review of Available Literature",
        venue: "Biol Trace Elem Res 201(1):121-128",
        url: "https://doi.org/10.1007/s12011-022-03162-1",
        doi: "10.1007/s12011-022-03162-1",
        evidence: "meta-analysis",
      },
      {
        authors: "Schuster J, Cycelskij I, Lopresti A, Hahn A",
        year: 2025,
        title: "Magnesium Bisglycinate Supplementation in Healthy Adults Reporting Poor Sleep: A Randomized, Placebo-Controlled Trial",
        venue: "Nat Sci Sleep 17:2027-2040",
        url: "https://doi.org/10.2147/NSS.S524348",
        doi: "10.2147/NSS.S524348",
        evidence: "trial",
      },
      ctx(GALPIN_NUTRITION_2023),
    ],
    caveat:
      "Mah & Pitre 2021 found sleep onset about 17 min faster in older adults with insomnia (low-quality evidence); Schuster 2025 found a small benefit (d about 0.2) with 250 mg as bisglycinate in poor sleepers; Arab 2023 calls trial results contradictory. Wang 2017 found no strength or power gain in active people with normal magnesium. No meta-analysis covers the glycinate form. Labels often give compound weight, not elemental magnesium; use the elemental figure. Diarrhea is the first sign of too much. Galpin (context) suggests 6 mg/kg, which at 75 kg would exceed the 350 mg supplement limit if all from pills. Not medical advice: talk to your doctor or a registered dietitian, especially with kidney problems or regular medications.",
  }),

  "supplements.vitaminK2": rule<VitaminK2Params>({
    id: "supplements.vitaminK2",
    area: "supplements",
    statement:
      "Vitamin K: the adequate intake is 120 µg a day for men, and no upper limit has been set. K2's bone and vessel benefits are shown mainly in postmenopausal women and patients. If you take a warfarin-type blood thinner, ask your prescriber first: even 10 µg a day of K2 changed clotting.",
    why: "Leafy greens usually cover the need; the one real risk is with blood-thinning drugs.",
    params: { aiUgMen: 120, interactionFromUg: 10 },
    evidence: "consensus",
    citations: [
      {
        authors: "Institute of Medicine (US) Panel on Micronutrients",
        year: 2001,
        title: "Dietary Reference Intakes for Vitamin A, Vitamin K, Arsenic, Boron, Chromium, Copper, Iodine, Iron, Manganese, Molybdenum, Nickel, Silicon, Vanadium, and Zinc",
        venue: "National Academies Press, Washington DC",
        url: "https://doi.org/10.17226/10026",
        doi: "10.17226/10026",
        evidence: "consensus",
      },
      {
        authors: "Huang ZB, Wan SL, Lu YJ, Ning L, Liu C, Fan SW",
        year: 2015,
        title: "Does vitamin K2 play a role in the prevention and treatment of osteoporosis for postmenopausal women: a meta-analysis of randomized controlled trials",
        venue: "Osteoporos Int 26(3):1175-1186",
        url: "https://doi.org/10.1007/s00198-014-2989-6",
        doi: "10.1007/s00198-014-2989-6",
        evidence: "meta-analysis",
      },
      {
        authors: "Lees JS, Chapman FA, Witham MD, Jardine AG, Mark PB",
        year: 2019,
        title: "Vitamin K status, supplementation and vascular disease: a systematic review and meta-analysis",
        venue: "Heart 105(12):938-945",
        url: "https://doi.org/10.1136/heartjnl-2018-313955",
        doi: "10.1136/heartjnl-2018-313955",
        evidence: "meta-analysis",
      },
      {
        authors: "Theuwissen E, Teunissen K, Spronk H, Hamulyák K, Ten Cate H, Shearer M, Vermeer C, Schurgers L",
        year: 2013,
        title: "Effect of low-dose supplements of menaquinone-7 (vitamin K2) on the stability of oral anticoagulant treatment: dose-response relationship in healthy volunteers",
        venue: "J Thromb Haemost 11(6):1085-1092",
        url: "https://doi.org/10.1111/jth.12203",
        doi: "10.1111/jth.12203",
        evidence: "trial",
      },
      {
        authors: "Knapen MHJ, Braam LAJLM, Drummen NE, Bekers O, Hoeks APG, Vermeer C",
        year: 2015,
        title: "Menaquinone-7 supplementation improves arterial stiffness in healthy postmenopausal women",
        venue: "Thromb Haemost 113(5):1135-1144",
        url: "https://doi.org/10.1160/TH14-08-0675",
        doi: "10.1160/TH14-08-0675",
        evidence: "trial",
        role: "context",
      },
    ],
    caveat:
      "There are no K2 trials for bone or vessels in young, healthy athletes. Huang 2015 found bone-density gains only in postmenopausal women with osteoporosis, mostly in Japanese trials, and not confirmed in western countries. Lees 2019 found less vessel calcification but no clear change in stiffness, from small, varied trials. Knapen 2015 (context) studied postmenopausal women. Pairing K2 with D3 is a marketing convention these sources don't test. Vitamin D itself stays on its lab-guided rule. Not medical advice: talk to your doctor or a registered dietitian.",
  }),

  "supplements.collagen": rule<CollagenParams>({
    id: "supplements.collagen",
    area: "supplements",
    statement:
      "Collagen: about 10 g a day of collagen peptides, or 5-15 g of gelatin with 50 mg of vitamin C about 1 h before training, is the dose cited for tendons and joints. In trials, 5-10 g a day modestly eased activity-related joint pain. Collagen lacks tryptophan, so it doesn't count toward your protein targets.",
    why: "Modest help for joints, low risk, but it isn't a complete protein for muscle.",
    params: { peptidesGPerDay: 10, gelatinG: [5, 15], vitaminCMg: 50, hoursBefore: 1, jointPainGPerDay: [5, 10] },
    evidence: "consensus",
    citations: [
      {
        authors: "Maughan RJ, Burke LM, Dvorak J, Larson-Meyer DE, Peeling P, Phillips SM, Rawson ES, Walsh NP, Garthe I, Geyer H, et al.",
        year: 2018,
        title: "IOC consensus statement: dietary supplements and the high-performance athlete",
        venue: "Br J Sports Med 52(7):439-455",
        url: "https://doi.org/10.1136/bjsports-2018-099027",
        doi: "10.1136/bjsports-2018-099027",
        evidence: "consensus",
      },
      {
        authors: "Bischof K, Moitzi AM, Stafilidis S, König D",
        year: 2024,
        title: "Impact of Collagen Peptide Supplementation in Combination with Long-Term Physical Training on Strength, Musculotendinous Remodeling, Functional Recovery, and Body Composition in Healthy Adults: A Systematic Review with Meta-analysis",
        venue: "Sports Med 54(11):2865-2888",
        url: "https://doi.org/10.1007/s40279-024-02079-0",
        doi: "10.1007/s40279-024-02079-0",
        evidence: "meta-analysis",
      },
      {
        authors: "Khatri M, Naughton RJ, Clifford T, Harper LD, Corr L",
        year: 2021,
        title: "The effects of collagen peptide supplementation on body composition, collagen synthesis, and recovery from joint injury and exercise: a systematic review",
        venue: "Amino Acids 53(10):1493-1506",
        url: "https://doi.org/10.1007/s00726-021-03072-x",
        doi: "10.1007/s00726-021-03072-x",
        evidence: "meta-analysis",
      },
      {
        authors: "Shaw G, Lee-Barthel A, Ross ML, Wang B, Baar K",
        year: 2017,
        title: "Vitamin C-enriched gelatin supplementation before intermittent activity augments collagen synthesis",
        venue: "Am J Clin Nutr 105(1):136-143",
        url: "https://doi.org/10.3945/ajcn.116.138594",
        doi: "10.3945/ajcn.116.138594",
        evidence: "trial",
      },
      {
        authors: "Clark KL, Sebastianelli W, Flechsenhar KR, Aukermann DF, Meza F, Millard RL, Deitch JR, Sherbondy PS, Albert A",
        year: 2008,
        title: "24-Week study on the use of collagen hydrolysate as a dietary supplement in athletes with activity-related joint pain",
        venue: "Curr Med Res Opin 24(5):1485-1496",
        url: "https://doi.org/10.1185/030079908X291967",
        doi: "10.1185/030079908X291967",
        evidence: "trial",
      },
      {
        authors: "Zdzieblik D, Oesser S, Gollhofer A, König D",
        year: 2017,
        title: "Improvement of activity-related knee joint discomfort following supplementation of specific collagen peptides",
        venue: "Appl Physiol Nutr Metab 42(6):588-595",
        url: "https://doi.org/10.1139/apnm-2016-0390",
        doi: "10.1139/apnm-2016-0390",
        evidence: "trial",
      },
      {
        authors: "Zdzieblik D, Brame J, Oesser S, Gollhofer A, König D",
        year: 2021,
        title: "The Influence of Specific Bioactive Collagen Peptides on Knee Joint Discomfort in Young Physically Active Adults: A Randomized Controlled Trial",
        venue: "Nutrients 13(2):523",
        url: "https://doi.org/10.3390/nu13020523",
        doi: "10.3390/nu13020523",
        evidence: "trial",
      },
      {
        authors: "Paul C, Leser S, Oesser S",
        year: 2019,
        title: "Significant Amounts of Functional Collagen Peptides Can Be Incorporated in the Diet While Maintaining Indispensable Amino Acid Balance",
        venue: "Nutrients 11(5):1079",
        url: "https://doi.org/10.3390/nu11051079",
        doi: "10.3390/nu11051079",
        evidence: "trial",
      },
      {
        authors: "Praet SFE, Purdam CR, Welvaert M, Vlahovich N, Lovell G, Burke LM, Gaida JE, Manzanero S, Hughes D, Waddington G",
        year: 2019,
        title: "Oral Supplementation of Specific Collagen Peptides Combined with Calf-Strengthening Exercises Enhances Function and Reduces Pain in Achilles Tendinopathy Patients",
        venue: "Nutrients 11(1):76",
        url: "https://doi.org/10.3390/nu11010076",
        doi: "10.3390/nu11010076",
        evidence: "trial",
        role: "context",
      },
      {
        authors: "Bryan Johnson",
        year: 2026,
        title: "Blueprint protocol: daily supplement stack",
        venue: "protocol.bryanjohnson.com (self-experiment, accessed 2026-10-22)",
        url: "https://protocol.bryanjohnson.com",
        evidence: "n-of-1",
        role: "context",
      },
    ],
    caveat:
      "The IOC calls the data few. Shaw 2017 measured a blood marker of collagen making in 8 men, not injuries. Joint-pain gains were modest; several trials and reviews have collagen-industry ties. Bischof 2024 found more fat-free mass with training, possibly connective tissue rather than muscle. Nothing shows collagen prevents tendon or ligament injury in healthy athletes. Praet 2019 (context) was a 20-person pilot in Achilles tendinopathy. Paul 2019 explains why collagen is an incomplete protein. Johnson (n-of-1, context) lists about 11 g. Not medical advice: talk to your doctor or a registered dietitian.",
  }),
});

export type RuleId = keyof typeof RULES;

export const RULE_IDS = Object.keys(RULES) as RuleId[];

export function getRule<K extends RuleId>(id: K): (typeof RULES)[K] {
  const r = RULES[id];
  if (!r) throw new Error(`Unknown rule id: ${String(id)}`);
  return r;
}
