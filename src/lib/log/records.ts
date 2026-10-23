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
        refRange: r.refRange || null,
      })),
    )
    .onConflictDoUpdate({
      target: [labResults.panelId, labResults.marker],
      set: {
        value: sql`excluded.value`,
        unit: sql`excluded.unit`,
        flag: sql`excluded.flag`,
        refRange: sql`excluded.ref_range`,
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
      refRange: labResults.refRange,
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
    .where(sql`lower(trim(${labResults.marker})) = lower(${marker.trim()})`)
    .orderBy(asc(labPanels.drawnOn));
}

/** Like markerHistory, plus each result's flag (blank becomes null) and stored marker name. */
export async function markerResults(
  db: Db,
  marker: string,
): Promise<{ drawnOn: string; value: number; unit: string; flag: string | null; marker: string }[]> {
  const rows = await db
    .select({
      drawnOn: labPanels.drawnOn,
      value: labResults.value,
      unit: labResults.unit,
      flag: labResults.flag,
      marker: labResults.marker,
    })
    .from(labResults)
    .innerJoin(labPanels, eq(labPanels.id, labResults.panelId))
    .where(sql`lower(trim(${labResults.marker})) = lower(${marker.trim()})`)
    .orderBy(asc(labPanels.drawnOn), asc(labPanels.id));
  return rows.map((r) => ({ ...r, flag: r.flag || null }));
}

export type MarkerSummary = {
  marker: string;
  latest: { drawnOn: string; value: number; unit: string; flag: string | null };
  count: number;
};

/** Every lab marker once (case-insensitive, latest spelling): flagged first, then A to Z. */
export async function listMarkers(db: Db): Promise<MarkerSummary[]> {
  const rows = await db
    .select({
      marker: labResults.marker,
      value: labResults.value,
      unit: labResults.unit,
      flag: labResults.flag,
      drawnOn: labPanels.drawnOn,
    })
    .from(labResults)
    .innerJoin(labPanels, eq(labPanels.id, labResults.panelId))
    .orderBy(asc(labPanels.drawnOn), asc(labPanels.id));
  const byKey = new Map<string, MarkerSummary>();
  for (const r of rows) {
    const name = r.marker.trim();
    const key = name.toLowerCase();
    const prev = byKey.get(key);
    byKey.set(key, {
      marker: name,
      latest: {
        drawnOn: r.drawnOn,
        value: r.value,
        unit: r.unit,
        flag: r.flag || null,
      },
      count: (prev?.count ?? 0) + 1,
    });
  }
  return [...byKey.values()].sort(
    (a, b) =>
      Number(b.latest.flag !== null) - Number(a.latest.flag !== null) ||
      a.marker.localeCompare(b.marker),
  );
}

export async function deleteLabPanel(db: Db, id: string): Promise<void> {
  await db.delete(labPanels).where(eq(labPanels.id, id));
}
