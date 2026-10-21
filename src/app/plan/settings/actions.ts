"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { localDate } from "@/lib/log/dates";
import { regenerateFuture } from "@/lib/plan/service";
import { getPlanSettings, updatePlanSettings } from "@/lib/plan/settings";
import { settingsFromForm } from "@/lib/plan/view";

/** `savedAt` changes on every save so the form remounts with the saved values. */
export type PlanSettingsState = { ok?: true; error?: string; savedAt?: number };

/** Validates and saves the plan settings, then re-plans every week from today on. */
export async function savePlanSettings(_prev: PlanSettingsState, formData: FormData): Promise<PlanSettingsState> {
  if (!(await requireSession())) return { error: "Not signed in" };
  const db = getDb();
  const tz = getEnv().OWNER_TZ;
  const now = new Date();
  const current = await getPlanSettings(db, now, tz);
  const parsed = settingsFromForm(formData, current);
  if (!parsed.ok) return { error: parsed.error };
  // Errors are logged here and never echoed: the form already showed every validation message.
  try {
    await updatePlanSettings(db, parsed.settings);
  } catch (e) {
    console.error("savePlanSettings: saving failed", e);
    return { error: "Could not save the settings — please try again." };
  }
  try {
    await regenerateFuture(db, localDate(now, tz), now, tz);
  } catch (e) {
    console.error("savePlanSettings: re-planning failed", e);
    revalidatePath("/plan", "layout");
    revalidatePath("/");
    return { error: "Settings saved, but re-planning failed — please save again." };
  }
  revalidatePath("/plan", "layout");
  revalidatePath("/");
  return { ok: true, savedAt: Date.now() };
}
