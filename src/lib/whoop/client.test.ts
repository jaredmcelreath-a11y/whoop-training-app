import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { whoopConnection } from "@/db/schema";
import { resetEnvCache } from "@/lib/env";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db/client";
import { loadConnection, saveConnection } from "@/lib/whoop/connection";
import { WhoopReconnectRequired, resetTokenStateForTests } from "@/lib/whoop/tokens";
import { WhoopRateLimited, listAll, whoopDelete, whoopGet } from "@/lib/whoop/client";

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
const API = "https://api.prod.whoop.com/developer/v2";

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, ...init });

/** Polls on real setImmediate (not faked), unlike vi.waitFor which advances fake timers. */
async function until(cond: () => boolean) {
  for (let i = 0; i < 1000 && !cond(); i++) await new Promise((r) => setImmediate(r));
  if (!cond()) throw new Error("condition not met");
}

function tokenResponse(access: string, refresh: string) {
  return json({ access_token: access, refresh_token: refresh, expires_in: 3600, scope: "offline" });
}

describe("whoop client", () => {
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
    await saveConnection(
      db,
      {
        accessToken: "AT1",
        refreshToken: "RT1",
        expiresAt: new Date(Date.now() + 3600_000),
        scope: "offline",
      },
      42,
    );
  });
  afterEach(() => {
    process.env = saved;
    resetEnvCache();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("whoopGet builds the URL with query params and sends the bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ user_id: 42 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await whoopGet<{ user_id: number }>(db, "/cycle", { limit: "25", start: "x y" });
    expect(out).toEqual({ user_id: 42 });
    const [url, init] = fetchMock.mock.calls[0];
    const u = new URL(url as string);
    expect(u.origin + u.pathname).toBe(`${API}/cycle`);
    expect(u.searchParams.get("limit")).toBe("25");
    expect(u.searchParams.get("start")).toBe("x y");
    expect(init.headers.Authorization).toBe("Bearer AT1");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("a 401 refreshes once and retries once with the new token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(tokenResponse("AT2", "RT2"))
      .mockResolvedValueOnce(json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await whoopGet(db, "/recovery")).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe(TOKEN_URL);
    expect(fetchMock.mock.calls[2][1].headers.Authorization).toBe("Bearer AT2");
    expect((await loadConnection(db))?.refreshToken).toBe("RT2");
  });

  it("a 401 on the retry throws WhoopReconnectRequired", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(tokenResponse("AT2", "RT2"))
      .mockResolvedValueOnce(new Response("", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(whoopGet(db, "/recovery")).rejects.toBeInstanceOf(WhoopReconnectRequired);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((await loadConnection(db))?.status).toBe("needs_reconnect");
  });

  it("a 429 waits X-RateLimit-Reset seconds, then retries", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "X-RateLimit-Reset": "2" } }),
      )
      .mockResolvedValueOnce(json({ ok: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    const p = whoopGet(db, "/cycle");
    await until(() => fetchMock.mock.calls.length === 1);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toEqual({ ok: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a 429 with a reset over 5 s throws WhoopRateLimited without sleeping", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("", { status: 429, headers: { "X-RateLimit-Reset": "30" } }));
    vi.stubGlobal("fetch", fetchMock);
    // No timers are advanced: a sleep would hang this await.
    await expect(whoopGet(db, "/cycle")).rejects.toBeInstanceOf(WhoopRateLimited);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("a 429 without X-RateLimit-Reset throws WhoopRateLimited without sleeping", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(whoopGet(db, "/cycle")).rejects.toBeInstanceOf(WhoopRateLimited);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("throws WhoopRateLimited when the total wait would exceed 10 s", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () => new Response("", { status: 429, headers: { "X-RateLimit-Reset": "4" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const p = whoopGet(db, "/cycle").catch((e) => e);
    for (let i = 1; i <= 2; i++) {
      await until(() => fetchMock.mock.calls.length === i);
      await vi.advanceTimersByTimeAsync(4000);
    }
    // 4 s + 4 s waited; a third 4 s wait would make 12 s > 10 s.
    const err = await p;
    expect(err).toBeInstanceOf(WhoopRateLimited);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("gives up with WhoopRateLimited after 3 rate-limit retries", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () => new Response("", { status: 429, headers: { "X-RateLimit-Reset": "1" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const p = whoopGet(db, "/cycle").catch((e) => e);
    for (let i = 0; i < 5; i++) {
      await until(() => fetchMock.mock.calls.length >= Math.min(i + 1, 4));
      await vi.advanceTimersByTimeAsync(1000);
    }
    const err = await p;
    expect(err).toBeInstanceOf(WhoopRateLimited);
    expect(String(err)).toMatch(/429/);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("non-OK responses throw with the status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 404 })));
    await expect(whoopGet(db, "/cycle/1")).rejects.toThrow(/404/);
  });

  it("listAll follows next_token with limit=25", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ records: [{ id: "a" }], next_token: "t" }))
      .mockResolvedValueOnce(json({ records: [{ id: "b" }] }));
    vi.stubGlobal("fetch", fetchMock);
    const start = new Date("2026-10-01T00:00:00Z");
    const end = new Date("2026-10-20T00:00:00Z");
    const out = await listAll<{ id: string }>(db, "/activity/workout", { start, end });
    expect(out).toEqual([{ id: "a" }, { id: "b" }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const first = new URL(fetchMock.mock.calls[0][0] as string);
    expect(first.pathname).toBe("/developer/v2/activity/workout");
    expect(first.searchParams.get("limit")).toBe("25");
    expect(first.searchParams.get("start")).toBe(start.toISOString());
    expect(first.searchParams.get("end")).toBe(end.toISOString());
    expect(first.searchParams.has("nextToken")).toBe(false);

    const second = new URL(fetchMock.mock.calls[1][0] as string);
    expect(second.searchParams.get("nextToken")).toBe("t");
    expect(second.searchParams.get("limit")).toBe("25");
  });

  it("listAll omits end when not given", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json({ records: [], next_token: null }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await listAll(db, "/cycle", { start: new Date(0) })).toEqual([]);
    expect(new URL(fetchMock.mock.calls[0][0] as string).searchParams.has("end")).toBe(false);
  });

  it("whoopDelete sends DELETE and accepts 204", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(whoopDelete(db, "/user/access")).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API}/user/access`);
    expect(init.method).toBe("DELETE");
    expect(init.headers.Authorization).toBe("Bearer AT1");
  });
});
