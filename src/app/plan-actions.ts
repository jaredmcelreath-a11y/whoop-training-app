"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { localDate } from "@/lib/log/dates";
import { setManualDone } from "@/lib/plan/service";

const Input = z.object({ sessionId: z.uuid(), done: z.boolean() });

/** Checks a planned session off by hand, or undoes a hand check (see setManualDone). */
export async function toggleDoneAction(sessionId: string, done: boolean): Promise<void> {
  if (!(await requireSession())) return;
  const parsed = Input.safeParse({ sessionId, done });
  if (!parsed.success) return;
  const today = localDate(new Date(), getEnv().OWNER_TZ);
  await setManualDone(getDb(), parsed.data.sessionId, parsed.data.done, today);
  revalidatePath("/");
  revalidatePath("/plan");
}
