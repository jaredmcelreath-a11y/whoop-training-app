import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { webhookEvents } from "@/db/schema";
import { whoopGet } from "@/lib/whoop/client";
import { loadConnection } from "@/lib/whoop/connection";
import type { RecoveryPayload, SleepPayload, WorkoutPayload } from "@/lib/whoop/normalize";
import { deleteRecord, upsertRecord } from "@/lib/whoop/sync";

/** Max allowed distance between X-WHOOP-Signature-Timestamp and now, either direction. */
export const MAX_SKEW_MS = 5 * 60_000;

export type WebhookEvent = { user_id: number; id: string; type: string; trace_id: string };
export type HandleResult = "processed" | "duplicate" | "ignored";

/** base64(HMAC_SHA256(secret, timestamp + rawBody)), compared in constant time. */
export function verifySignature(rawBody: string, timestamp: string, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(timestamp + rawBody).digest();
  const given = Buffer.from(signature, "base64");
  if (given.length !== expected.length) return false;
  // Reject non-canonical base64 (Buffer.from silently skips invalid chars).
  if (given.toString("base64") !== signature) return false;
  return timingSafeEqual(given, expected);
}

/** `timestamp` is milliseconds since the epoch, digits only. */
export function isFreshTimestamp(timestamp: string, now: number = Date.now()): boolean {
  if (!/^\d+$/.test(timestamp)) return false;
  return Math.abs(now - Number(timestamp)) <= MAX_SKEW_MS;
}

export function verifyWebhookRequest(
  rawBody: string,
  timestamp: string,
  signature: string,
  secret: string,
  now: number = Date.now(),
): boolean {
  return isFreshTimestamp(timestamp, now) && verifySignature(rawBody, timestamp, signature, secret);
}

type Resource = "workout" | "sleep" | "recovery";
const RESOURCES: readonly Resource[] = ["workout", "sleep", "recovery"];

function parseType(type: string): { resource: Resource; action: "updated" | "deleted" } | null {
  const [resource, action, ...rest] = type.split(".");
  if (rest.length || !RESOURCES.includes(resource as Resource)) return null;
  if (action !== "updated" && action !== "deleted") return null;
  return { resource: resource as Resource, action };
}

async function apply(db: Db, resource: Resource, action: "updated" | "deleted", id: string): Promise<void> {
  if (action === "deleted") return deleteRecord(db, resource, id);
  const enc = encodeURIComponent(id);
  switch (resource) {
    case "workout":
      return upsertRecord(db, "workout", await whoopGet<WorkoutPayload>(db, `/activity/workout/${enc}`));
    case "sleep":
      return upsertRecord(db, "sleep", await whoopGet<SleepPayload>(db, `/activity/sleep/${enc}`));
    case "recovery": {
      // For recovery events, `id` is the sleep UUID.
      const sleep = await whoopGet<SleepPayload>(db, `/activity/sleep/${enc}`);
      const recovery = await whoopGet<RecoveryPayload>(db, `/cycle/${sleep.cycle_id}/recovery`);
      return upsertRecord(db, "recovery", recovery);
    }
  }
}

async function finish(db: Db, traceId: string, error: string | null, processed: boolean) {
  await db
    .update(webhookEvents)
    .set({ processedAt: processed ? new Date() : null, error })
    .where(eq(webhookEvents.traceId, traceId));
}

/** Durably records the event before the 200. Returns false for a duplicate trace_id. */
export async function recordEvent(db: Db, evt: WebhookEvent): Promise<boolean> {
  const inserted = await db
    .insert(webhookEvents)
    .values({ traceId: evt.trace_id, type: evt.type, objectId: evt.id, userId: evt.user_id })
    .onConflictDoNothing({ target: webhookEvents.traceId })
    .returning({ traceId: webhookEvents.traceId });
  return inserted.length > 0;
}

/**
 * Applies an already-recorded event. Sets processed_at on success or ignore.
 * On failure it writes `error`, leaves `processed_at` null, and rethrows.
 */
export async function processEvent(db: Db, evt: WebhookEvent): Promise<"processed" | "ignored"> {
  try {
    const conn = await loadConnection(db);
    let reason: string | null = null;
    const parsed = parseType(evt.type);
    if (!conn) reason = "not connected";
    else if (conn.status === "needs_reconnect") reason = "needs_reconnect";
    else if (conn.whoopUserId !== evt.user_id) reason = "user_id mismatch";
    else if (!parsed) reason = `unknown type ${evt.type}`;

    if (reason || !parsed) {
      await finish(db, evt.trace_id, `ignored: ${reason}`, true);
      return "ignored";
    }

    await apply(db, parsed.resource, parsed.action, evt.id);
    await finish(db, evt.trace_id, null, true);
    return "processed";
  } catch (err) {
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    await finish(db, evt.trace_id, message, false);
    throw err;
  }
}

/** recordEvent + processEvent, for direct callers. */
export async function handleEvent(db: Db, evt: WebhookEvent): Promise<HandleResult> {
  if (!(await recordEvent(db, evt))) return "duplicate";
  return processEvent(db, evt);
}
