import { NextResponse } from "next/server";
import { connection } from "next/server";
import { requireSession } from "@/lib/auth/session";
import { buildAuthorizeUrl, makeState } from "@/lib/whoop/oauth";

export async function GET() {
  await connection();
  if (!(await requireSession())) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const state = makeState();
  const res = NextResponse.redirect(buildAuthorizeUrl(state));
  res.cookies.set("whoop_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
