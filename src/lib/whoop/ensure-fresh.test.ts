import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { syncState, whoopConnection } from "@/db/schema";
import { resetEnvCache } from "@/lib/env";

vi.mock("./sync", () => ({ syncRecent: vi.fn() }));

import { syncRecent } from "./sync";
import { WhoopReconnectRequired } from "./tokens";
import { WhoopRateLimited } from "./client";
import { saveConnection, setConnectionStatus } from "./connection";
import { ensureFresh } from "./ensure-fresh";

const ENV = {
  WHOOP_CLIENT_ID: "cid",
  WHOOP_CLIENT_SECRET: "csecret",
  WHOOP_REDIRECT_URI: "http://localhost:3000/auth/whoop/callback",
  APP_PASSWORD_HASH: "$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  SESSION_SECRET: "x".repeat(32),
  TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString("base64"),
  CRON_SECRET: "cron",
  INGEST_TOKEN: "i".repeat(32),
};

let db: Db;
const NOW = new Date("2026-10-20T12:00:00Z");
const now = () => NOW;
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000);

async function connect() {
  Object.assign(process.env, ENV);
  resetEnvCache();
  await saveConnection(
    db,
    { accessToken: "AT", refreshToken: "RT", expiresAt: new Date(NOW.getTime() + 3_600_000), scope: "offline" },
    1,
  );
}
const setSync = (at: Date) =>
  db.insert(syncState).values({ key: "whoop", lastSyncedAt: at }).onConflictDoUpdate({ target: syncState.key, set: { lastSyncedAt: at } });

beforeAll(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.delete(syncState);
  await db.delete(whoopConnection);
  vi.mocked(syncRecent).mockReset();
});

describe("ensureFresh", () => {
  it("returns disconnected with no connection", async () => {
    expect(await ensureFresh(db, 30, now)).toBe("disconnected");
    expect(syncRecent).not.toHaveBeenCalled();
  });

  it("returns disconnected when needs_reconnect, without throwing", async () => {
    await connect();
    await setConnectionStatus(db, "needs_reconnect");
    expect(await ensureFresh(db, 30, now)).toBe("disconnected");
    expect(syncRecent).not.toHaveBeenCalled();
  });

  it("is fresh when synced 10 minutes ago", async () => {
    await connect();
    await setSync(ago(10));
    expect(await ensureFresh(db, 30, now)).toBe("fresh");
    expect(syncRecent).not.toHaveBeenCalled();
  });

  it("syncs 2 days when synced 45 minutes ago", async () => {
    await connect();
    await setSync(ago(45));
    expect(await ensureFresh(db, 30, now)).toBe("synced");
    expect(syncRecent).toHaveBeenCalledWith(db, 2);
  });

  it("backfills 7 days when there is no sync_state row", async () => {
    await connect();
    expect(await ensureFresh(db, 30, now)).toBe("synced");
    expect(syncRecent).toHaveBeenCalledWith(db, 7);
  });

  it("returns disconnected if syncRecent throws WhoopReconnectRequired", async () => {
    await connect();
    await setSync(ago(45));
    vi.mocked(syncRecent).mockRejectedValue(new WhoopReconnectRequired());
    expect(await ensureFresh(db, 30, now)).toBe("disconnected");
  });

  it("propagates other errors", async () => {
    await connect();
    await setSync(ago(45));
    vi.mocked(syncRecent).mockRejectedValue(new Error("boom"));
    await expect(ensureFresh(db, 30, now)).rejects.toThrow("boom");
  });

  it("propagates WhoopRateLimited like other transient errors", async () => {
    await connect();
    await setSync(ago(45));
    vi.mocked(syncRecent).mockRejectedValue(new WhoopRateLimited("429"));
    await expect(ensureFresh(db, 30, now)).rejects.toBeInstanceOf(WhoopRateLimited);
  });
});
