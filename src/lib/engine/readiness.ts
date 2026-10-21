/**
 * Daily readiness: classifies today's WHOOP recovery, HRV/RHR trends against the personal
 * baseline, low and green streaks, sleep debt, pain and joint status. Pure: every input is a
 * parameter and every threshold is a rule param. `fired` lists the rules adapt() will act on.
 */
import { RULES, type RuleId } from "@/lib/engine/rules/catalog";
import type { PlanSettings } from "@/lib/plan/settings";

export type PainInput = { area: string; date: string; max: number; context: string };

export type DayInputs = {
  /** Today, owner-local YYYY-MM-DD. */
  date: string;
  recoveryScore: number | null;
  recoveryState: string | null;
  /** 7-day mean of ln rMSSD; callers pass null with fewer than recovery.hrvTrend.minNightsInWindow nights. */
  hrvLn7: number | null;
  /** ln rMSSD baseline over up to recovery.hrvTrend.baselineMaxDays days. */
  hrvBaseline: { mean: number; sd: number; days: number } | null;
  rhr7: number | null;
  rhrBaseline: number | null;
  sleepDebtMin3d: number | null;
  /** Last 7 recovery scores, oldest first (today last). */
  recentScores: (number | null)[];
  /** Pain entries from the last 90 local days (Ruling 14a; loadDayInputs passes them). */
  pain: PainInput[];
  jointStatus: PlanSettings["jointStatus"];
};

export type Color = "green" | "yellow" | "red" | "unknown";
export type Fired = { ruleId: RuleId; inputs: Record<string, unknown> };

export type Readiness = {
  color: Color;
  /** Today's recovery score when it counts (SCORED), else null. */
  score: number | null;
  hrvTrend: "low" | "normal" | "high" | "unknown";
  rhrElevated: boolean | null;
  lowStreak: boolean;
  greenStreak: boolean;
  sleepDebt: boolean;
  painHold: { area: string; reason: string } | null;
  /** pain.jointStatus "restricted": any run that reaches adapt() is treated as a hold. */
  jointRestricted: boolean;
  fired: Fired[];
};

export const DOCTOR_NOTE = "If this keeps up, consider talking to your doctor.";
export const LOG_DAILY = "Log your pain daily to clear this hold.";
const SCORED = "SCORED";
const AFTER_RUN = "after_run";

function colorOf(score: number): Exclude<Color, "unknown"> {
  const { green, yellow } = RULES["recovery.color"].params;
  if (score >= green) return "green";
  if (score >= yellow) return "yellow";
  return "red";
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

type AreaHold = { area: string; triggers: string[]; cleanDays: number; inputs: Record<string, unknown> };

/**
 * Per-area pain hold (pain.monitoring). Trigger entries are (a) any entry above maxDuring, and
 * (b) an after-run entry that closes a run of risingSessions strictly increasing after-run
 * entries ending above zero. The hold clears only once holdUntilBelowDays DISTINCT local dates
 * after the last trigger date have logged entries for that area (all ≤ maxDuring, else they would
 * be triggers). Not logging never clears a hold. Entries after `date` are ignored; the caller's
 * pain window (last 90 days, Ruling 14a) bounds how long an unlogged hold can last.
 */
function painHolds(date: string, pain: PainInput[]): AreaHold[] {
  const { maxDuring, risingSessions, holdUntilBelowDays } = RULES["pain.monitoring"].params;
  const upToToday = pain
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.date <= date)
    .sort((a, b) => (a.p.date < b.p.date ? -1 : a.p.date > b.p.date ? 1 : a.i - b.i))
    .map(({ p }) => p);
  const areas = [...new Set(upToToday.map((p) => p.area))].sort();
  const out: AreaHold[] = [];
  for (const area of areas) {
    const mine = upToToday.filter((p) => p.area === area);
    let over: PainInput | null = null;
    let rising: PainInput[] | null = null;
    for (const p of mine) if (p.max > maxDuring) over = p;
    const runs = mine.filter((p) => p.context === AFTER_RUN);
    for (let end = risingSessions; end <= runs.length; end++) {
      const seq = runs.slice(end - risingSessions, end);
      const up = seq.every((p, i) => i === 0 || p.max > seq[i - 1].max) && seq[seq.length - 1].max > 0;
      if (up) rising = seq;
    }
    const risingAt = rising ? rising[rising.length - 1] : null;
    const lastTrigger = [over, risingAt].filter((p): p is PainInput => p !== null).map((p) => p.date).sort().pop();
    if (lastTrigger === undefined) continue;
    const cleanDays = new Set(mine.filter((p) => p.date > lastTrigger).map((p) => p.date)).size;
    if (cleanDays >= holdUntilBelowDays) continue;
    const triggers: string[] = [];
    if (over) triggers.push(`pain ${over.max}/10 on ${over.date} (above ${maxDuring})`);
    if (rising) triggers.push(`pain rising after runs (${rising.map((p) => p.max).join(" → ")})`);
    out.push({
      area,
      triggers,
      cleanDays,
      inputs: {
        area,
        maxDuring,
        risingSessions,
        holdUntilBelowDays,
        lastTriggerDate: lastTrigger,
        cleanDays,
        ...(over ? { over: { date: over.date, max: over.max, context: over.context } } : {}),
        ...(rising ? { rising: rising.map((p) => ({ date: p.date, max: p.max })) } : {}),
      },
    });
  }
  return out;
}

