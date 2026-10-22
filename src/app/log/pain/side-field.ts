import type { PlanSettings } from "@/lib/plan/settings";

/** Whether the pain form asks for a side: a saved Pain Side hides the picker and is submitted as-is. */
export function sideField(painSide: PlanSettings["painSide"]): { hidden: true; value: NonNullable<PlanSettings["painSide"]> } | { hidden: false } {
  return painSide ? { hidden: true, value: painSide } : { hidden: false };
}
