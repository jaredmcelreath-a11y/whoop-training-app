import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { syncState, whoopConnection } from "@/db/schema";
import { whoopDelete } from "@/lib/whoop/client";

/**
 * Revokes the app's access at WHOOP, then deletes the local connection row.
 * The revoke is best effort: if it fails for any reason (WHOOP down, token
 * already dead), the error is logged and the row is still deleted, so the
 * owner can always disconnect. The "whoop" sync_state row is cleared too, so
 * ensureFresh does its 7-day first-sync backfill after a reconnect.
 */
export async function disconnectWhoop(db: Db): Promise<void> {
  try {
    await whoopDelete(db, "/user/access");
  } catch (err) {
    console.error("WHOOP revoke failed; deleting the local connection anyway:", err);
  }
  // Sync state first: if the second delete fails, a stale connection with no
  // sync_state only costs an extra backfill.
  await db.delete(syncState).where(eq(syncState.key, "whoop"));
  await db.delete(whoopConnection).where(eq(whoopConnection.id, 1));
}
