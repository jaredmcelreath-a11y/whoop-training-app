import { NOT_ENOUGH_DATA } from "@/lib/engine/adapt";
import { RULES } from "@/lib/engine/rules/catalog";
import type { Evidence } from "@/lib/engine/rules/types";
import { detailNotes, EVIDENCE_LABEL } from "./view";

/** Where to log a planned session: strength-type sessions and cardio (with the kind preselected). */
export const isStrengthKind = (kind: string): boolean => kind === "strength" || kind === "lower_leg" || kind === "core";

/** Link plus label for the quick-log button, or null. */
export function sessionLogLink(kind: string): { href: string; label: string } | null {
  const href = sessionLogHref(kind);
  return href ? { href, label: isStrengthKind(kind) ? "Start workout" : "Log it" } : null;
}

export function sessionLogHref(kind: string): string | null {
  if (isStrengthKind(kind)) return "/log/strength";
  if (kind === "swim" || kind === "bike" || kind === "run") return `/log/cardio?kind=${kind}`;
  return null;
}

export type WhyEntry = {
  ruleId: string;
  text: string;
  statement: string;
  evidence: Evidence | null;
  evidenceLabel: string;
  href: string;
};

/** Each reason joined with its rule's statement and evidence level, linking to the library. */
export function whyEntries(reasons: readonly { ruleId: string; text: string }[]): WhyEntry[] {
  const rules = RULES as unknown as Record<string, { statement: string; evidence: Evidence }>;
  return reasons.map((r) => {
    const rule = rules[r.ruleId];
    return {
      ruleId: r.ruleId,
      text: r.text,
      statement: rule?.statement ?? "",
      evidence: rule?.evidence ?? null,
      evidenceLabel: rule ? EVIDENCE_LABEL[rule.evidence] : "",
      href: `/plan/library#${r.ruleId}`,
    };
  });
}

export const sessionNotes = (details: Record<string, unknown>): string[] => detailNotes(details);

/** Valid cardio kinds for ?kind=; anything else falls back to run. */
export function parseCardioKind(raw: string | string[] | undefined): "run" | "bike" | "swim" {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "bike" || v === "swim" ? v : "run";
}

type Reason = { ruleId: string; text: string };

/**
 * Which reasons show inline and which go in the Why sheet.
 * - badge: the first reason of an adjusted session, shown with the Adjusted badge.
 * - subtle: the "not enough data" reason, shown quietly and kept out of the sheet.
 * - lines: pain and sleep-debt reasons not already shown, always visible in full.
 * - sheet: every reason except "not enough data".
 */
export function reasonView(adjusted: boolean, reasons: readonly Reason[]) {
  const first = reasons[0];
  const isUnknown = (r: Reason) => r.text === NOT_ENOUGH_DATA;
  const badge = adjusted && first && !isUnknown(first) ? first : null;
  const subtle = first && isUnknown(first) && !badge ? first : null;
  const lines = reasons.filter(
    (r) => r !== badge && (r.ruleId.startsWith("pain.") || r.ruleId === "recovery.sleepDebt"),
  );
  return { badge, subtle, lines, sheet: whyEntries(reasons.filter((r) => !isUnknown(r))) };
}

const isDone = (s: { status: string; completedRef: string | null }) => s.status === "done" || s.completedRef !== null;

/** Today's card order: finished work, the session to do now, then what follows. Rest rows are left out. */
export function splitDay<S extends { kind: string; status: string; completedRef: string | null }>(
  sessions: readonly S[],
): { done: S[]; current: S | null; later: S[] } {
  const work = sessions.filter((s) => s.kind !== "rest");
  const done = work.filter(isDone);
  const [current = null, ...later] = work.filter((s) => !isDone(s));
  return { done, current, later };
}

/** Only a hand check can be undone; a completion from a log or WHOOP stays. */
export const canUncheck = (s: { completedManual: boolean; completedRef: string | null }): boolean =>
  s.completedManual && s.completedRef === null;

type Snapshot = { kind: string; title: string; durationMin: number; intensity: string };
type ChangeReason = { ruleId: string; text: string };
export type ChangeView = { before: Snapshot; now: Snapshot | null; reasons: ChangeReason[] };

const snap = (s: Snapshot): Snapshot => ({ kind: s.kind, title: s.title, durationMin: s.durationMin, intensity: s.intensity });

/**
 * The before/now view for a session the plan changed, or null. Today (and a hold day) carries
 * `before` from adaptation; a past day passes its logged change, whose `now` may be missing.
 */
export function changeFor(
  s: Snapshot & { adjusted: boolean; before?: Snapshot; reasons: ChangeReason[] },
  logged?: { now: Snapshot | null; reasons: ChangeReason[] },
): ChangeView | null {
  if (s.adjusted && s.before) return { before: s.before, now: snap(s), reasons: s.reasons };
  if (logged) return { before: snap(s), now: logged.now, reasons: logged.reasons };
  return null;
}

/**
 * The quick-log link for a session, kept on a hand check (logging it then upgrades the check)
 * and dropped once a log or WHOOP workout completed it.
 */
export function logLinkFor(s: {
  kind: string;
  status: string;
  completedRef: string | null;
  completedManual: boolean;
}): { href: string; label: string } | null {
  if (isDone(s) && !canUncheck(s)) return null;
  return sessionLogLink(s.kind);
}
