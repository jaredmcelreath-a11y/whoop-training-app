import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { nutritionDays } from "@/db/schema";
import { resetEnvCache } from "@/lib/env";

let db: Db;
vi.mock("@/db/client", () => ({ getDb: () => db }));

import { POST } from "./route";

const TOKEN = "t".repeat(32);
const ENV = {
  WHOOP_CLIENT_ID: "cid",
  WHOOP_CLIENT_SECRET: "csecret",
  WHOOP_REDIRECT_URI: "http://localhost:3000/auth/whoop/callback",
  APP_PASSWORD_HASH: "$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  SESSION_SECRET: "x".repeat(32),
  TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString("base64"),
  CRON_SECRET: "cron-secret",
  INGEST_TOKEN: TOKEN,
};
const originalEnv = process.env;

const body = (totals: Record<string, unknown>, days?: unknown) =>
  JSON.stringify({
    sentAt: "2026-03-02T10:00:00Z",
    days: days ?? [{ date: "2026-03-02", totals }],
  });
const post = (raw: string, auth: string | null = `Bearer ${TOKEN}`, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost:3000/api/ingest/health", {
      method: "POST",
      body: raw,
      headers: { ...(auth ? { authorization: auth } : {}), ...headers },
    }),
  );
const rows = () => db.select().from(nutritionDays);

beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(() => {
  process.env = { ...originalEnv, ...ENV };
  delete process.env.DATABASE_URL;
  resetEnvCache();
});
afterEach(async () => {
  await db.delete(nutritionDays);
  process.env = originalEnv;
  resetEnvCache();
});

describe("POST /api/ingest/health", () => {
  it("401 without a token, with a wrong same-length token, or a non-bearer scheme", async () => {
    expect((await post(body({}), null)).status).toBe(401);
    expect((await post(body({}), `Bearer ${"u".repeat(32)}`)).status).toBe(401);
    expect((await post(body({}), `Bearer short`)).status).toBe(401);
    expect((await post(body({}), `Basic ${TOKEN}`)).status).toBe(401);
    expect(await rows()).toHaveLength(0);
  });

  it("413 for an oversized body (declared or actual)", async () => {
    const big = JSON.stringify({ pad: "a".repeat(70 * 1024) });
    expect((await post(big)).status).toBe(413);
    expect((await post("{}", `Bearer ${TOKEN}`, { "content-length": "70000" })).status).toBe(413);
    expect(await rows()).toHaveLength(0);
  });

  it("400 for invalid JSON, negative values and 4 days; nothing written", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post(body({ energy_kcal: -5 }))).status).toBe(400);
    const days = ["01", "02", "03", "04"].map((d) => ({ date: `2026-03-${d}`, totals: {} }));
    expect((await post(body({}, days))).status).toBe(400);
    expect(await rows()).toHaveLength(0);
  });

  it("400 for a sentAt more than 5 minutes ahead of the server clock; nothing written", async () => {
    const ahead = (ms: number) =>
      JSON.stringify({ sentAt: new Date(Date.now() + ms).toISOString(), days: [{ date: "2026-03-02", totals: { energy_kcal: 1800 } }] });
    const res = await post(ahead(10 * 60_000));
    expect(res.status).toBe(400);
    expect(await res.text()).toMatch(/sentAt/);
    expect(await rows()).toHaveLength(0);
    expect((await post(ahead(60_000))).status).toBe(200);
  });

  it("200 writes, reports unknown keys, and does not store them", async () => {
    const res = await post(body({ energy_kcal: 1800, mystery: 3 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ written: 1, ignoredKeys: ["mystery"] });
    const [row] = await rows();
    expect(row.kcal).toBe(1800);
    expect(JSON.stringify(row)).not.toContain("mystery");
  });
});
