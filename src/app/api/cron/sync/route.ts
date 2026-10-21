import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getEnv } from "@/lib/env";
import { loadConnection } from "@/lib/whoop/connection";
import { WhoopRateLimited } from "@/lib/whoop/client";
import { syncRecent } from "@/lib/whoop/sync";
import { WhoopReconnectRequired } from "@/lib/whoop/tokens";

export const maxDuration = 60;

/**
 * PUBLIC route (listed in the proxy's PUBLIC_PATHS). The bearer CRON_SECRET is
 * its authentication, so it deliberately does not call requireSession().
 * Vercel Cron sends GET requests.
 */
function authorized(req: Request): boolean {
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${getEnv().CRON_SECRET}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: Request) {
  if (!authorized(req)) return new NextResponse("Unauthorized", { status: 401 });

  const db = getDb();
  const conn = await loadConnection(db);
  if (!conn || conn.status === "needs_reconnect") return NextResponse.json({ skipped: "disconnected" });
  try {
    return NextResponse.json(await syncRecent(db, 7));
  } catch (err) {
    if (err instanceof WhoopReconnectRequired) return NextResponse.json({ skipped: "disconnected" });
    if (err instanceof WhoopRateLimited) return NextResponse.json({ skipped: "rate_limited" });
    throw err;
  }
}
