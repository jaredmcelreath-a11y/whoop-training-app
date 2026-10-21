/**
 * Daily adaptation: adjusts the day's planned sessions from readiness(), always applying safety
 * rules before anything else, and records why. Steps, in the Global Constraints order:
 *   1. Pain hold / joint restricted  2. Red day  3. Low streak
 *   4. Yellow day, or a low HRV / elevated RHR trend (at least yellow treatment, applied once)
 *   5. Sleep debt
 * Monotonic: no step ever increases a session's duration or hard minutes. A green streak changes
 * nothing here; progression happens only in week generation, under the ramp caps.
 * Pure: every threshold is a rule param.
 */
import { RULES, type RuleId } from "@/lib/engine/rules/catalog";
import { DOCTOR_NOTE, type Readiness } from "@/lib/engine/readiness";
import type { DraftIntensity, DraftKind, PlannedSessionDraft } from "@/lib/engine/week";

export type AdaptedSession = PlannedSessionDraft & { adjusted: boolean; reasons: { ruleId: string; text: string }[] };

export const NOT_ENOUGH_DATA = "Not enough data yet — following the plan";

// Unit and label constants, not tunable thresholds.
const MIN_PER_HOUR = 60;
const PERCENT = 100;
const HARD: ReadonlySet<DraftIntensity> = new Set<DraftIntensity>(["tempo", "threshold", "intervals"]);
/** Intensity order used so a swap never raises intensity. */
const INTENSITY_RANK: Record<DraftIntensity, number> = { easy: 0, z1: 0, z2: 1, tempo: 2, threshold: 3, intervals: 4, strength: 5 };
const ENDURANCE: ReadonlySet<DraftKind> = new Set<DraftKind>(["swim", "bike", "run"]);
const NOUN: Record<"swim" | "bike" | "run", string> = { swim: "swim", bike: "ride", run: "run" };
/** How a restricted joint status lifts: it is a setting, so logging pain does not clear it. */
const JOINT_CLEAR = `Runs and plyometrics stay off while joint status is restricted in Plan settings. ${DOCTOR_NOTE}`;
const RED_STRENGTH_TITLE = "Mobility + optional light technique";
/** Detail keys that describe hard work; dropped when a session becomes easy. */
const HARD_KEYS = ["hardMin", "structure", "strides"] as const;

type WalkRun = { runMin: number; walkMin: number; reps: number };
type Structure = { warmUpMin: number; hardMin: number; coolDownMin: number };
type Work = { s: PlannedSessionDraft; adjusted: boolean; reasons: { ruleId: string; text: string }[] };

