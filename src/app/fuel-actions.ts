"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { WATER_TAP_ML } from "@/lib/nutrition/fuel-view";
import { addWater } from "@/lib/nutrition/water";

const Input = z.object({ clientId: z.uuid() });

/** One 16 oz tap. Idempotent on clientId, so a retried submit of the same tap adds nothing. */
export async function addWaterTap(clientId: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireSession())) return { ok: false, error: "Not signed in" };
  const parsed = Input.safeParse({ clientId });
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  try {
    await addWater(getDb(), new Date(), getEnv().OWNER_TZ, WATER_TAP_ML, parsed.data.clientId);
  } catch (err) {
    console.error("addWater failed:", err);
    return { ok: false, error: "Couldn't save water" };
  }
  revalidatePath("/");
  revalidatePath("/day");
  return { ok: true };
}
