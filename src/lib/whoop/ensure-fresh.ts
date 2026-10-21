import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { syncState } from "@/db/schema";
import { loadConnection } from "@/lib/whoop/connection";
import { syncRecent } from "@/lib/whoop/sync";
import { WhoopReconnectRequired } from "@/lib/whoop/tokens";

export type FreshResult = "synced" | "fresh" | "disconnected";

/**
 * Sync-on-open. With no sync_state row (first time after a connect) it backfills
 * 7 days; otherwise it pulls 2 days when the last sync is older than maxAgeMin.
 */
export async function ensureFresh(
  db: Db,
  maxAgeMin = 30,
  now: () => Date = () => new Date(),
): Promise<FreshResult> {
  const conn = await loadConnection(db);
  if (!conn || conn.status === "needs_reconnect") return "disconnected";

  const [row] = await db.select().from(syncState).where(eq(syncState.key, "whoop"));
  let days: number;
  if (!row) days = 7;
  else if (now().getTime() - row.lastSyncedAt.getTime() > maxAgeMin * 60_000) days = 2;
  else return "fresh";

  try {
    await syncRecent(db, days);
  } catch (err) {
    if (err instanceof WhoopReconnectRequired) return "disconnected";
    throw err;
  }
  return "synced";
}
