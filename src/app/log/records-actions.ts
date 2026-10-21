"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import {
  addLabPanel,
  addScan,
  deleteLabPanel,
  deleteScan,
} from "@/lib/log/records";
import { parseNumber } from "@/lib/log/units";
import { LabInput, ScanInput, formError } from "@/lib/log/validate";

const Id = z.uuid();

export type RecordState = { ok?: true; error?: string; savedAt?: number };

function refresh() {
  revalidatePath("/log/scans");
  revalidatePath("/log/labs");
}

const SCAN_NUMBERS = [
  "weightLb",
  "leanMassLb",
  "skeletalMuscleLb",
  "fatMassLb",
  "bodyFatPct",
  "bmrKcal",
  "teeKcal",
  "visceralFatLevel",
] as const;

export async function logScan(
  _prev: RecordState,
  formData: FormData,
): Promise<RecordState> {
  if (!(await requireSession())) return { error: "Not signed in" };
  const raw: Record<string, unknown> = {
    scannedOn: String(formData.get("scannedOn") ?? ""),
  };
  for (const k of SCAN_NUMBERS) raw[k] = parseNumber(formData.get(k));
  const source = String(formData.get("source") ?? "").trim();
  if (source) raw.source = source;
  const parsed = ScanInput.safeParse(raw);
  if (!parsed.success) return { error: formError(parsed.error) };
  await addScan(getDb(), parsed.data);
  refresh();
  return { ok: true, savedAt: Date.now() };
}

export async function deleteScanAction(id: string): Promise<void> {
  if (!(await requireSession())) redirect("/login");
  const parsed = Id.safeParse(id);
  if (!parsed.success) return;
  await deleteScan(getDb(), parsed.data);
  refresh();
}

export async function logLabPanel(
  _prev: RecordState,
  formData: FormData,
): Promise<RecordState> {
  if (!(await requireSession())) return { error: "Not signed in" };
  const markers = formData.getAll("marker").map(String);
  const values = formData.getAll("value");
  const units = formData.getAll("unit").map(String);
  const flags = formData.getAll("flag").map(String);
  const results: unknown[] = [];
  for (let i = 0; i < markers.length; i++) {
    const marker = markers[i].trim();
    const value = parseNumber(values[i] ?? null);
    // Fully blank rows are ignored.
    if (!marker && value === null && !(units[i] ?? "").trim()) continue;
    if (value === null)
      return {
        error: `Check value for ${marker || `row ${i + 1}`}: enter a number.`,
      };
    results.push({
      marker,
      value,
      unit: units[i] ?? "",
      flag: flags[i]?.trim() || undefined,
    });
  }
  const source = String(formData.get("source") ?? "").trim();
  const parsed = LabInput.safeParse({
    drawnOn: String(formData.get("drawnOn") ?? ""),
    ...(source ? { source } : {}),
    results,
  });
  if (!parsed.success) return { error: formError(parsed.error) };
  await addLabPanel(getDb(), parsed.data);
  refresh();
  return { ok: true, savedAt: Date.now() };
}

export async function deleteLabPanelAction(id: string): Promise<void> {
  if (!(await requireSession())) redirect("/login");
  const parsed = Id.safeParse(id);
  if (!parsed.success) return;
  await deleteLabPanel(getDb(), parsed.data);
  refresh();
}
