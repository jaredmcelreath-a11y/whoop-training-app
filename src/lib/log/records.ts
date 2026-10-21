import { asc, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { bodyScans, labPanels, labResults } from "@/db/schema";
import { localDate } from "./dates";
import type { LabInput, ScanInput } from "./validate";

const DEFAULT_SOURCE = "manual";

export async function addScan(
  db: Db,
  input: ScanInput,
): Promise<{ id: string }> {
  const [row] = await db
    .insert(bodyScans)
    .values({
      scannedOn: input.scannedOn,
      weightLb: input.weightLb ?? null,
      leanMassLb: input.leanMassLb ?? null,
      skeletalMuscleLb: input.skeletalMuscleLb ?? null,
      fatMassLb: input.fatMassLb ?? null,
      bodyFatPct: input.bodyFatPct ?? null,
      bmrKcal: input.bmrKcal ?? null,
      teeKcal: input.teeKcal ?? null,
      visceralFatLevel: input.visceralFatLevel ?? null,
      extras: input.extras ?? null,
      source: input.source?.trim() || DEFAULT_SOURCE,
    })
    .returning({ id: bodyScans.id });
  return { id: row.id };
}

export async function listScans(db: Db) {
  return db
    .select()
    .from(bodyScans)
    .orderBy(desc(bodyScans.scannedOn), desc(bodyScans.id));
}

export async function deleteScan(db: Db, id: string): Promise<void> {
  await db.delete(bodyScans).where(eq(bodyScans.id, id));
}

/** Inserts the panel, then its results (no transaction). A repeated marker keeps the last value. */
export async function addLabPanel(
  db: Db,
  input: LabInput,
): Promise<{ id: string }> {
  const [panel] = await db
    .insert(labPanels)
    .values({
      drawnOn: input.drawnOn,
      source: input.source?.trim() || DEFAULT_SOURCE,
    })
    .returning({ id: labPanels.id });
  const byMarker = new Map<string, LabInput["results"][number]>();
  for (const r of input.results) byMarker.set(r.marker, r);
  await db
    .insert(labResults)
    .values(
      [...byMarker.values()].map((r) => ({
        panelId: panel.id,
        marker: r.marker,
        value: r.value,
        unit: r.unit,
        flag: r.flag || null,
      })),
    )
    .onConflictDoUpdate({
      target: [labResults.panelId, labResults.marker],
      set: {
        value: sql`excluded.value`,
        unit: sql`excluded.unit`,
        flag: sql`excluded.flag`,
      },
    });
  return { id: panel.id };
}

function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

export async function listLabPanels(
  db: Db,
  now: Date = new Date(),
  tz = "America/Chicago",
) {
  const rows = await db
    .select({
      id: labPanels.id,
      drawnOn: labPanels.drawnOn,
      source: labPanels.source,
      markerCount: sql<number>`count(${labResults.id})::int`,
    })
    .from(labPanels)
    .leftJoin(labResults, eq(labResults.panelId, labPanels.id))
    .groupBy(labPanels.id)
    .orderBy(desc(labPanels.drawnOn), desc(labPanels.id));
  const today = dayNumber(localDate(now, tz));
  return rows.map((r) => ({ ...r, ageDays: today - dayNumber(r.drawnOn) }));
}

export async function getLabPanel(db: Db, id: string) {
  const [panel] = await db.select().from(labPanels).where(eq(labPanels.id, id));
  if (!panel) return null;
  const results = await db
    .select({
      marker: labResults.marker,
      value: labResults.value,
      unit: labResults.unit,
      flag: labResults.flag,
    })
    .from(labResults)
    .where(eq(labResults.panelId, id))
    .orderBy(asc(labResults.marker));
  return { ...panel, results };
}

export async function markerHistory(
  db: Db,
  marker: string,
): Promise<{ drawnOn: string; value: number; unit: string }[]> {
  return db
    .select({
      drawnOn: labPanels.drawnOn,
      value: labResults.value,
      unit: labResults.unit,
    })
    .from(labResults)
    .innerJoin(labPanels, eq(labPanels.id, labResults.panelId))
    .where(sql`lower(${labResults.marker}) = lower(${marker.trim()})`)
    .orderBy(asc(labPanels.drawnOn));
}

export async function deleteLabPanel(db: Db, id: string): Promise<void> {
  await db.delete(labPanels).where(eq(labPanels.id, id));
}