function fmtDuration(min: number): string {
  if (min < MIN_PER_HOUR) return `${min} min`;
  const h = Math.floor(min / MIN_PER_HOUR);
  const m = min % MIN_PER_HOUR;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function enduranceTitle(s: PlannedSessionDraft): string {
  const noun = NOUN[s.kind as keyof typeof NOUN];
  const dur = fmtDuration(s.durationMin);
  const long = Boolean(s.details.long);
  const iv = s.details.intervals as WalkRun | undefined;
  if (s.kind === "run" && iv) return `${long ? "Long walk-run" : "Walk-run"} ${iv.reps}×(${iv.runMin} run/${iv.walkMin} walk)`;
  switch (s.intensity) {
    case "tempo":
      return `Tempo ${noun} ${dur}`;
    case "threshold":
      return `Threshold ${noun} ${dur}`;
    case "intervals":
      return `${cap(noun)} intervals ${dur}`;
    default:
      if (long && s.intensity === "z2") return `Long ${noun} ${dur}`;
      return `Easy ${noun} ${dur}${s.details.strides ? " + strides" : ""}`;
  }
}

/** Remove hard-work details (and the structure note that described them). */
function dropHard(s: PlannedSessionDraft) {
  if (s.details.structure) delete s.details.note;
  for (const k of HARD_KEYS) delete s.details[k];
}

/** Fit an existing walk-run layout into the session's (shorter) duration, as week.ts lays it out. */
function refitWalkRun(s: PlannedSessionDraft) {
  const iv = s.details.intervals as WalkRun | undefined;
  if (!iv) return;
  let { runMin, walkMin } = iv;
  if (runMin + walkMin > s.durationMin) {
    walkMin = Math.min(walkMin, s.durationMin);
    runMin = s.durationMin - walkMin;
  }
  const cycle = runMin + walkMin;
  const reps = cycle > 0 ? Math.floor(s.durationMin / cycle) : 0;
  s.details.intervals = { runMin, walkMin, reps };
  const extra = s.durationMin - reps * cycle;
  if (extra > 0) s.details.extraWalkMin = extra;
  else delete s.details.extraWalkMin;
}

/** Shrink the hard block in proportion to a duration cut; never grows it. */
function scaleHard(s: PlannedSessionDraft, oldMin: number) {
  const st = s.details.structure as Structure | undefined;
  if (!st || oldMin <= 0) return;
  const k = Math.min(1, s.durationMin / oldMin);
  const hardMin = Math.floor(st.hardMin * k);
  const coolDownMin = Math.floor(st.coolDownMin * k);
  const warmUpMin = Math.max(0, s.durationMin - hardMin - coolDownMin);
  s.details.hardMin = hardMin;
  s.details.structure = { warmUpMin, hardMin, coolDownMin };
  s.details.note = `${warmUpMin} min warm-up · ${hardMin} min ${s.intensity} · ${coolDownMin} min cool-down`;
}

/** New duration, never above the current one. */
const shrink = (min: number, to: number) => Math.min(min, Math.max(0, to));

function note(w: Work, ruleId: RuleId, text: string, changed = true) {
  w.reasons.push({ ruleId, text });
  if (changed) w.adjusted = true;
}

type PainStepOptions = {
  /** Today is red: a swapped run becomes mobility rather than a ride. */
  red: boolean;
  /** When nothing is swapped, show the hold on the first non-rest session. */
  flagIdle: boolean;
};

/** Step 1, shared by adapt() and applyPainHold(): pain hold / joint restricted. */
function painStep(work: Work[], r: Pick<Readiness, "painHold" | "jointRestricted">, { red, flagIdle }: PainStepOptions) {
  const RED = RULES["recovery.redSwap"].params;
  // `clear` says how the cause lifts; it ends with the doctor sentence. A pain hold reuses the
  // hold's own reason: clean-day progress, the clear rule and "log your pain daily".
  const causes: { ruleId: RuleId; why: string; flag: string; clear: string }[] = [];
  if (r.painHold) {
    causes.push({ ruleId: "pain.monitoring", why: `${cap(r.painHold.area)} pain hold`, flag: r.painHold.reason, clear: r.painHold.reason });
  }
  if (r.jointRestricted) {
    causes.push({
      ruleId: "pain.jointStatus",
      why: "Joint status restricted",
      flag: `Joint status restricted — no running or plyometrics. ${JOINT_CLEAR}`,
      clear: JOINT_CLEAR,
    });
  }
  if (causes.length) {
    let acted = false;
    for (const w of work) {
      const s = w.s;
      if (s.kind === "run") {
        const from = s.intensity;
        dropHard(s);
        delete s.details.intervals;
        delete s.details.extraWalkMin;
        let what: string;
        if (red) {
          // Red day too: mobility, never a swap to a harder sport.
          s.kind = "mobility";
          s.intensity = "easy";
          s.durationMin = shrink(s.durationMin, RED.maxMin);
          s.title = `Mobility ${fmtDuration(s.durationMin)}`;
          what = `and red recovery — swapped the run for ${s.durationMin} min mobility`;
        } else {
          s.kind = "bike";
          // Never raise intensity: an easier source run keeps its zone.
          s.intensity = INTENSITY_RANK[from] < INTENSITY_RANK.z2 ? from : "z2";
          s.title = enduranceTitle(s);
          what = `— swapped the run for an easy ${s.durationMin} min ride`;
        }
        s.details.swappedFrom = "run";
        for (const c of causes) note(w, c.ruleId, `${c.why} ${what}. ${c.clear}`);
        acted = true;
      } else if (s.details.plyo) {
        delete s.details.plyo;
        for (const c of causes) note(w, c.ruleId, `${c.why} — plyometrics removed. ${c.clear}`);
        acted = true;
      }
    }
    if (!acted && flagIdle) {
      // Nothing to swap: still show the hold so the owner sees it.
      const first = work.find((w) => w.s.kind !== "rest") ?? work[0];
      if (first) for (const c of causes) note(first, c.ruleId, c.flag, false);
    }
  }
}

/**
 * Only step 1 (pain hold / joint restricted) on a day's sessions, for days after today: the
 * Plan tab shows the current week's future days under an active hold. Today's recovery color is
 * not applied (a future day's recovery is unknown), so a run becomes an easy ride, and sessions
 * the hold does not touch get no reason (the week shows the hold once, in a banner).
 */
export function applyPainHold(
  sessions: PlannedSessionDraft[],
  r: Pick<Readiness, "painHold" | "jointRestricted">,
): { sessions: AdaptedSession[] } {
  const work: Work[] = sessions.map((s) => ({ s: structuredClone(s), adjusted: false, reasons: [] }));
  painStep(work, r, { red: false, flagIdle: false });
  return { sessions: work.map((w) => ({ ...w.s, adjusted: w.adjusted, reasons: w.reasons })) };
}

export function adapt(sessions: PlannedSessionDraft[], r: Readiness): { sessions: AdaptedSession[] } {
  const RED = RULES["recovery.redSwap"].params;
  const YELLOW = RULES["recovery.yellowScale"].params;
  const LOW = RULES["recovery.lowStreak"].params;
  const SLEEP = RULES["recovery.sleepDebt"].params;
  const red = r.color === "red";
  const score = r.score === null ? "" : `${r.score}% `;

  const work: Work[] = sessions.map((s) => ({ s: { ...structuredClone(s) }, adjusted: false, reasons: [] }));

  // ---- 1. Pain hold / joint restricted: no runs, no plyometrics ---------------------------
  painStep(work, r, { red, flagIdle: true });

  // ---- 2. Red day: easy z1 or mobility, capped ----------------------------------------------
  if (red) {
    for (const w of work) {
      const s = w.s;
      if (ENDURANCE.has(s.kind)) {
        dropHard(s);
        s.intensity = "z1";
        s.durationMin = shrink(s.durationMin, RED.maxMin);
        refitWalkRun(s);
        s.title = enduranceTitle(s);
        note(w, "recovery.redSwap", `Recovery ${score}(red) — swapped to easy ${s.durationMin} min`);
      } else if (s.kind === "strength") {
        s.kind = "mobility";
        s.intensity = "easy";
        s.durationMin = shrink(s.durationMin, RED.maxMin);
        s.title = RED_STRENGTH_TITLE;
        delete s.details.plyo;
        note(w, "recovery.redSwap", `Recovery ${score}(red) — ${RED_STRENGTH_TITLE.toLowerCase()} instead of lifting`);
      } else if (s.kind === "lower_leg" || s.kind === "core") {
        s.details.optional = true;
        note(w, "recovery.redSwap", `Recovery ${score}(red) — optional today`);
      }
    }
  }

  // ---- 3. Low streak: cut endurance volume ---------------------------------------------------
  // action "rest_or_deload": the day keeps a deload; the reason offers rest as the alternative.
  if (r.lowStreak) {
    const pct = Math.round(LOW.volumeFactor * PERCENT);
    for (const w of work) {
      const s = w.s;
      if (!ENDURANCE.has(s.kind)) continue;
      const old = s.durationMin;
      s.durationMin = shrink(old, Math.round(old * LOW.volumeFactor));
      scaleHard(s, old);
      refitWalkRun(s);
      s.title = enduranceTitle(s);
      note(w, "recovery.lowStreak", `${LOW.days} low-recovery days in a row — cut to ${pct}% (${s.durationMin} min); a rest day is fine too`);
    }
  }

  // ---- 4. Yellow day, or a worrying multi-day trend: shorter, and easy -------------------
  // A low HRV trend or elevated resting HR gives at least yellow treatment on a green or unknown
  // day. Red days are already stricter; the trend is only noted there. Scaling applies once.
  const trends: { ruleId: RuleId; text: string }[] = [];
  const hrvDays = RULES["recovery.hrvTrend"].params.rollingDays;
  const rhrDays = RULES["recovery.rhrTrend"].params.rollingDays;
  if (r.hrvTrend === "low") trends.push({ ruleId: "recovery.hrvTrend", text: `HRV ${hrvDays}-day avg below your baseline — easier day` });
  if (r.rhrElevated === true) trends.push({ ruleId: "recovery.rhrTrend", text: `Resting HR ${rhrDays}-day avg above your baseline — easier day` });
  if (r.color === "yellow" || (trends.length && !red)) {
    for (const w of work) {
      const s = w.s;
      if (!ENDURANCE.has(s.kind)) continue;
      const old = s.durationMin;
      const wasHard = HARD.has(s.intensity) ? s.intensity : null;
      s.durationMin = shrink(old, Math.round(old * YELLOW.durationFactor));
      if (wasHard && YELLOW.dropHighIntensity) {
        dropHard(s);
        s.intensity = "z2";
      } else {
        scaleHard(s, old);
      }
      refitWalkRun(s);
      s.title = enduranceTitle(s);
      const easy = wasHard && YELLOW.dropHighIntensity ? `, easy z2 instead of ${wasHard}` : "";
      const how = `shortened to ${s.durationMin} min${easy}`;
      if (r.color === "yellow") {
        note(w, "recovery.yellowScale", `Recovery ${score}(yellow) — ${how}`);
        for (const x of trends) note(w, x.ruleId, x.text);
      } else {
        trends.forEach((x, i) => note(w, x.ruleId, i === 0 ? `${x.text}: ${how}` : x.text));
      }
    }
  } else if (trends.length) {
    // Red day: the swap already covers it; record the trend as a second cause.
    for (const w of work) if (ENDURANCE.has(w.s.kind)) for (const x of trends) note(w, x.ruleId, x.text, false);
  }

  // ---- 5. Sleep debt: hard sessions later in the week, earlier bedtime ----------------------
  if (r.sleepDebt) {
    const bedtime = "aim for an earlier, consistent bedtime";
    const hard = work.filter((w) => HARD.has(w.s.intensity));
    for (const w of hard) {
      w.s.details.moveLater = true;
      note(w, "recovery.sleepDebt", `Short on sleep over ${SLEEP.windowDays} days — move this hard session later in the week; ${bedtime}`);
    }
    if (!hard.length) {
      const first = work.find((w) => w.s.kind !== "rest") ?? work[0];
      if (first) note(first, "recovery.sleepDebt", `Short on sleep over ${SLEEP.windowDays} days — ${bedtime}`, false);
    }
  }

  // ---- Missing data: follow the plan, say so -------------------------------------------------
  if (r.color === "unknown") {
    for (const w of work) if (!w.reasons.length) note(w, "recovery.color", NOT_ENOUGH_DATA, false);
  }

  return { sessions: work.map((w) => ({ ...w.s, adjusted: w.adjusted, reasons: w.reasons })) };
}
