/** The setup items getDayNutrition can list in `needs`; the Today card links each one to its fix. */
import { RULES } from "@/lib/engine/rules/catalog";

export const NEED = {
  weight: "Log a weight",
  scan: "Add a body scan for lean mass",
  gainWeight: "Log your weight to track the gain goal",
  gainStart: "Set a gain start weight to track the gain goal",
  burn: `Sync at least ${RULES["nutrition.initialTdee"].params.whoopDaysMin} days of WHOOP data or add a body scan with BMR to estimate your burn`,
  profile: "Set your reference-intake profile",
} as const;

export type Need = (typeof NEED)[keyof typeof NEED];
