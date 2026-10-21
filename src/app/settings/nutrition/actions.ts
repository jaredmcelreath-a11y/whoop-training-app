"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { nutritionPatchFromForm } from "@/lib/nutrition/form";
import { getNutritionSettings, updateNutritionSettings } from "@/lib/nutrition/settings";

/** `savedAt` changes on every save so the form remounts with the saved values. */
export type NutritionSettingsState = { ok?: true; error?: string; savedAt?: number };

export async function saveNutritionSettings(
  _prev: NutritionSettingsState,
  formData: FormData,
): Promise<NutritionSettingsState> {
  if (!(await requireSession())) return { error: "Not signed in" };
  const parsed = nutritionPatchFromForm(formData);
  if (!parsed.ok) return { error: parsed.error };
  // Errors are logged and never echoed: the parser already produced every readable message.
  try {
    const db = getDb();
    await getNutritionSettings(db); // makes sure the single settings row exists
    await updateNutritionSettings(db, parsed.patch);
  } catch (e) {
    console.error("saveNutritionSettings: saving failed", e);
    return { error: "Could not save the settings — please try again." };
  }
  revalidatePath("/settings/nutrition");
  return { ok: true, savedAt: Date.now() };
}

/** Returns the full ingest token, only when the owner taps Reveal. */
export async function revealIngestToken(): Promise<{ token?: string; error?: string }> {
  if (!(await requireSession())) return { error: "Not signed in" };
  return { token: getEnv().INGEST_TOKEN };
}
