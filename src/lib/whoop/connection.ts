import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { whoopConnection } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import type { TokenSet } from "@/lib/whoop/oauth";

/** Upsert the single connection row (id = 1). No transaction (neon-http has none). */
export async function saveConnection(
  db: Db,
  t: TokenSet,
  whoopUserId: number,
): Promise<void> {
  const values = {
    whoopUserId,
    accessTokenEnc: encrypt(t.accessToken),
    refreshTokenEnc: encrypt(t.refreshToken),
    expiresAt: t.expiresAt,
    scope: t.scope,
    status: "connected" as const,
    updatedAt: new Date(),
  };
  await db
    .insert(whoopConnection)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: whoopConnection.id, set: values });
}

export async function loadConnection(
  db: Db,
): Promise<(TokenSet & { status: string; whoopUserId: number }) | null> {
  const [row] = await db.select().from(whoopConnection).where(eq(whoopConnection.id, 1));
  if (!row) return null;
  return {
    accessToken: decrypt(row.accessTokenEnc),
    refreshToken: decrypt(row.refreshTokenEnc),
    expiresAt: row.expiresAt,
    scope: row.scope,
    status: row.status,
    whoopUserId: row.whoopUserId as number,
  };
}

export async function setConnectionStatus(
  db: Db,
  status: "connected" | "needs_reconnect",
): Promise<void> {
  await db
    .update(whoopConnection)
    .set({ status, updatedAt: new Date() })
    .where(eq(whoopConnection.id, 1));
}
