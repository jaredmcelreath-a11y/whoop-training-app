"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { lookupSource } from "@/lib/library/lookup";
import { parseSourceId } from "@/lib/library/source-id";
import { addUserSource, deleteUserSource, parseAddSourceForm } from "@/lib/library/user-sources";

export type AddSourceState = { ok?: string; error?: string; savedAt?: number };

/**
 * Adds a source to a rule: checks it against PubMed and Crossref first. A source that can't be
 * found is kept as context only; an outage saves nothing.
 */
export async function addSourceAction(_prev: AddSourceState, fd: FormData): Promise<AddSourceState> {
  if (!(await requireSession())) return { error: "Not signed in" };
  const form = parseAddSourceForm(fd);
  if ("error" in form) return { error: form.error };
  const id = parseSourceId(form.input);
  const looked = id ? await lookupSource(id) : null;
  if (looked && !looked.verified && looked.reason === "unavailable") {
    return { error: "Couldn't reach PubMed or Crossref. Try again later." };
  }
  const found = looked && looked.verified ? looked : null;
  const saved = await addUserSource(getDb(), { ...form, found, rawInput: form.input });
  if (!saved.ok) return { error: saved.error };
  revalidatePath("/plan/library");
  return {
    ok: found ? `Added: ${found.title}` : "Saved as context: it couldn't be verified as a published study.",
    savedAt: Date.now(),
  };
}

export async function deleteSourceAction(id: string): Promise<void> {
  if (!(await requireSession())) return;
  if (!z.uuid().safeParse(id).success) return;
  await deleteUserSource(getDb(), id);
  revalidatePath("/plan/library");
}
