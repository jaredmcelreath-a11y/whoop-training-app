import { createHmac } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { recoveries, sleeps, webhookEvents, whoopConnection, whoopRaw, workouts } from "@/db/schema";
import { resetEnvCache } from "@/lib/env";
import sleepScored from "./fixtures/sleep-scored.json";
import workoutScored from "./fixtures/workout-scored.json";
import recoveryScored from "./fixtures/recovery-scored.json";

// after() callbacks are queued and only run when the test calls flush().
const pending: (() => unknown)[] = [];
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((cb: () => unknown) => {
      pending.push(cb);
    }),
  };
});
vi.mock("./client", () => ({ whoopGet: vi.fn(), listAll: vi.fn() }));
let db: Db;
vi.mock("@/db/client", () => ({ getDb: () => db }));

import { after } from "next/server";
import { whoopGet } from "./client";
import { saveConnection, setConnectionStatus } from "./connection";
import { handleEvent, isFreshTimestamp, verifySignature } from "./webhook";
import { POST } from "@/app/api/webhooks/whoop/route";

const SECRET = "csecret";
const ENV = {
  WHOOP_CLIENT_ID: "cid",
  WHOOP_CLIENT_SECRET: SECRET,
  WHOOP_REDIRECT_URI: "http://localhost:3000/auth/whoop/callback",
  APP_PASSWORD_HASH: "$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  SESSION_SECRET: "x".repeat(32),
  TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString("base64"),
  CRON_SECRET: "cron",
  INGEST_TOKEN: "i".repeat(32),
};
const USER_ID = 99999;

const sign = (ts: string, body: string, secret = SECRET) =>
  createHmac("sha256", secret).update(ts + body).digest("base64");

async function connect(userId = USER_ID) {
  await saveConnection(
    db,
    { accessToken: "AT", refreshToken: "RT", expiresAt: new Date(Date.now() + 3_600_000), scope: "offline" },
    userId,
  );
}

function request(body: string, opts: { ts?: string; sig?: string } = {}) {
  const ts = opts.ts ?? String(Date.now());
  const sig = opts.sig ?? sign(ts, body);
  return new Request("http://localhost:3000/api/webhooks/whoop", {
    method: "POST",
    // Lowercase on purpose: header lookup must be case-insensitive.
    headers: { "x-whoop-signature": sig, "x-whoop-signature-timestamp": ts, "content-type": "application/json" },
    body,
  });
}

const flush = async () => {
  while (pending.length) await pending.shift()!();
};

const originalEnv = process.env;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(() => {
  process.env = { ...originalEnv, ...ENV };
  delete process.env.DATABASE_URL;
  resetEnvCache();
});
afterEach(async () => {
  await flush();
  for (const t of [webhookEvents, whoopConnection, whoopRaw, recoveries, sleeps, workouts]) await db.delete(t);
  vi.mocked(whoopGet).mockReset();
  vi.mocked(after).mockClear();
  vi.restoreAllMocks();
  process.env = originalEnv;
  resetEnvCache();
});

describe("verifySignature", () => {
  const raw = '{ "id" :"x",\n "type":"sleep.updated"}';
  const ts = "1760900000000";

  it("verifies over the exact raw body, whitespace included", () => {
    expect(verifySignature(raw, ts, sign(ts, raw), SECRET)).toBe(true);
  });

  it("fails for re-serialized JSON", () => {
    const reserialized = JSON.stringify(JSON.parse(raw));
    expect(verifySignature(reserialized, ts, sign(ts, raw), SECRET)).toBe(false);
  });

  it("fails for a wrong signature, wrong secret, or a length mismatch", () => {
    expect(verifySignature(raw, ts, sign(ts, raw + " "), SECRET)).toBe(false);
    expect(verifySignature(raw, ts, sign(ts, raw, "other"), SECRET)).toBe(false);
    expect(verifySignature(raw, ts, "short", SECRET)).toBe(false);
    expect(verifySignature(raw, ts, "", SECRET)).toBe(false);
  });
});

describe("isFreshTimestamp", () => {
  const now = 1_760_900_000_000;
  it("accepts within 5 minutes either way", () => {
    expect(isFreshTimestamp(String(now), now)).toBe(true);
    expect(isFreshTimestamp(String(now - 299_000), now)).toBe(true);
    expect(isFreshTimestamp(String(now + 299_000), now)).toBe(true);
  });
  it("rejects more than 5 minutes old or ahead, and non-numeric", () => {
    expect(isFreshTimestamp(String(now - 301_000), now)).toBe(false);
    expect(isFreshTimestamp(String(now + 301_000), now)).toBe(false);
    expect(isFreshTimestamp("abc", now)).toBe(false);
    expect(isFreshTimestamp("", now)).toBe(false);
    expect(isFreshTimestamp("12.5", now)).toBe(false);
  });
});

