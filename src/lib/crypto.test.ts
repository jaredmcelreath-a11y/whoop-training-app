import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt } from "@/lib/crypto";
import { resetEnvCache } from "@/lib/env";

const ENV = {
  WHOOP_CLIENT_ID: "id",
  WHOOP_CLIENT_SECRET: "secret",
  WHOOP_REDIRECT_URI: "http://localhost:3000/auth/whoop/callback",
  APP_PASSWORD_HASH: "$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  SESSION_SECRET: "x".repeat(32),
  TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString("base64"),
  CRON_SECRET: "cron",
  INGEST_TOKEN: "i".repeat(32),
};

describe("crypto", () => {
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

  it("round-trips", () => {
    expect(decrypt(encrypt("abc"))).toBe("abc");
  });

  it("uses iv.tag.ciphertext format", () => {
    expect(encrypt("abc").split(".")).toHaveLength(3);
  });

  it("produces different blobs for the same text", () => {
    expect(encrypt("abc")).not.toBe(encrypt("abc"));
  });

  it("throws when ciphertext is tampered", () => {
    const [iv, tag, ct] = encrypt("hello world").split(".");
    const buf = Buffer.from(ct, "base64");
    buf[0] ^= 1;
    expect(() => decrypt([iv, tag, buf.toString("base64")].join("."))).toThrow();
  });

  it("throws when the tag is tampered", () => {
    const [iv, tag, ct] = encrypt("hello world").split(".");
    const buf = Buffer.from(tag, "base64");
    buf[0] ^= 1;
    expect(() => decrypt([iv, buf.toString("base64"), ct].join("."))).toThrow();
  });

  it("rejects a truncated (but otherwise genuine) tag", () => {
    const [iv, tag, ct] = encrypt("hello world").split(".");
    const short = Buffer.from(tag, "base64").subarray(0, 8).toString("base64");
    expect(() => decrypt([iv, short, ct].join("."))).toThrow("Invalid encrypted blob");
  });

  it("rejects malformed blobs", () => {
    const [iv, tag, ct] = encrypt("hello world").split(".");
    const longIv = Buffer.alloc(16, 1).toString("base64");
    expect(() => decrypt([longIv, tag, ct].join("."))).toThrow("Invalid encrypted blob");
    expect(() => decrypt(["", tag, ct].join("."))).toThrow("Invalid encrypted blob");
    expect(() => decrypt([iv, tag].join("."))).toThrow("Invalid encrypted blob");
    expect(() => decrypt("not-a-blob")).toThrow("Invalid encrypted blob");
  });
});
