/**
 * Rule catalog types. Rules are data: every threshold the engine uses lives in
 * a rule's `params`, next to the sources it came from and an honest evidence label.
 */

/**
 * Evidence levels, strongest first (spec §9 source hierarchy):
 * - consensus: a position stand or consensus statement.
 * - meta-analysis: a meta-analysis.
 * - trial: a single study (RCT, cohort, cross-sectional, case comparison, modelling).
 * - expert: an expert explainer or narrative review (e.g. Galpin, Attia, Huberman).
 * - n-of-1: one person's self-experiment (e.g. Bryan Johnson's Blueprint).
 * - practice: common coaching practice or a product convention, no direct study.
 */
export type Evidence = "consensus" | "meta-analysis" | "trial" | "expert" | "n-of-1" | "practice";

/** Evidence levels ordered strongest → weakest. */
export const EVIDENCE_ORDER: readonly Evidence[] = [
  "consensus",
  "meta-analysis",
  "trial",
  "expert",
  "n-of-1",
  "practice",
];

/** Higher number = stronger evidence. */
export function evidenceRank(e: Evidence): number {
  return EVIDENCE_ORDER.length - EVIDENCE_ORDER.indexOf(e);
}

export type Citation = {
  authors: string;
  year: number;
  title: string;
  venue: string;
  url: string;
  doi?: string;
  /** This source's own level. A rule's `evidence` is the strongest of its supporting citations. */
  evidence?: Evidence;
  /**
   * "supports" (default): directly supports the rule's statement and number.
   * "context": mechanistic/modelling work, a different population or outcome,
   * critique, or n-of-1 — shown for context, never counted toward `evidence`.
   */
  role?: "supports" | "context";
};

/** Deeply readonly view of a value (used to freeze the catalog). */
export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends readonly unknown[]
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T;

export type RuleArea =
  | "season"
  | "volume"
  | "intensity"
  | "strength"
  | "recovery"
  | "pain"
  | "concurrent"
  | "lower_leg"
  | "week";

export type Rule<P> = {
  id: string;
  area: RuleArea;
  statement: string;
  /** ≤120 chars, plain language, shown in the UI. */
  why: string;
  params: P;
  evidence: Evidence;
  /** ≥1 supporting citation unless evidence === "practice". */
  citations: Citation[];
  caveat?: string;
};
