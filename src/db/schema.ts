import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });

export type ZoneMs = { z0: number; z1: number; z2: number; z3: number; z4: number; z5: number };

export const whoopConnection = pgTable("whoop_connection", {
  id: integer("id").primaryKey().default(1),
  whoopUserId: bigint("whoop_user_id", { mode: "number" }),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  expiresAt: ts("expires_at").notNull(),
  scope: text("scope").notNull(),
  status: text("status", { enum: ["connected", "needs_reconnect"] })
    .notNull()
    .default("connected"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const whoopRaw = pgTable(
  "whoop_raw",
  {
    resource: text("resource", {
      enum: ["recovery", "sleep", "cycle", "workout", "body", "profile"],
    }).notNull(),
    id: text("id").notNull(),
    payload: jsonb("payload").notNull(),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.resource, t.id] })],
);

export const cycles = pgTable("cycles", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  start: ts("start").notNull(),
  end: ts("end"),
  timezoneOffset: text("timezone_offset").notNull(),
  scoreState: text("score_state").notNull(),
  strain: doublePrecision("strain"),
  kilojoule: doublePrecision("kilojoule"),
  kcal: doublePrecision("kcal"),
  avgHr: integer("avg_hr"),
  maxHr: integer("max_hr"),
});

export const recoveries = pgTable("recoveries", {
  cycleId: bigint("cycle_id", { mode: "number" }).primaryKey(),
  sleepId: text("sleep_id").notNull(),
  scoreState: text("score_state").notNull(),
  recoveryScore: doublePrecision("recovery_score"),
  rhr: doublePrecision("rhr"),
  hrvRmssdMs: doublePrecision("hrv_rmssd_ms"),
  spo2Pct: doublePrecision("spo2_pct"),
  skinTempC: doublePrecision("skin_temp_c"),
  userCalibrating: boolean("user_calibrating"),
});

export const sleeps = pgTable("sleeps", {
  id: text("id").primaryKey(),
  cycleId: bigint("cycle_id", { mode: "number" }),
  start: ts("start").notNull(),
  end: ts("end").notNull(),
  timezoneOffset: text("timezone_offset").notNull(),
  nap: boolean("nap").notNull().default(false),
  scoreState: text("score_state").notNull(),
  asleepMin: doublePrecision("asleep_min"),
  lightMin: doublePrecision("light_min"),
  swsMin: doublePrecision("sws_min"),
  remMin: doublePrecision("rem_min"),
  awakeMin: doublePrecision("awake_min"),
  performancePct: doublePrecision("performance_pct"),
  consistencyPct: doublePrecision("consistency_pct"),
  efficiencyPct: doublePrecision("efficiency_pct"),
  respiratoryRate: doublePrecision("respiratory_rate"),
  needBaselineMin: doublePrecision("need_baseline_min"),
  needDebtMin: doublePrecision("need_debt_min"),
  needStrainMin: doublePrecision("need_strain_min"),
  needNapMin: doublePrecision("need_nap_min"),
});

export const workouts = pgTable("workouts", {
  id: text("id").primaryKey(),
  start: ts("start").notNull(),
  end: ts("end").notNull(),
  timezoneOffset: text("timezone_offset").notNull(),
  sportName: text("sport_name"),
  sportId: integer("sport_id"),
  scoreState: text("score_state").notNull(),
  strain: doublePrecision("strain"),
  avgHr: integer("avg_hr"),
  maxHr: integer("max_hr"),
  kilojoule: doublePrecision("kilojoule"),
  kcal: doublePrecision("kcal"),
  distanceM: doublePrecision("distance_m"),
  altitudeGainM: doublePrecision("altitude_gain_m"),
  zoneMs: jsonb("zone_ms").$type<ZoneMs>(),
});

export const webhookEvents = pgTable("webhook_events", {
  traceId: text("trace_id").primaryKey(),
  type: text("type").notNull(),
  objectId: text("object_id").notNull(),
  userId: bigint("user_id", { mode: "number" }),
  receivedAt: ts("received_at").notNull().defaultNow(),
  processedAt: ts("processed_at"),
  error: text("error"),
});

export const syncState = pgTable("sync_state", {
  key: text("key").primaryKey(),
  lastSyncedAt: ts("last_synced_at").notNull(),
});

const id = () => uuid("id").primaryKey().defaultRandom();
const day = (name: string) => date(name, { mode: "string" });

