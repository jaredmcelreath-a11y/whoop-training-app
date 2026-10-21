"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { cardioEntries } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { addCardio, cardioFormToInput, deleteCardio, runEndedAt } from "@/lib/log/cardio";
import { addPains, afterRunFormToInputs } from "@/lib/log/pain";
import { formError } from "@/lib/log/validate";

const Id = z.uuid();

export type CardioState = { ok?: true; error?: string; runId?: string; savedAt?: number };
export type AfterRunState = { ok?: true; error?: string; count?: number };

function refresh() {
  revalidatePath("/");
  revalidatePath("/log");
  revalidatePath("/log/cardio");
  revalidatePath("/log/pain");
}

export async function logCardio(_prev: CardioState, formData: FormData): Promise<CardioState> {
  if (!(await requireSession())) return { error: "Not signed in" };
  const tz = getEnv().OWNER_TZ;
  const parsed = cardioFormToInput(formData, tz);
  if (!parsed.success) return { error: formError(parsed.error) };
  const { id } = await addCardio(getDb(), parsed.data, tz);
  refresh();
  const savedAt = Date.now();
  return parsed.data.kind === "run" ? { ok: true, runId: id, savedAt } : { ok: true, savedAt };
}

/** The after-run prompt: logs after_run pain linked to the run for each area not skipped. */
export async function logAfterRunPain(
  runId: string,
  _prev: AfterRunState,
  formData: FormData,
): Promise<AfterRunState> {
  if (!(await requireSession())) return { error: "Not signed in" };
  const rid = Id.safeParse(runId);
  if (!rid.success) return { error: "Unknown run." };
  const db = getDb();
  const [run] = await db
    .select({
      kind: cardioEntries.kind,
      startedAt: cardioEntries.startedAt,
      durationS: cardioEntries.durationS,
    })
    .from(cardioEntries)
    .where(eq(cardioEntries.id, rid.data));
  if (!run || run.kind !== "run") return { error: "Unknown run." };
  const parsed = afterRunFormToInputs(formData);
  if (!parsed.ok) return { error: parsed.error };
  // Dated by when the run ended, so a prompt answered later still lands on the run.
  const at = runEndedAt(run.startedAt, run.durationS);
  await addPains(db, parsed.inputs, at, getEnv().OWNER_TZ, rid.data);
  if (parsed.inputs.length) refresh();
  return { ok: true, count: parsed.inputs.length };
}

/** Pain entries of a deleted run stay; the FK sets their cardio_entry_id to null. */
export async function deleteCardioAction(id: string): Promise<void> {
  if (!(await requireSession())) redirect("/login");
  const parsed = Id.safeParse(id);
  if (!parsed.success) return;
  await deleteCardio(getDb(), parsed.data);
  refresh();
}
