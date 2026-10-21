import { describe, it, expect, beforeEach } from "vitest";
import { parseEnv, getEnv, resetEnvCache } from "@/lib/env";

const valid = {
  WHOOP_CLIENT_ID: "id",
  WHOOP_CLIENT_SECRET: "secret",
  WHOOP_REDIRECT_URI: "http://localhost:3000/auth/whoop/callback",
  APP_PASSWORD_HASH: "$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  SESSION_SECRET: "x".repeat(32),
  TOKEN_ENC_KEY: Buffer.alloc(32, 1).toString("base64"),
  CRON_SECRET: "cron",
  INGEST_TOKEN: "i".repeat(32),
};

describe("env", () => {
  beforeEach(() => resetEnvCache());

  it("lists every missing variable in the error", () => {
    expect(() => parseEnv({})).toThrowError(
      /WHOOP_CLIENT_ID[\s\S]*WHOOP_CLIENT_SECRET[\s\S]*WHOOP_REDIRECT_URI[\s\S]*APP_PASSWORD_HASH[\s\S]*SESSION_SECRET[\s\S]*TOKEN_ENC_KEY[\s\S]*CRON_SECRET/,
    );
  });

  it("accepts a valid bcrypt hash", () => {
    expect(() => parseEnv(valid)).not.toThrow();
  });

  it("rejects a mangled (dotenv-expanded) APP_PASSWORD_HASH", () => {
    expect(() =>
      parseEnv({ ...valid, APP_PASSWORD_HASH: "b.fx0DmCTKDeQ3lcpWlVKX.0" }),
    ).toThrowError(/APP_PASSWORD_HASH/);
    expect(() => parseEnv({ ...valid, APP_PASSWORD_HASH: "hash" })).toThrowError(
      /APP_PASSWORD_HASH/,
    );
  });

  it("requires INGEST_TOKEN of at least 32 characters", () => {
    expect(() => parseEnv({ ...valid, INGEST_TOKEN: undefined })).toThrowError(/INGEST_TOKEN/);
    expect(() => parseEnv({ ...valid, INGEST_TOKEN: "i".repeat(31) })).toThrowError(
      /INGEST_TOKEN/,
    );
    expect(() => parseEnv({ ...valid, INGEST_TOKEN: "i".repeat(32) })).not.toThrow();
  });

  it("defaults OWNER_TZ to America/Chicago", () => {
    expect(parseEnv(valid).OWNER_TZ).toBe("America/Chicago");
  });

  it("rejects a TOKEN_ENC_KEY that is not 32 bytes", () => {
    expect(() =>
      parseEnv({ ...valid, TOKEN_ENC_KEY: Buffer.alloc(16).toString("base64") }),
    ).toThrowError(/TOKEN_ENC_KEY/);
  });

  it("getEnv reads process.env and caches", () => {
    const saved = { ...process.env };
    Object.assign(process.env, valid);
    try {
      const a = getEnv();
      expect(getEnv()).toBe(a);
    } finally {
      process.env = saved;
    }
  });
});
