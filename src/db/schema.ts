import {
  bigint,
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
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