describe("POST /api/webhooks/whoop", () => {
  const body = JSON.stringify({ user_id: USER_ID, id: workoutScored.id, type: "workout.updated", trace_id: "t-route" });

  it("returns 401 for a wrong signature and does nothing", async () => {
    const res = await POST(request(body, { sig: sign(String(Date.now()), body, "wrong") }));
    expect(res.status).toBe(401);
    await flush();
    expect(await db.select().from(webhookEvents)).toHaveLength(0);
  });

  it("returns 401 when the timestamp is more than 5 minutes old", async () => {
    const ts = String(Date.now() - 6 * 60_000);
    const res = await POST(request(body, { ts }));
    expect(res.status).toBe(401);
    await flush();
    expect(await db.select().from(webhookEvents)).toHaveLength(0);
  });

  it("returns 400 for a correctly signed body that is not valid JSON", async () => {
    const res = await POST(request("{not json"));
    expect(res.status).toBe(400);
  });

  it("returns 200 with no connection, and records the event as ignored", async () => {
    const res = await POST(request(body));
    expect(res.status).toBe(200);
    await flush();
    const [row] = await db.select().from(webhookEvents);
    expect(row).toMatchObject({ traceId: "t-route", type: "workout.updated", objectId: workoutScored.id, userId: USER_ID });
    expect(row.processedAt).not.toBeNull();
    expect(row.error).toMatch(/^ignored: /);
    expect(whoopGet).not.toHaveBeenCalled();
  });

  it("returns 200 and processes the event after the response", async () => {
    await connect();
    vi.mocked(whoopGet).mockResolvedValue(workoutScored as never);
    const res = await POST(request(body));
    expect(res.status).toBe(200);
    await flush();
    expect(await db.select().from(workouts)).toHaveLength(1);
    const [row] = await db.select().from(webhookEvents);
    expect(row.processedAt).not.toBeNull();
    expect(row.error).toBeNull();
  });

  it("records a fresh event before after() runs, then returns 200", async () => {
    const res = await POST(request(body));
    expect(res.status).toBe(200);
    expect(after).toHaveBeenCalledTimes(1);
    expect(pending).toHaveLength(1); // not run yet
    const [row] = await db.select().from(webhookEvents);
    expect(row).toMatchObject({ traceId: "t-route", processedAt: null, error: null });
  });

  it("a duplicate trace_id returns 200 without scheduling after()", async () => {
    expect((await POST(request(body))).status).toBe(200);
    await flush();
    vi.mocked(after).mockClear();
    const res = await POST(request(body));
    expect(res.status).toBe(200);
    expect(after).not.toHaveBeenCalled();
    expect(await db.select().from(webhookEvents)).toHaveLength(1);
  });

  it("returns 500 when the insert fails, without scheduling after()", async () => {
    vi.spyOn(db, "insert").mockImplementationOnce(() => {
      throw new Error("db down");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(request(body));
    expect(res.status).toBe(500);
    expect(after).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
  });

  it("records a processing error without throwing out of after()", async () => {
    await connect();
    vi.mocked(whoopGet).mockRejectedValue(new Error("boom"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(request(body));
    expect(res.status).toBe(200);
    await expect(flush()).resolves.toBeUndefined();
    const [row] = await db.select().from(webhookEvents);
    expect(row.error).toContain("boom");
    expect(row.processedAt).toBeNull();
    spy.mockRestore();
  });
});

describe("handleEvent", () => {
  const evt = (type: string, id: string, trace_id = `t-${type}-${id}`, user_id = USER_ID) => ({ user_id, id, type, trace_id });

  it("returns ignored when no connection exists", async () => {
    expect(await handleEvent(db, evt("sleep.updated", sleepScored.id))).toBe("ignored");
    expect(whoopGet).not.toHaveBeenCalled();
  });

  it("returns ignored when the connection needs reconnect", async () => {
    await connect();
    await setConnectionStatus(db, "needs_reconnect");
    expect(await handleEvent(db, evt("sleep.updated", sleepScored.id))).toBe("ignored");
    expect(whoopGet).not.toHaveBeenCalled();
  });

  it("returns ignored when user_id doesn't match the connection", async () => {
    await connect();
    expect(await handleEvent(db, evt("sleep.updated", sleepScored.id, "t-other", 12345))).toBe("ignored");
    expect(whoopGet).not.toHaveBeenCalled();
    const [row] = await db.select().from(webhookEvents).where(eq(webhookEvents.traceId, "t-other"));
    expect(row.processedAt).not.toBeNull();
    expect(row.error).toMatch(/^ignored: /);
  });

  it("returns ignored for an unknown event type", async () => {
    await connect();
    expect(await handleEvent(db, evt("cycle.updated", "123"))).toBe("ignored");
    expect(whoopGet).not.toHaveBeenCalled();
  });

  it("same trace_id twice: processed then duplicate, with only 1 fetch", async () => {
    await connect();
    vi.mocked(whoopGet).mockResolvedValue(sleepScored as never);
    const e = evt("sleep.updated", sleepScored.id, "t-dup");
    expect(await handleEvent(db, e)).toBe("processed");
    expect(await handleEvent(db, e)).toBe("duplicate");
    expect(whoopGet).toHaveBeenCalledTimes(1);
    expect(await db.select().from(sleeps)).toHaveLength(1);
  });

  it("workout.updated fetches /activity/workout/{id} and upserts it", async () => {
    await connect();
    vi.mocked(whoopGet).mockResolvedValue(workoutScored as never);
    expect(await handleEvent(db, evt("workout.updated", workoutScored.id))).toBe("processed");
    expect(whoopGet).toHaveBeenCalledWith(db, `/activity/workout/${workoutScored.id}`);
    const rows = await db.select().from(workouts);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(workoutScored.id);
  });

  it("sleep.updated fetches /activity/sleep/{id} and upserts it", async () => {
    await connect();
    vi.mocked(whoopGet).mockResolvedValue(sleepScored as never);
    expect(await handleEvent(db, evt("sleep.updated", sleepScored.id))).toBe("processed");
    expect(whoopGet).toHaveBeenCalledWith(db, `/activity/sleep/${sleepScored.id}`);
    expect(await db.select().from(sleeps)).toHaveLength(1);
  });

  it("sleep.deleted calls deleteRecord('sleep', id)", async () => {
    await connect();
    vi.mocked(whoopGet).mockResolvedValue(sleepScored as never);
    await handleEvent(db, evt("sleep.updated", sleepScored.id));
    expect(await db.select().from(sleeps)).toHaveLength(1);
    expect(await handleEvent(db, evt("sleep.deleted", sleepScored.id))).toBe("processed");
    expect(await db.select().from(sleeps)).toHaveLength(0);
    expect(whoopGet).toHaveBeenCalledTimes(1);
  });

  it("a delete before its update is a no-op, and the later update re-inserts", async () => {
    await connect();
    vi.mocked(whoopGet).mockResolvedValue(workoutScored as never);
    expect(await handleEvent(db, evt("workout.deleted", workoutScored.id))).toBe("processed");
    expect(await handleEvent(db, evt("workout.updated", workoutScored.id))).toBe("processed");
    expect(await db.select().from(workouts)).toHaveLength(1);
  });

  it("recovery.updated: id is the sleep UUID; fetches sleep, then /cycle/{cycle_id}/recovery, and upserts", async () => {
    await connect();
    vi.mocked(whoopGet).mockImplementation((async (_db: Db, path: string) => {
      if (path === `/activity/sleep/${sleepScored.id}`) return sleepScored;
      if (path === `/cycle/${sleepScored.cycle_id}/recovery`) return recoveryScored;
      throw new Error(`unexpected path ${path}`);
    }) as never);
    expect(await handleEvent(db, evt("recovery.updated", sleepScored.id))).toBe("processed");
    expect(vi.mocked(whoopGet).mock.calls.map((c) => c[1])).toEqual([
      `/activity/sleep/${sleepScored.id}`,
      `/cycle/${sleepScored.cycle_id}/recovery`,
    ]);
    const rows = await db.select().from(recoveries);
    expect(rows).toHaveLength(1);
    expect(rows[0].cycleId).toBe(recoveryScored.cycle_id);
  });

  it("recovery.deleted deletes by sleep UUID", async () => {
    await connect();
    const { upsertRecord } = await import("./sync");
    await upsertRecord(db, "recovery", recoveryScored);
    expect(await handleEvent(db, evt("recovery.deleted", recoveryScored.sleep_id))).toBe("processed");
    expect(await db.select().from(recoveries)).toHaveLength(0);
  });

  it("on failure, writes the error, leaves processed_at null, and rethrows", async () => {
    await connect();
    vi.mocked(whoopGet).mockRejectedValue(new Error("WHOOP GET failed: 500"));
    await expect(handleEvent(db, evt("sleep.updated", sleepScored.id, "t-fail"))).rejects.toThrow("500");
    const [row] = await db.select().from(webhookEvents).where(eq(webhookEvents.traceId, "t-fail"));
    expect(row.error).toContain("500");
    expect(row.processedAt).toBeNull();
  });
});
