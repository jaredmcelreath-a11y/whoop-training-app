import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db/client";
import { getEnv } from "@/lib/env";
import { processEvent, recordEvent, verifyWebhookRequest } from "@/lib/whoop/webhook";

/**
 * PUBLIC route (listed in the proxy's PUBLIC_PATHS). The HMAC signature is its
 * authentication, so it deliberately does not call requireSession().
 */
const eventSchema = z.object({
  user_id: z.number().int(),
  id: z.string().min(1),
  type: z.string().min(1),
  trace_id: z.string().min(1),
});

export async function POST(req: Request) {
  const rawBody = await req.text();
  const timestamp = req.headers.get("X-WHOOP-Signature-Timestamp") ?? "";
  const signature = req.headers.get("X-WHOOP-Signature") ?? "";
  if (!verifyWebhookRequest(rawBody, timestamp, signature, getEnv().WHOOP_CLIENT_SECRET)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }
  const parsed = eventSchema.safeParse(json);
  if (!parsed.success) return new NextResponse("Invalid event", { status: 400 });
  const evt = parsed.data;

  // Record durably before answering 2xx: if this fails, WHOOP gets a 500 and retries.
  const db = getDb();
  let fresh: boolean;
  try {
    fresh = await recordEvent(db, evt);
  } catch (err) {
    console.error(`WHOOP webhook ${evt.trace_id}: failed to record event:`, err);
    return new NextResponse("Failed to record event", { status: 500 });
  }
  if (!fresh) return new NextResponse(null, { status: 200 }); // duplicate trace_id

  // Respond fast; processEvent records errors in webhook_events; nothing may escape after().
  after(async () => {
    try {
      await processEvent(db, evt);
    } catch (err) {
      console.error(`WHOOP webhook ${evt.trace_id} (${evt.type}) failed:`, err);
    }
  });
  return new NextResponse(null, { status: 200 });
}
