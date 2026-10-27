"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { strengthSessions } from "@/db/schema";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import {
  addSet,
  createExercise,
  deleteSession,
  ensureDefaultExercises,
  finishSession,
  NO_PLAN,
  removeSet,
  startOrResumeSession,
  unarchiveExercise,
} from "@/lib/log/strength";
import { appendEx, parseExList } from "@/lib/log/strength-view";
import { parseNumber } from "@/lib/log/units";
import { SetInput, formError } from "@/lib/log/validate";

const Id = z.uuid();

export type SetState = {
  ok?: true;
  error?: string;
  /** The idempotency key for the row currently on screen. Replaced only after a saved set. */
  clientId: string;
};
export type ExerciseState = { error?: string };

function refresh(sessionId: string) {
  revalidatePath("/log/strength");
  revalidatePath(`/log/strength/${sessionId}`);
}

/**
 * Reuses today's unfinished workout instead of opening a second one. The form's `plan` is the
 * planned lift to follow (a planned_sessions id) or empty for a workout with no plan.
 */
export async function startWorkout(formData: FormData): Promise<void> {
  if (!(await requireSession())) redirect("/login");
  const plan = Id.safeParse(formData.get("plan"));
  const db = getDb();
  await ensureDefaultExercises(db);
  // The open-session check runs right before the insert (inside startOrResumeSession).
  const { id } = await startOrResumeSession(db, new Date(), getEnv().OWNER_TZ, plan.success ? plan.data : NO_PLAN);
  revalidatePath("/log/strength");
  redirect(`/log/strength/${id}`);
}

export async function addSetAction(
  sessionId: string,
  prev: SetState,
  formData: FormData,
): Promise<SetState> {
  if (!(await requireSession())) return { error: "Not signed in", clientId: prev.clientId };
  const sid = Id.safeParse(sessionId);
  if (!sid.success) return { error: "Unknown workout.", clientId: prev.clientId };
  const parsed = SetInput.safeParse({
    clientId: formData.get("clientId"),
    exerciseId: formData.get("exerciseId"),
    setIndex: parseNumber(formData.get("setIndex")),
    reps: parseNumber(formData.get("reps")),
    weightLb: parseNumber(formData.get("weightLb")),
  });
  if (!parsed.success) return { error: formError(parsed.error), clientId: prev.clientId };

  const db = getDb();
  const [session] = await db
    .select({ endedAt: strengthSessions.endedAt })
    .from(strengthSessions)
    .where(eq(strengthSessions.id, sid.data));
  if (!session) return { error: "Unknown workout.", clientId: prev.clientId };
  if (session.endedAt) return { error: "This workout is finished.", clientId: prev.clientId };

  // "duplicate" means a repeat of the same tap (same clientId): the set is already saved.
  await addSet(db, { ...parsed.data, sessionId: sid.data, at: new Date() });
  refresh(sid.data);
  return { ok: true, clientId: crypto.randomUUID() };
}

export async function removeSetAction(sessionId: string, setId: string): Promise<void> {
  if (!(await requireSession())) redirect("/login");
  const sid = Id.safeParse(sessionId);
  const id = Id.safeParse(setId);
  if (!sid.success || !id.success) return;
  await removeSet(getDb(), id.data);
  refresh(sid.data);
}

const NewExercise = z.object({
  sessionId: z.uuid(),
  name: z.string().trim().min(1, "enter a name").max(80),
  category: z.enum(["strength", "bodyweight", "plyo", "core", "mobility"]),
});

export async function addExerciseAction(
  _prev: ExerciseState,
  formData: FormData,
): Promise<ExerciseState> {
  if (!(await requireSession())) return { error: "Not signed in" };
  const parsed = NewExercise.safeParse({
    sessionId: formData.get("sessionId"),
    name: formData.get("name") ?? "",
    category: formData.get("category") ?? "strength",
  });
  if (!parsed.success) return { error: formError(parsed.error) };
  const db = getDb();
  const ex = await createExercise(db, parsed.data.name, parsed.data.category);
  if (ex.archived) await unarchiveExercise(db, ex.id);
  refresh(parsed.data.sessionId);
  const list = parseExList(String(formData.get("ex") ?? ""));
  redirect(`/log/strength/${parsed.data.sessionId}?ex=${appendEx(list, ex.id)}`);
}

export async function finishWorkout(sessionId: string): Promise<void> {
  if (!(await requireSession())) redirect("/login");
  const sid = Id.safeParse(sessionId);
  if (!sid.success) return;
  await finishSession(getDb(), sid.data, new Date());
  refresh(sid.data);
  redirect("/log/strength");
}

export async function deleteWorkout(sessionId: string): Promise<void> {
  if (!(await requireSession())) redirect("/login");
  const sid = Id.safeParse(sessionId);
  if (!sid.success) return;
  await deleteSession(getDb(), sid.data);
  revalidatePath("/log/strength");
  redirect("/log/strength");
}
