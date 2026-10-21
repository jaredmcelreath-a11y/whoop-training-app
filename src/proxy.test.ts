import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { proxy, isPublicPath, PUBLIC_PATHS } from "@/proxy";
import { createSessionToken } from "@/lib/auth/session";
import { resetEnvCache } from "@/lib/env";

const ENV = {
  WHOOP_CLIENT_ID: "id",
  WHOOP_CLIENT_SECRET: "secret",
  WHOOP_REDIRECT_URI: "http://localhost:3000/auth/whoop/callback",
  APP_PASSWORD_HASH: "$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  SESSION_SECRET: "a".repeat(32),
  TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString("base64"),
  CRON_SECRET: "cron",
};

describe("proxy (auth gate)", () => {
  let saved: NodeJS.ProcessEnv;
  beforeEach(() => {
    saved = process.env;
    process.env = { ...saved, ...ENV };
    resetEnvCache();
  });
  afterEach(() => {
    process.env = saved;
    resetEnvCache();
  });

  it("redirects / to /login with no cookie", async () => {
    const res = await proxy(new NextRequest("http://localhost:3000/"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("passes /api/webhooks/whoop through with no cookie", async () => {
    const res = await proxy(
      new NextRequest("http://localhost:3000/api/webhooks/whoop"),
    );
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("redirects with a bad cookie, passes with a valid one", async () => {
    const bad = await proxy(
      new NextRequest("http://localhost:3000/", {
        headers: { cookie: "session=junk" },
      }),
    );
    expect(bad.status).toBe(307);
    const token = await createSessionToken();
    const ok = await proxy(
      new NextRequest("http://localhost:3000/", {
        headers: { cookie: `session=${token}` },
      }),
    );
    expect(ok.headers.get("location")).toBeNull();
  });

  it("matches public paths", () => {
    expect(PUBLIC_PATHS).toContain("/login");
    expect(isPublicPath("/icons/a.png")).toBe(true);
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/loginx")).toBe(false);
    expect(isPublicPath("/")).toBe(false);
  });
});
