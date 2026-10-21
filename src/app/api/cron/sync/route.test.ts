import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { whoopConnection } from "@/db/schema";
import { resetEnvCache } from "@/lib/env";

let db: Db;
vi.mock("@/db/client", () => ({ getDb: () => db }));
vi.mock("@/lib/whoop/sync", () => ({ syncRecent: vi.fn() }));

import { syncRecent } from "@/lib/whoop/sync";
import { saveConnection, setConnectionStatus } from "@/lib/whoop/connection";
import { GET } from "./route";

const ENV = {
  WHOOP_CLIENT_ID: "cid",
  WHOOP_CLIENT_SECRET: "csecret",
  WHOOP_REDIRECT_URI: "http://localhost:3000/auth/whoop/callback",
  APP_PASSWORD_HASH: "$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  SESSION_SECRET: "x".repeat(32),
  TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString("base64"),
  CRON_SECRET: "cron-secret",
};
const originalEnv = process.env;
const req = (auth?: string) =>
  new Request("http://localhost:3000/api/cron/sync", { headers: auth ? { authorization: auth } : {} });

async function connect() {
  await saveConnection(
    db,
    { accessToken: "AT", refreshToken: "RT", expiresAt: new Date(Date.now() + 3_600_000), scope: "offline" },
    1,
  );
}

beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(() => {
  process.env = { ...originalEnv, ...ENV };
  delete process.env.DATABASE_URL;
  resetEnvCache();
});
afterEach(async () => {
  await db.delete(whoopConnection);
  vi.mocked(syncRecent).mockReset();
  process.env = originalEnv;
  resetEnvCache();
});

describe("GET /api/cron/sync", () => {
  it("401 without Authorization", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(syncRecent).not.toHaveBeenCalled();
  });

  it("401 with a wrong secret (same length and different length)", async () => {
    expect((await GET(req("Bearer cron-secreT"))).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(syncRecent).not.toHaveBeenCalled();
  });

  it("syncs 7 days and returns counts with the right secret", async () => {
    await connect();
    const counts = { cycles: 1, recoveries: 2, sleeps: 3, workouts: 4 };
    vi.mocked(syncRecent).mockResolvedValue(counts);
    const res = await GET(req("Bearer cron-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(counts);
    expect(syncRecent).toHaveBeenCalledWith(db, 7);
  });

  it("skips with 200 when disconnected", async () => {
    const res = await GET(req("Bearer cron-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skipped: "disconnected" });
    await connect();
    await setConnectionStatus(db, "needs_reconnect");
    const res2 = await GET(req("Bearer cron-secret"));
    expect(await res2.json()).toEqual({ skipped: "disconnected" });
    expect(syncRecent).not.toHaveBeenCalled();
  });

  it("skips with 200 if syncRecent needs reconnect", async () => {
    await connect();
    const { WhoopReconnectRequired } = await import("@/lib/whoop/tokens");
    vi.mocked(syncRecent).mockRejectedValue(new WhoopReconnectRequired());
    const res = await GET(req("Bearer cron-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skipped: "disconnected" });
  });

  it("skips with 200 when WHOOP rate-limits", async () => {
    await connect();
    const { WhoopRateLimited } = await import("@/lib/whoop/client");
    vi.mocked(syncRecent).mockRejectedValue(new WhoopRateLimited("429"));
    const res = await GET(req("Bearer cron-secret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ skipped: "rate_limited" });
  });
});
