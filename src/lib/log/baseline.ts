import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { bodyScans, exercises, labPanels } from "@/db/schema";
import { upsertWeekly } from "./body";
import { addLabPanel, addScan } from "./records";
import { createExercise } from "./strength";
import { LabInput, ScanInput } from "./validate";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date like 2026-01-31");

export const BaselineFile = z.object({
  bodyScans: z.array(ScanInput),
  labPanels: z.array(LabInput),
  weekly: z.array(
    z.object({
      date: isoDate,
      vo2max: z.number().min(20).max(90).optional(),
      whoopAge: z.number().min(10).max(100).optional(),
    }),
  ),
  exercises: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        category: z.enum(["strength", "bodyweight", "plyo", "core", "mobility"]),
      }),
    )
    .optional(),
});
export type BaselineFile = z.infer<typeof BaselineFile>;

export type SeedCounts = { scans: number; panels: number; weekly: number; exercises: number };

/** Names the failing field path only, never the offending value. */
export function baselineError(e: z.ZodError): string {
  const issue = e.issues[0];
  if (!issue) return "Invalid baseline file.";
  const field = issue.path.map(String).join(".");
  return field ? `Check ${field}: ${issue.message}.` : `${issue.message}.`;
}

const DEFAULT_SOURCE = "manual";

/** Idempotent: scans/panels/exercises skip rows that already exist; weekly upserts. */
export async function seedBaseline(db: Db, data: BaselineFile): Promise<SeedCounts> {
  const counts: SeedCounts = { scans: 0, panels: 0, weekly: 0, exercises: 0 };

  for (const scan of data.bodyScans) {
    const [dupe] = await db
      .select({ id: bodyScans.id })
      .from(bodyScans)
      .where(eq(bodyScans.scannedOn, scan.scannedOn))
      .limit(1);
    if (dupe) continue;
    await addScan(db, scan);
    counts.scans++;
  }

  for (const panel of data.labPanels) {
    const source = panel.source?.trim() || DEFAULT_SOURCE;
    const [dupe] = await db
      .select({ id: labPanels.id })
      .from(labPanels)
      .where(and(eq(labPanels.drawnOn, panel.drawnOn), eq(labPanels.source, source)))
      .limit(1);
    if (dupe) continue;
    await addLabPanel(db, panel);
    counts.panels++;
  }

  for (const w of data.weekly) {
    await upsertWeekly(db, w.date, { vo2max: w.vo2max ?? null, whoopAge: w.whoopAge ?? null });
    counts.weekly++;
  }

  for (const ex of data.exercises ?? []) {
    const name = ex.name.trim();
    const [dupe] = await db
      .select({ id: exercises.id })
      .from(exercises)
      .where(eq(exercises.name, name))
      .limit(1);
    if (dupe) continue;
    await createExercise(db, name, ex.category);
    counts.exercises++;
  }

  return counts;
}
