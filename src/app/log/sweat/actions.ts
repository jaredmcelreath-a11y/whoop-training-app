"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { ML_PER_FL_OZ } from "@/lib/engine/nutrients";
import { parseNumber } from "@/lib/log/units";
import { formError, SweatInput } from "@/lib/log/validate";
import { addSweatTest } from "@/lib/nutrition/water";

/** `savedAt` changes on every save so the form remounts and clears. */
export type SweatState = { ok?: true; message?: string; error?: string; savedAt?: number };

function text(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

export async function logSweatTest(_prev: SweatState, formData: FormData): Promise<SweatState> {
  if (!(await requireSession())) return { error: "Not signed in" };
  const notes = text(formData, "notes").trim();
  const parsed = SweatInput.safeParse({
    testedOn: text(formData, "testedOn"),
    kind: text(formData, "kind"),
    preLb: parseNumber(formData.get("preLb")),
    postLb: parseNumber(formData.get("postLb")),
    fluidOz: parseNumber(formData.get("fluidOz")) ?? 0,
    durationMin: parseNumber(formData.get("durationMin")),
    ...(notes ? { notes } : {}),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    // Whole-form issues (no field path) carry a complete sentence already.
    return { error: issue && issue.path.length === 0 ? issue.message : formError(parsed.error) };
  }
  const { fluidOz, ...rest } = parsed.data;
  try {
    const rateLph = await addSweatTest(getDb(), { ...rest, fluidMl: fluidOz * ML_PER_FL_OZ });
    revalidatePath("/log/sweat");
    revalidatePath("/day");
    revalidatePath("/");
    const ozPerHour = Math.round((rateLph * 1000) / ML_PER_FL_OZ);
    return { ok: true, message: `Saved: about ${ozPerHour} oz/h for ${rest.kind}`, savedAt: Date.now() };
  } catch (e) {
    if (e instanceof RangeError) return { error: e.message };
    throw e;
  }
}
