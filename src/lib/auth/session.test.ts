import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createSessionToken, verifySessionToken } from "@/lib/auth/session";
import { resetEnvCache } from "@/lib/env";

const ENV = {
  WHOOP_CLIENT_ID: "id",
  WHOOP_CLIENT_SECRET: "secret",
  WHOOP_REDIRECT_URI: "http://localhost:3000/auth/whoop/callback",
  APP_PASSWORD_HASH: "$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  SESSION_SECRET: "a".repeat(32),
  TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString("base64"),
  CRON_SECRET: "cron",
  INGEST_TOKEN: "i".repeat(32),
};

describe("session tokens", () => {
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

  it("verifies a fresh token", async () => {
    expect(await verifySessionToken(await createSessionToken())).toBe(true);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken();
    process.env = { ...process.env, SESSION_SECRET: "b".repeat(32) };
    resetEnvCache();
    expect(await verifySessionToken(token)).toBe(false);
  });

  it("rejects a token created 31 days ago", async () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    expect(await verifySessionToken(await createSessionToken(old))).toBe(false);
  });

  it("rejects garbage", async () => {
    expect(await verifySessionToken("not.a.jwt")).toBe(false);
  });
});