export function readiness(d: DayInputs): Readiness {
  const COLOR = RULES["recovery.color"].params;
  const HRV = RULES["recovery.hrvTrend"].params;
  const RHR = RULES["recovery.rhrTrend"].params;
  const LOW = RULES["recovery.lowStreak"].params;
  const GREEN = RULES["recovery.greenStreak"].params;
  const SLEEP = RULES["recovery.sleepDebt"].params;
  const PAIN = RULES["pain.monitoring"].params;
  const fired: Fired[] = [];

  // ---- Pain and joint rules first (safety beats progression) --------------------------------
  const holds = painHolds(d.date, d.pain);
  let painHold: Readiness["painHold"] = null;
  if (holds.length) {
    const area = holds.map((h) => h.area).join(", ");
    const parts = holds.map(
      (h) => `${cap(h.area)}: ${h.triggers.join(" and ")} (${h.cleanDays} of ${PAIN.holdUntilBelowDays} clean days logged)`,
    );
    painHold = {
      area,
      reason: `${parts.join("; ")} — runs and plyometrics on hold until pain is logged at ${PAIN.maxDuring}/10 or below on ${PAIN.holdUntilBelowDays} separate days. ${LOG_DAILY} ${DOCTOR_NOTE}`,
    };
    for (const h of holds) fired.push({ ruleId: "pain.monitoring", inputs: h.inputs });
  }
  const jointRestricted = d.jointStatus === "restricted";
  if (jointRestricted) fired.push({ ruleId: "pain.jointStatus", inputs: { jointStatus: d.jointStatus } });

  // ---- Recovery color ------------------------------------------------------------------------
  const score = d.recoveryScore !== null && d.recoveryState === SCORED ? d.recoveryScore : null;
  const color: Color = score === null ? "unknown" : colorOf(score);
  if (color !== "green") {
    fired.push({
      ruleId: "recovery.color",
      inputs: { recoveryScore: d.recoveryScore, recoveryState: d.recoveryState, green: COLOR.green, yellow: COLOR.yellow, color },
    });
  }
  if (color === "yellow") {
    fired.push({ ruleId: "recovery.yellowScale", inputs: { recoveryScore: score, ...RULES["recovery.yellowScale"].params } });
  }
  if (color === "red") fired.push({ ruleId: "recovery.redSwap", inputs: { recoveryScore: score, ...RULES["recovery.redSwap"].params } });

  // ---- HRV and RHR trends: the multi-day trend outweighs one night (at least a yellow day) ----
  let hrvTrend: Readiness["hrvTrend"] = "unknown";
  const b = d.hrvBaseline;
  if (b && b.days >= HRV.baselineMinDays && d.hrvLn7 !== null) {
    const band = HRV.swcSd * b.sd;
    hrvTrend = d.hrvLn7 < b.mean - band ? "low" : d.hrvLn7 > b.mean + band ? "high" : "normal";
  }
  const rhrElevated = d.rhr7 === null || d.rhrBaseline === null ? null : d.rhr7 - d.rhrBaseline >= RHR.elevatedBpm;

  // ---- Streaks ------------------------------------------------------------------------------
  // Only the score streak is used: a low HRV trend lasting `days` days can't be computed from a
  // single day's inputs.
  const lastLow = d.recentScores.slice(-LOW.days);
  const lowStreak = lastLow.length === LOW.days && lastLow.every((s) => s !== null && colorOf(s) === "red");
  if (lowStreak) fired.push({ ruleId: "recovery.lowStreak", inputs: { recentScores: lastLow, days: LOW.days, volumeFactor: LOW.volumeFactor } });
  if (hrvTrend === "low") {
    fired.push({ ruleId: "recovery.hrvTrend", inputs: { hrvLn7: d.hrvLn7, mean: b!.mean, sd: b!.sd, days: b!.days, swcSd: HRV.swcSd } });
  }
  if (rhrElevated) {
    fired.push({ ruleId: "recovery.rhrTrend", inputs: { rhr7: d.rhr7, rhrBaseline: d.rhrBaseline, elevatedBpm: RHR.elevatedBpm } });
  }

  const lastGreen = d.recentScores.slice(-GREEN.days);
  const greenStreak = lastGreen.length === GREEN.days && lastGreen.every((s) => s !== null && s >= COLOR.green);

  // ---- Sleep debt ---------------------------------------------------------------------------
  const sleepDebt = d.sleepDebtMin3d !== null && d.sleepDebtMin3d >= SLEEP.debtMin;

  if (sleepDebt) fired.push({ ruleId: "recovery.sleepDebt", inputs: { sleepDebtMin3d: d.sleepDebtMin3d, ...SLEEP } });

  return { color, score, hrvTrend, rhrElevated, lowStreak, greenStreak, sleepDebt, painHold, jointRestricted, fired };
}
