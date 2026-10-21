"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { addPains, painFormToInputs } from "@/lib/log/pain";

/** `savedAt` changes on every save so the form can reset its "log" boxes. */
export type PainState = { ok?: true; error?: string; savedAt?: number };

export async function logPain(_prev: PainState, formData: FormData): Promise<PainState> {
  if (!(await requireSession())) return { error: "Not signed in" };
  const parsed = painFormToInputs(formData);
  if (!parsed.ok) return { error: parsed.error };
  if (!parsed.inputs.length) return { error: "Tick “log” for at least one area." };
  await addPains(getDb(), parsed.inputs, new Date(), getEnv().OWNER_TZ);
  revalidatePath("/");
  revalidatePath("/log");
  revalidatePath("/log/pain");
  return { ok: true, savedAt: Date.now() };
}
