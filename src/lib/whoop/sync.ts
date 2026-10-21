import { and, eq, or } from "drizzle-orm";
import type { PgTable, PgColumn } from "drizzle-orm/pg-core";
import type { Db } from "@/db/client";
import { cycles, recoveries, sleeps, syncState, whoopRaw, workouts } from "@/db/schema";
import { listAll, whoopGet } from "@/lib/whoop/client";
import {
  normalizeCycle,
  normalizeRecovery,
  normalizeSleep,
  normalizeWorkout,
  type CyclePayload,
  type RecoveryPayload,
  type SleepPayload,
  type WorkoutPayload,
} from "@/lib/whoop/normalize";

export type SyncResource = "cycle" | "recovery" | "sleep" | "workout";

async function upsertRaw(db: Db, resource: typeof whoopRaw.$inferInsert.resource, id: string, payload: unknown) {
  const fetchedAt = new Date();
  await db
    .insert(whoopRaw)
    .values({ resource, id, payload, fetchedAt })
    .onConflictDoUpdate({ target: [whoopRaw.resource, whoopRaw.id], set: { payload, fetchedAt } });
}

/** Overwrite every column except the primary key on conflict. */
function setAll(row: Record<string, unknown>, pk: string) {
  const set: Record<string, unknown> = {};
  for (const key of Object.keys(row)) if (key !== pk) set[key] = row[key];
  return set;
}

export async function upsertRecord(db: Db, resource: SyncResource, payload: unknown): Promise<void> {
  switch (resource) {
    case "cycle": {
      const p = payload as CyclePayload;
      const row = normalizeCycle(p);
      await upsertRaw(db, "cycle", String(p.id), p);
      await db.insert(cycles).values(row).onConflictDoUpdate({ target: cycles.id, set: setAll(row, "id") });
      return;
    }
    case "recovery": {
      const p = payload as RecoveryPayload;
      const row = normalizeRecovery(p);
      await upsertRaw(db, "recovery", String(p.cycle_id), p);
      await db
        .insert(recoveries)
        .values(row)
        .onConflictDoUpdate({ target: recoveries.cycleId, set: setAll(row, "cycleId") });
      return;
    }
    case "sleep": {
      const p = payload as SleepPayload;
      const row = normalizeSleep(p);
      await upsertRaw(db, "sleep", p.id, p);
      await db.insert(sleeps).values(row).onConflictDoUpdate({ target: sleeps.id, set: setAll(row, "id") });
      return;
    }
    case "workout": {
      const p = payload as WorkoutPayload;
      const row = normalizeWorkout(p);
      await upsertRaw(db, "workout", p.id, p);
      await db
        .insert(workouts)
        .values(row)
        .onConflictDoUpdate({ target: workouts.id, set: setAll(row, "id") });
      return;
    }
  }
}

/** Deleting an unknown id is a no-op. For recovery, `id` may be the sleep UUID (webhooks) or the cycle id. */
export async function deleteRecord(db: Db, resource: SyncResource, id: string): Promise<void> {
  const del = async (table: PgTable, col: PgColumn, value: string | number) => {
    await db.delete(table).where(eq(col, value));
  };
  switch (resource) {
    case "cycle":
      if (/^\d+$/.test(id)) await del(cycles, cycles.id, Number(id));
      await db.delete(whoopRaw).where(and(eq(whoopRaw.resource, "cycle"), eq(whoopRaw.id, id)));
      return;
    case "sleep":
      await del(sleeps, sleeps.id, id);
      await db.delete(whoopRaw).where(and(eq(whoopRaw.resource, "sleep"), eq(whoopRaw.id, id)));
      return;
    case "workout":
      await del(workouts, workouts.id, id);
      await db.delete(whoopRaw).where(and(eq(whoopRaw.resource, "workout"), eq(whoopRaw.id, id)));
      return;
    case "recovery": {
      const numeric = /^\d+$/.test(id) ? Number(id) : null;
      const cond = numeric === null ? eq(recoveries.sleepId, id) : or(eq(recoveries.sleepId, id), eq(recoveries.cycleId, numeric));
      const gone = await db.delete(recoveries).where(cond).returning({ cycleId: recoveries.cycleId });
      const rawIds = new Set(gone.map((g) => String(g.cycleId)));
      if (numeric !== null) rawIds.add(String(numeric));
      for (const rid of rawIds)
        await db.delete(whoopRaw).where(and(eq(whoopRaw.resource, "recovery"), eq(whoopRaw.id, rid)));
      return;
    }
  }
}

export type SyncCounts = { cycles: number; recoveries: number; sleeps: number; workouts: number };

export async function syncRange(db: Db, start: Date, end?: Date): Promise<SyncCounts> {
  const range = end ? { start, end } : { start };
  const [cs, rs, ss, ws] = await Promise.all([
    listAll<CyclePayload>(db, "/cycle", range),
    listAll<RecoveryPayload>(db, "/recovery", range),
    listAll<SleepPayload>(db, "/activity/sleep", range),
    listAll<WorkoutPayload>(db, "/activity/workout", range),
  ]);
  for (const p of cs) await upsertRecord(db, "cycle", p);
  for (const p of rs) await upsertRecord(db, "recovery", p);
  for (const p of ss) await upsertRecord(db, "sleep", p);
  for (const p of ws) await upsertRecord(db, "workout", p);
  return { cycles: cs.length, recoveries: rs.length, sleeps: ss.length, workouts: ws.length };
}

export async function syncRecent(db: Db, days = 7, now: () => Date = () => new Date()): Promise<SyncCounts> {
  const at = now();
  const counts = await syncRange(db, new Date(at.getTime() - days * 86_400_000));
  const body = await whoopGet<unknown>(db, "/user/measurement/body");
  await upsertRaw(db, "body", "current", body);
  await db
    .insert(syncState)
    .values({ key: "whoop", lastSyncedAt: at })
    .onConflictDoUpdate({ target: syncState.key, set: { lastSyncedAt: at } });
  return counts;
}
