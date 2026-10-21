import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { whoopConnection } from "@/db/schema";
import { resetEnvCache } from "@/lib/env";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db/client";
import { loadConnection, saveConnection, setConnectionStatus } from "@/lib/whoop/connection";
import {
  WhoopReconnectRequired,
  getValidAccessToken,
  resetTokenStateForTests,
} from "@/lib/whoop/tokens";

const ENV = {
  WHOOP_CLIENT_ID: "cid",
  WHOOP_CLIENT_SECRET: "csecret",
  WHOOP_REDIRECT_URI: "http://localhost:3000/auth/whoop/callback",
  APP_PASSWORD_HASH: "$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  SESSION_SECRET: "x".repeat(32),
  TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString("base64"),
  CRON_SECRET: "cron",
};

const TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";

function tokenResponse(access: string, refresh: string) {
  return new Response(
    JSON.stringify({
      access_token: access,
      refresh_token: refresh,
      expires_in: 3600,
      scope: "offline read:recovery",
      token_type: "bearer",
    }),
    { status: 200 },
  );
}

async function seed(db: Db, expiresInMs: number, refreshToken = "RT1") {
  await saveConnection(
    db,
    {
      accessToken: "AT1",
      refreshToken,
      expiresAt: new Date(Date.now() + expiresInMs),
      scope: "offline",
    },
    42,
  );
}

describe("getValidAccessToken", () => {
  let saved: NodeJS.ProcessEnv;
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
  });
  beforeEach(async () => {
    saved = process.env;
    process.env = { ...saved, ...ENV };
    resetEnvCache();
    resetTokenStateForTests();
    await db.delete(whoopConnection);
  });
  afterEach(() => {
    process.env = saved;
    resetEnvCache();
    vi.unstubAllGlobals();
  });

  it("returns the stored token without fetching when not near expiry", async () => {
    await seed(db, 10 * 60_000);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await getValidAccessToken(db)).toBe("AT1");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes when expiry is under 60 s away", async () => {
    await seed(db, 30_000);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(tokenResponse("AT2", "RT2")));
    expect(await getValidAccessToken(db)).toBe("AT2");
  });

  it("two concurrent callers share exactly one refresh POST and the new refresh token is saved", async () => {
    await seed(db, -1000);
    const fetchMock = vi.fn().mockImplementation(async () => tokenResponse("AT2", "RT2"));
    vi.stubGlobal("fetch", fetchMock);

    const [a, b] = await Promise.all([getValidAccessToken(db), getValidAccessToken(db)]);
    expect(a).toBe("AT2");
    expect(b).toBe("AT2");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(TOKEN_URL);
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(Object.fromEntries(new URLSearchParams(init.body as string))).toEqual({
      grant_type: "refresh_token",
      refresh_token: "RT1",
      client_id: "cid",
      client_secret: "csecret",
      scope: "offline",
    });

    const conn = await loadConnection(db);
    expect(conn?.refreshToken).toBe("RT2");
    expect(conn?.accessToken).toBe("AT2");
    expect(conn?.whoopUserId).toBe(42);
    expect(conn?.status).toBe("connected");
    expect(conn!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 3000_000);
  });

  it("a 400 refresh marks needs_reconnect, throws, and later calls throw without fetching", async () => {
    await seed(db, -1000);
    const fetchMock = vi.fn().mockResolvedValue(new Response("invalid_grant", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getValidAccessToken(db)).rejects.toBeInstanceOf(WhoopReconnectRequired);
    expect((await loadConnection(db))?.status).toBe("needs_reconnect");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(getValidAccessToken(db)).rejects.toBeInstanceOf(WhoopReconnectRequired);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("after a failed refresh, uses a token another instance already rotated in", async () => {
    await seed(db, -1000);
    const fetchMock = vi.fn().mockImplementation(async () => {
      // Another instance wins the race and stores fresh tokens first.
      await saveConnection(
        db,
        {
          accessToken: "AT-other",
          refreshToken: "RT-other",
          expiresAt: new Date(Date.now() + 3600_000),
          scope: "offline",
        },
        42,
      );
      return new Response("invalid_grant", { status: 400 });
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await getValidAccessToken(db)).toBe("AT-other");
    expect((await loadConnection(db))?.status).toBe("connected");
  });

  it("a 5xx refresh throws a plain error and does not mark needs_reconnect", async () => {
    await seed(db, -1000);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("oops", { status: 503 })));
    const err = await getValidAccessToken(db).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(WhoopReconnectRequired);
    expect((await loadConnection(db))?.status).toBe("connected");
  });

  it("throws WhoopReconnectRequired when there is no connection", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(getValidAccessToken(db)).rejects.toBeInstanceOf(WhoopReconnectRequired);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("setConnectionStatus flips the status both ways", async () => {
    await seed(db, 10 * 60_000);
    await setConnectionStatus(db, "needs_reconnect");
    expect((await loadConnection(db))?.status).toBe("needs_reconnect");
    await setConnectionStatus(db, "connected");
    expect((await loadConnection(db))?.status).toBe("connected");
  });
});
