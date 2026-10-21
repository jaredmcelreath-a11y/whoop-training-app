import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { getEnv } from "@/lib/env";
import { IngestPayload, ingestDays, MAX_BODY_BYTES, sentAtTooFarAhead } from "@/lib/nutrition/ingest";

/**
 * PUBLIC route (listed in the proxy's PUBLIC_PATHS). The bearer INGEST_TOKEN is its
 * authentication, so it deliberately does not call requireSession().
 */
function bearerOk(header: string | null): boolean {
  const m = header?.match(/^Bearer (\S+)$/i);
  if (!m) return false;
  const given = Buffer.from(m[1]);
  const expected = Buffer.from(getEnv().INGEST_TOKEN);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(req: Request) {
  if (!bearerOk(req.headers.get("authorization"))) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return new NextResponse("Payload too large", { status: 413 });
  }
  const raw = await req.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
    return new NextResponse("Payload too large", { status: 413 });
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }
  const parsed = IngestPayload.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return new NextResponse(`Invalid payload: ${issue.path.join(".")} ${issue.message}`, { status: 400 });
  }
  if (sentAtTooFarAhead(parsed.data.sentAt, new Date())) {
    return new NextResponse("Invalid payload: sentAt is in the future; check the phone's clock", { status: 400 });
  }
  const result = await ingestDays(getDb(), parsed.data);
  return NextResponse.json(result);
}
