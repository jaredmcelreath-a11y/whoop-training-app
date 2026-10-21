import type { Db } from "@/db/client";
import { getEnv } from "@/lib/env";
import { loadConnection, saveConnection, setConnectionStatus } from "@/lib/whoop/connection";
import { WHOOP_TOKEN_URL } from "@/lib/whoop/oauth";

/** Refresh when the access token has less than this left. */
const REFRESH_MARGIN_MS = 60_000;

export class WhoopReconnectRequired extends Error {
  constructor(message = "WHOOP needs to be reconnected") {
    super(message);
    this.name = "WhoopReconnectRequired";
  }
}

type Connection = NonNullable<Awaited<ReturnType<typeof loadConnection>>>;

/** Single-flight: concurrent callers in this instance share one refresh. */
let refreshing: Promise<string> | null = null;

/** Test-only: clear the module-level in-flight refresh. */
export function resetTokenStateForTests(): void {
  refreshing = null;
}

const isFresh = (c: Connection) => c.expiresAt.getTime() - Date.now() >= REFRESH_MARGIN_MS;

async function loadUsable(db: Db): Promise<Connection> {
  const conn = await loadConnection(db);
  if (!conn) throw new WhoopReconnectRequired("WHOOP is not connected");
  if (conn.status === "needs_reconnect") throw new WhoopReconnectRequired();
  return conn;
}

function startRefresh(db: Db, conn: Connection): Promise<string> {
  if (!refreshing) {
    refreshing = doRefresh(db, conn).finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function doRefresh(db: Db, conn: Connection): Promise<string> {
  const env = getEnv();
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refreshToken,
      client_id: env.WHOOP_CLIENT_ID,
      client_secret: env.WHOOP_CLIENT_SECRET,
      scope: "offline",
    }).toString(),
  });

  if (res.ok) {
    const j = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };
    if (!j.access_token || typeof j.expires_in !== "number") {
      throw new Error("Unexpected WHOOP refresh response");
    }
    await saveConnection(
      db,
      {
        accessToken: j.access_token,
        // WHOOP rotates both tokens; fall back to the old one only if none came back.
        refreshToken: j.refresh_token ?? conn.refreshToken,
        expiresAt: new Date(Date.now() + j.expires_in * 1000),
        scope: j.scope ?? conn.scope,
      },
      conn.whoopUserId,
    );
    return j.access_token;
  }

  // Re-read the DB once: another instance may already have rotated the token.
  const latest = await loadConnection(db);
  if (
    latest &&
    latest.status === "connected" &&
    latest.refreshToken !== conn.refreshToken &&
    isFresh(latest)
  ) {
    return latest.accessToken;
  }

  if (res.status === 400 || res.status === 401) {
    await setConnectionStatus(db, "needs_reconnect");
    throw new WhoopReconnectRequired();
  }
  throw new Error(`WHOOP token refresh failed: ${res.status}`);
}

/** Returns a usable access token, refreshing (single-flight) when < 60 s remain. */
export async function getValidAccessToken(db: Db): Promise<string> {
  if (refreshing) return refreshing;
  const conn = await loadUsable(db);
  if (isFresh(conn)) return conn.accessToken;
  return startRefresh(db, conn);
}

/**
 * Called after the API rejected `staleAccessToken` with 401. Refreshes unless the
 * stored token has already changed (someone else refreshed) and is still fresh.
 */
export async function refreshAfterUnauthorized(
  db: Db,
  staleAccessToken: string,
): Promise<string> {
  if (refreshing) return refreshing;
  const conn = await loadUsable(db);
  if (conn.accessToken !== staleAccessToken && isFresh(conn)) return conn.accessToken;
  return startRefresh(db, conn);
}
