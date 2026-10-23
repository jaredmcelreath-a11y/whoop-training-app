"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { upsertWeekly, upsertWeight } from "@/lib/log/body";
import { localDate } from "@/lib/log/dates";
import { dismissWorkout } from "@/lib/log/log-boxes";
import { parseNumber } from "@/lib/log/units";
import { WeeklyInput, WeightInput, formError } from "@/lib/log/validate";

/** `savedAt` changes on every save; forms key on it to clear their fields. */
export type FormState = { ok?: true; error?: string; savedAt?: number };

function done(): FormState {
  revalidatePath("/");
  revalidatePath("/log");
  return { ok: true, savedAt: Date.now() };
}

export async function logWeight(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await requireSession())) return { error: "Not signed in" };
  const parsed = WeightInput.safeParse({ weightLb: parseNumber(formData.get("weightLb")) });
  if (!parsed.success) return { error: formError(parsed.error) };
  await upsertWeight(getDb(), new Date(), getEnv().OWNER_TZ, parsed.data.weightLb);
  return done();
}

export async function logWeekly(_prev: FormState, formData: FormData): Promise<FormState> {
  if (!(await requireSession())) return { error: "Not signed in" };
  const parsed = WeeklyInput.safeParse({
    vo2max: parseNumber(formData.get("vo2max")),
    whoopAge: parseNumber(formData.get("whoopAge")),
  });
  if (!parsed.success) return { error: formError(parsed.error) };
  await upsertWeekly(getDb(), localDate(new Date(), getEnv().OWNER_TZ), parsed.data);
  return done();
}

/** "Not a Workout": hides a mis-detected WHOOP workout from Missing Details and from the plan. */
export async function dismissWorkoutAction(workoutId: string): Promise<void> {
  if (!(await requireSession())) return;
  if (typeof workoutId !== "string" || !workoutId || workoutId.length > 100) return;
  await dismissWorkout(getDb(), workoutId);
  revalidatePath("/");
  revalidatePath("/log");
  revalidatePath("/plan");
}
