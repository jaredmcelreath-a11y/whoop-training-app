import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sql } from "drizzle-orm";
import { resetEnvCache } from "@/lib/env";
import { createTestDb } from "@/db/test-db";
import {
  WHOOP_SCOPES,
  makeState,
  buildAuthorizeUrl,
  exchangeCode,
  parseProfileUserId,
} from "@/lib/whoop/oauth";
import { saveConnection, loadConnection } from "@/lib/whoop/connection";

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

describe("whoop oauth", () => {
  let saved: NodeJS.ProcessEnv;
  beforeEach(() => {
    saved = process.env;
    process.env = { ...saved, ...ENV };
    resetEnvCache();
  });
  afterEach(() => {
    process.env = saved;
    resetEnvCache();
    vi.unstubAllGlobals();
  });

  it("makeState is 8 URL-safe chars and varies", () => {
    const a = makeState();
    expect(a).toHaveLength(8);
    expect(a).toMatch(/^[A-Za-z0-9_-]{8}$/);
    expect(makeState()).not.toBe(a);
  });

  it("buildAuthorizeUrl has the required params", () => {
    const u = new URL(buildAuthorizeUrl("abcd1234"));
    expect(u.origin + u.pathname).toBe("https://api.prod.whoop.com/oauth/oauth2/auth");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("cid");
    expect(u.searchParams.get("redirect_uri")).toBe(ENV.WHOOP_REDIRECT_URI);
    expect(u.searchParams.get("scope")).toBe(WHOOP_SCOPES);
    expect(u.searchParams.get("state")).toBe("abcd1234");
  });

  it("exchangeCode posts form-encoded and maps expires_in", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "AT",
          refresh_token: "RT",
          expires_in: 3600,
          scope: "offline read:recovery",
          token_type: "bearer",
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const now = new Date("2026-01-01T00:00:00Z");
    const t = await exchangeCode("the-code", now);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.prod.whoop.com/oauth/oauth2/token");
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    const body = new URLSearchParams(init.body as string);
    expect(Object.fromEntries(body)).toEqual({
      grant_type: "authorization_code",
      code: "the-code",
      client_id: "cid",
      client_secret: "csecret",
      redirect_uri: ENV.WHOOP_REDIRECT_URI,
    });
    expect(t).toEqual({
      accessToken: "AT",
      refreshToken: "RT",
      expiresAt: new Date("2026-01-01T01:00:00Z"),
      scope: "offline read:recovery",
    });
  });

  it("exchangeCode throws on non-OK", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 400 })));
    await expect(exchangeCode("c")).rejects.toThrow(/400/);
  });

  it("saveConnection stores encrypted, loadConnection decrypts, upserts", async () => {
    const db = await createTestDb();
    const t = {
      accessToken: "plain-access-token",
      refreshToken: "plain-refresh-token",
      expiresAt: new Date("2026-01-01T01:00:00Z"),
      scope: "offline",
    };
    await saveConnection(db, t, 42);
    const raw = await db.execute(sql`select * from whoop_connection`);
    const row = (raw as unknown as { rows: Record<string, unknown>[] }).rows[0];
    expect(JSON.stringify(row)).not.toContain("plain-access-token");
    expect(JSON.stringify(row)).not.toContain("plain-refresh-token");
    expect(await loadConnection(db)).toEqual({ ...t, status: "connected", whoopUserId: 42 });

    await saveConnection(db, { ...t, accessToken: "second" }, 42);
    const again = await loadConnection(db);
    expect(again?.accessToken).toBe("second");
    const count = await db.execute(sql`select count(*)::int as n from whoop_connection`);
    expect((count as unknown as { rows: { n: number }[] }).rows[0].n).toBe(1);
  });

  it("loadConnection returns null when empty", async () => {
    expect(await loadConnection(await createTestDb())).toBeNull();
  });
});

describe("parseProfileUserId", () => {
  it("returns a numeric user_id", () => {
    expect(parseProfileUserId({ user_id: 42, email: "x" })).toBe(42);
  });
  it("returns null for missing or non-number user_id", () => {
    expect(parseProfileUserId({})).toBeNull();
    expect(parseProfileUserId({ user_id: "42" })).toBeNull();
    expect(parseProfileUserId(null)).toBeNull();
    expect(parseProfileUserId("nope")).toBeNull();
  });
});
