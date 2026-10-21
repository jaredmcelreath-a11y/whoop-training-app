import type { ZoneMs } from "@/db/schema";
import { cycles, recoveries, sleeps, workouts } from "@/db/schema";

// Field names are a best guess from WHOOP_API_NOTES.md; verify against real data (Task 11).
type Scored<S> = { score_state: string; score?: S | null };

export type CyclePayload = Scored<{
  strain?: number;
  kilojoule?: number;
  average_heart_rate?: number;
  max_heart_rate?: number;
}> & { id: number; start: string; end?: string | null; timezone_offset: string };

export type RecoveryPayload = Scored<{
  user_calibrating?: boolean;
  recovery_score?: number;
  resting_heart_rate?: number;
  hrv_rmssd_milli?: number;
  spo2_percentage?: number;
  skin_temp_celsius?: number;
}> & { cycle_id: number; sleep_id: string };

export type SleepPayload = Scored<{
  stage_summary?: {
    total_awake_time_milli?: number;
    total_light_sleep_time_milli?: number;
    total_slow_wave_sleep_time_milli?: number;
    total_rem_sleep_time_milli?: number;
  };
  sleep_needed?: {
    baseline_milli?: number;
    need_from_sleep_debt_milli?: number;
    need_from_recent_strain_milli?: number;
    need_from_recent_nap_milli?: number;
  };
  respiratory_rate?: number;
  sleep_performance_percentage?: number;
  sleep_consistency_percentage?: number;
  sleep_efficiency_percentage?: number;
}> & {
  id: string;
  cycle_id?: number | null;
  start: string;
  end: string;
  timezone_offset: string;
  nap?: boolean;
};

export type WorkoutPayload = Scored<{
  strain?: number;
  average_heart_rate?: number;
  max_heart_rate?: number;
  kilojoule?: number;
  distance_meter?: number;
  altitude_gain_meter?: number;
  zone_durations?: {
    zone_zero_milli?: number;
    zone_one_milli?: number;
    zone_two_milli?: number;
    zone_three_milli?: number;
    zone_four_milli?: number;
    zone_five_milli?: number;
  };
}> & {
  id: string;
  start: string;
  end: string;
  timezone_offset: string;
  sport_name?: string | null;
  sport_id?: number | null;
};

const n = (v: number | null | undefined): number | null => (typeof v === "number" ? v : null);
const min = (ms: number | null | undefined): number | null =>
  typeof ms === "number" ? Math.round(ms / 60000) : null;
const kcal = (kj: number | null | undefined): number | null =>
  typeof kj === "number" ? Math.round((kj / 4.184) * 10) / 10 : null;

export function normalizeCycle(p: CyclePayload): typeof cycles.$inferInsert {
  const s = p.score ?? null;
  return {
    id: p.id,
    start: new Date(p.start),
    end: p.end ? new Date(p.end) : null,
    timezoneOffset: p.timezone_offset,
    scoreState: p.score_state,
    strain: n(s?.strain),
    kilojoule: n(s?.kilojoule),
    kcal: kcal(s?.kilojoule),
    avgHr: n(s?.average_heart_rate),
    maxHr: n(s?.max_heart_rate),
  };
}

export function normalizeRecovery(p: RecoveryPayload): typeof recoveries.$inferInsert {
  const s = p.score ?? null;
  return {
    cycleId: p.cycle_id,
    sleepId: p.sleep_id,
    scoreState: p.score_state,
    recoveryScore: n(s?.recovery_score),
    rhr: n(s?.resting_heart_rate),
    hrvRmssdMs: n(s?.hrv_rmssd_milli),
    spo2Pct: n(s?.spo2_percentage),
    skinTempC: n(s?.skin_temp_celsius),
    userCalibrating: typeof s?.user_calibrating === "boolean" ? s.user_calibrating : null,
  };
}

export function normalizeSleep(p: SleepPayload): typeof sleeps.$inferInsert {
  const s = p.score ?? null;
  const st = s?.stage_summary;
  const need = s?.sleep_needed;
  const light = min(st?.total_light_sleep_time_milli);
  const sws = min(st?.total_slow_wave_sleep_time_milli);
  const rem = min(st?.total_rem_sleep_time_milli);
  const asleep = light === null || sws === null || rem === null ? null : light + sws + rem;
  return {
    id: p.id,
    cycleId: p.cycle_id ?? null,
    start: new Date(p.start),
    end: new Date(p.end),
    timezoneOffset: p.timezone_offset,
    nap: p.nap ?? false,
    scoreState: p.score_state,
    asleepMin: asleep,
    lightMin: light,
    swsMin: sws,
    remMin: rem,
    awakeMin: min(st?.total_awake_time_milli),
    performancePct: n(s?.sleep_performance_percentage),
    consistencyPct: n(s?.sleep_consistency_percentage),
    efficiencyPct: n(s?.sleep_efficiency_percentage),
    respiratoryRate: n(s?.respiratory_rate),
    needBaselineMin: min(need?.baseline_milli),
    needDebtMin: min(need?.need_from_sleep_debt_milli),
    needStrainMin: min(need?.need_from_recent_strain_milli),
    needNapMin: min(need?.need_from_recent_nap_milli),
  };
}

export function normalizeWorkout(p: WorkoutPayload): typeof workouts.$inferInsert {
  const s = p.score ?? null;
  const z = s?.zone_durations;
  const zoneMs: ZoneMs | null = z
    ? {
        z0: z.zone_zero_milli ?? 0,
        z1: z.zone_one_milli ?? 0,
        z2: z.zone_two_milli ?? 0,
        z3: z.zone_three_milli ?? 0,
        z4: z.zone_four_milli ?? 0,
        z5: z.zone_five_milli ?? 0,
      }
    : null;
  return {
    id: p.id,
    start: new Date(p.start),
    end: new Date(p.end),
    timezoneOffset: p.timezone_offset,
    sportName: p.sport_name ?? null,
    sportId: p.sport_id ?? null,
    scoreState: p.score_state,
    strain: n(s?.strain),
    avgHr: n(s?.average_heart_rate),
    maxHr: n(s?.max_heart_rate),
    kilojoule: n(s?.kilojoule),
    kcal: kcal(s?.kilojoule),
    distanceM: n(s?.distance_meter),
    altitudeGainM: n(s?.altitude_gain_meter),
    zoneMs,
  };
}
