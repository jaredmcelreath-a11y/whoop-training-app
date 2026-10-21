import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";

let cookieValue: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "session" && cookieValue !== undefined
        ? { name, value: cookieValue }
        : undefined,
  }),
}));

import { createSessionToken, requireSession } from "@/lib/auth/session";

const ENV = {
  WHOOP_CLIENT_ID: "id",
  WHOOP_CLIENT_SECRET: "secret",
  WHOOP_REDIRECT_URI: "http://localhost:3000/auth/whoop/callback",
  APP_PASSWORD_HASH: "$2b$12$" + "a".repeat(53),
  SESSION_SECRET: "a".repeat(32),
  TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString("base64"),
  CRON_SECRET: "cron",
};

describe("requireSession", () => {
  let saved: NodeJS.ProcessEnv;
  beforeEach(() => {
    saved = process.env;
    process.env = { ...saved, ...ENV };
    resetEnvCache();
    cookieValue = undefined;
  });
  afterEach(() => {
    process.env = saved;
    resetEnvCache();
  });

  it("is true with a valid cookie", async () => {
    cookieValue = await createSessionToken();
    expect(await requireSession()).toBe(true);
  });
  it("is false with no cookie", async () => {
    expect(await requireSession()).toBe(false);
  });
  it("is false with an invalid cookie", async () => {
    cookieValue = "junk";
    expect(await requireSession()).toBe(false);
  });
});
