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
