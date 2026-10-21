import { NextResponse, connection, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { saveConnection } from "@/lib/whoop/connection";
import { WHOOP_API_BASE, exchangeCode, parseProfileUserId } from "@/lib/whoop/oauth";

function bad(message: string, status = 400) {
  const res = new NextResponse(message, { status });
  res.cookies.delete("whoop_state");
  return res;
}

export async function GET(req: NextRequest) {
  await connection();
  if (!(await requireSession())) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const params = req.nextUrl.searchParams;
  if (params.get("error")) return bad("WHOOP authorization was denied or failed");
  const state = params.get("state");
  const code = params.get("code");
  const expected = (await cookies()).get("whoop_state")?.value;
  if (!state || !expected || state !== expected) return bad("State mismatch");
  if (!code) return bad("Missing authorization code");

  try {
    const tokens = await exchangeCode(code);
    const profile = await fetch(`${WHOOP_API_BASE}/user/profile/basic`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!profile.ok) return bad(`Could not read WHOOP profile (${profile.status})`, 502);
    const user_id = parseProfileUserId(await profile.json());
    if (user_id === null) return bad("Unexpected WHOOP profile response", 502);
    await saveConnection(getDb(), tokens, user_id);
  } catch (e) {
    console.error("WHOOP connect failed", e);
    return bad("WHOOP connect failed", 502);
  }

  const res = NextResponse.redirect(new URL("/?connected=1", req.nextUrl));
  res.cookies.delete("whoop_state");
  return res;
}