export const exercises = pgTable("exercises", {
  id: id(),
  name: text("name").notNull().unique(),
  category: text("category", {
    enum: ["strength", "bodyweight", "plyo", "core", "mobility"],
  }).notNull(),
  archived: boolean("archived").notNull().default(false),
  /** Big multi-joint lift or single-joint one; picks the rep range (strength.repRange). */
  pattern: text("pattern", { enum: ["compound", "isolation"] }),
  /** This exercise's smallest load step in lb; null means strength.progression.defaultIncrementLb. */
  incrementLb: doublePrecision("increment_lb"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const strengthSessions = pgTable("strength_sessions", {
  id: id(),
  startedAt: ts("started_at").notNull(),
  endedAt: ts("ended_at"),
  localDate: day("local_date").notNull(),
  notes: text("notes"),
  whoopWorkoutId: text("whoop_workout_id"),
});

export const strengthSets = pgTable("strength_sets", {
  id: id(),
  clientId: uuid("client_id").notNull().unique(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => strengthSessions.id, { onDelete: "cascade" }),
  exerciseId: uuid("exercise_id")
    .notNull()
    .references(() => exercises.id, { onDelete: "restrict" }),
  setIndex: integer("set_index").notNull(),
  reps: integer("reps").notNull(),
  weightLb: doublePrecision("weight_lb"),
  completedAt: ts("completed_at").notNull(),
});

export const cardioEntries = pgTable("cardio_entries", {
  id: id(),
  kind: text("kind", { enum: ["run", "bike", "swim"] }).notNull(),
  startedAt: ts("started_at").notNull(),
  localDate: day("local_date").notNull(),
  durationS: integer("duration_s").notNull(),
  distanceM: doublePrecision("distance_m"),
  avgWatts: integer("avg_watts"),
  inclinePct: doublePrecision("incline_pct"),
  poolLengthM: doublePrecision("pool_length_m"),
  indoor: boolean("indoor").notNull().default(false),
  notes: text("notes"),
  whoopWorkoutId: text("whoop_workout_id"),
});

export const weightEntries = pgTable("weight_entries", {
  localDate: day("local_date").primaryKey(),
  weightLb: doublePrecision("weight_lb").notNull(),
  loggedAt: ts("logged_at").notNull().defaultNow(),
});

export const painEntries = pgTable("pain_entries", {
  id: id(),
  loggedAt: ts("logged_at").notNull().defaultNow(),
  localDate: day("local_date").notNull(),
  area: text("area").notNull(),
  side: text("side", { enum: ["left", "right", "both"] }).notNull(),
  score: integer("score").notNull(),
  context: text("context", { enum: ["before_run", "after_run", "daily"] }).notNull(),
  cardioEntryId: uuid("cardio_entry_id").references(() => cardioEntries.id, {
    onDelete: "set null",
  }),
});

export const weeklyMetrics = pgTable("weekly_metrics", {
  weekStart: day("week_start").primaryKey(),
  vo2max: doublePrecision("vo2max"),
  whoopAge: doublePrecision("whoop_age"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const bodyScans = pgTable("body_scans", {
  id: id(),
  scannedOn: day("scanned_on").notNull(),
  weightLb: doublePrecision("weight_lb"),
  leanMassLb: doublePrecision("lean_mass_lb"),
  skeletalMuscleLb: doublePrecision("skeletal_muscle_lb"),
  fatMassLb: doublePrecision("fat_mass_lb"),
  bodyFatPct: doublePrecision("body_fat_pct"),
  bmrKcal: doublePrecision("bmr_kcal"),
  teeKcal: doublePrecision("tee_kcal"),
  visceralFatLevel: integer("visceral_fat_level"),
  extras: jsonb("extras"),
  source: text("source").notNull(),
});

export const labPanels = pgTable("lab_panels", {
  id: id(),
  drawnOn: day("drawn_on").notNull(),
  source: text("source").notNull(),
});

export const labResults = pgTable(
  "lab_results",
  {
    id: id(),
    panelId: uuid("panel_id")
      .notNull()
      .references(() => labPanels.id, { onDelete: "cascade" }),
    marker: text("marker").notNull(),
    value: doublePrecision("value").notNull(),
    unit: text("unit").notNull(),
    flag: text("flag"),
  },
  (t) => [unique("lab_results_panel_marker_unique").on(t.panelId, t.marker)],
);

export type PlanWindow = { start: string; end: string };
export type SessionKind =
  | "swim"
  | "bike"
  | "run"
  | "strength"
  | "lower_leg"
  | "core"
  | "mobility"
  | "rest";
export type SessionIntensity =
  | "z1"
  | "z2"
  | "tempo"
  | "threshold"
  | "intervals"
  | "strength"
  | "easy";

export const planSettings = pgTable(
  "plan_settings",
  {
    id: integer("id").primaryKey().default(1),
    raceDate: day("race_date").notNull(),
    seasonStart: day("season_start").notNull(),
    windows: jsonb("windows").$type<PlanWindow[]>().notNull(),
    longRideDow: integer("long_ride_dow").notNull(),
    longRunDow: integer("long_run_dow").notNull(),
    restDow: integer("rest_dow").notNull(),
    jointStatus: text("joint_status", {
      enum: ["unrestricted", "caution", "restricted"],
    }).notNull(),
    poolLengthM: doublePrecision("pool_length_m").notNull(),
    /** "HH:MM"; null derives wake from the first training window. */
    wakeTime: text("wake_time"),
    /** "left" | "right" | "both"; null shows the side picker on the pain form. */
    painSide: text("pain_side"),
    /** How the pool length is shown: "yd" | "m" | "ft"; storage stays in meters. */
    poolUnit: text("pool_unit"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [check("plan_settings_single_row", sql`${t.id} = 1`)],
);

export const plannedSessions = pgTable(
  "planned_sessions",
  {
    id: id(),
    localDate: day("local_date").notNull(),
    slot: integer("slot").notNull(),
    kind: text("kind", {
      enum: ["swim", "bike", "run", "strength", "lower_leg", "core", "mobility", "rest"],
    })
      .$type<SessionKind>()
      .notNull(),
    title: text("title").notNull(),
    durationMin: integer("duration_min").notNull(),
    intensity: text("intensity", {
      enum: ["z1", "z2", "tempo", "threshold", "intervals", "strength", "easy"],
    })
      .$type<SessionIntensity>()
      .notNull(),
    details: jsonb("details").notNull(),
    ruleIds: text("rule_ids").array().notNull(),
    weekStart: day("week_start").notNull(),
    generatedAt: ts("generated_at").notNull().defaultNow(),
    status: text("status", { enum: ["planned", "done", "skipped"] })
      .notNull()
      .default("planned"),
    completedRef: text("completed_ref"),
    /** Checked off by hand; cleared when a logged entry or WHOOP workout later matches. */
    completedManual: boolean("completed_manual").notNull().default(false),
  },
  (t) => [unique("planned_sessions_date_slot_unique").on(t.localDate, t.slot)],
);

export const recommendationLog = pgTable(
  "recommendation_log",
  {
    id: id(),
    localDate: day("local_date").notNull(),
    plannedSessionId: uuid("planned_session_id").references(() => plannedSessions.id, {
      onDelete: "set null",
    }),
    ruleId: text("rule_id").notNull(),
    inputs: jsonb("inputs").notNull(),
    effect: text("effect").notNull(),
    /** The session as adapted that day (a per-session row whose session changed), for the before/now view. */
    adapted: jsonb("adapted"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("recommendation_log_date_session_rule_unique")
      .on(t.localDate, t.plannedSessionId, t.ruleId)
      .nullsNotDistinct(),
  ],
);

export type NutrientValue = { value: number; unit: string };
export type SupplementTiming = "morning" | "with_meal" | "pre_workout" | "post_workout" | "evening";
export type Supplement = { name: string; timing: SupplementTiming; amount?: string | null };

export const nutritionDays = pgTable("nutrition_days", {
  localDate: day("local_date").primaryKey(),
  sentAt: ts("sent_at").notNull(),
  source: text("source").notNull(),
  kcal: doublePrecision("kcal"),
  proteinG: doublePrecision("protein_g"),
  carbsG: doublePrecision("carbs_g"),
  fatG: doublePrecision("fat_g"),
  fiberG: doublePrecision("fiber_g"),
  waterMl: doublePrecision("water_ml"),
  micros: jsonb("micros").$type<Record<string, NutrientValue>>().notNull().default({}),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const waterEntries = pgTable("water_entries", {
  id: id(),
  clientId: uuid("client_id").notNull().unique(),
  loggedAt: ts("logged_at").notNull(),
  localDate: day("local_date").notNull(),
  ml: doublePrecision("ml").notNull(),
});

export const nutritionSettings = pgTable(
  "nutrition_settings",
  {
    id: integer("id").primaryKey().default(1),
    refProfile: text("ref_profile", {
      enum: ["male_19_30", "female_19_30", "male_31_50", "female_31_50"],
    }),
    mealsPerDay: integer("meals_per_day").notNull().default(4),
    waterSource: text("water_source", { enum: ["app", "cronometer", "both"] })
      .notNull()
      .default("app"),
    supplements: jsonb("supplements").$type<Supplement[]>().notNull().default([]),
    gainGoalLb: doublePrecision("gain_goal_lb").notNull().default(15),
    gainStartWeightLb: doublePrecision("gain_start_weight_lb"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [check("nutrition_settings_single_row", sql`${t.id} = 1`)],
);

export const sweatTests = pgTable("sweat_tests", {
  id: id(),
  testedOn: day("tested_on").notNull(),
  preLb: doublePrecision("pre_lb").notNull(),
  postLb: doublePrecision("post_lb").notNull(),
  fluidMl: doublePrecision("fluid_ml").notNull(),
  durationMin: doublePrecision("duration_min").notNull(),
  kind: text("kind", { enum: ["run", "bike", "swim"] }).notNull(),
  sweatRateLph: doublePrecision("sweat_rate_lph").notNull(),
  notes: text("notes"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export const energyEstimates = pgTable("energy_estimates", {
  weekStart: day("week_start").primaryKey(),
  tdeeKcal: doublePrecision("tdee_kcal").notNull(),
  confidence: text("confidence", { enum: ["low", "medium", "high"] }).notNull(),
  method: text("method", { enum: ["initial", "calibrated"] }).notNull(),
  inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});
