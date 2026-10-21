import { randomBytes } from "node:crypto";
import { getEnv } from "@/lib/env";

export const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
export const WHOOP_API_BASE = "https://api.prod.whoop.com/developer/v2";
export const WHOOP_SCOPES =
  "offline read:recovery read:cycles read:workout read:sleep read:profile read:body_measurement";

export type TokenSet = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
};

/** 8 URL-safe characters (WHOOP requires exactly 8). */
export function makeState(): string {
  return randomBytes(6).toString("base64url");
}

export function buildAuthorizeUrl(state: string): string {
  const env = getEnv();
  const u = new URL(WHOOP_AUTH_URL);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", env.WHOOP_CLIENT_ID);
  u.searchParams.set("redirect_uri", env.WHOOP_REDIRECT_URI);
  u.searchParams.set("scope", WHOOP_SCOPES);
  u.searchParams.set("state", state);
  return u.toString();
}

export async function exchangeCode(
  code: string,
  now: Date = new Date(),
): Promise<TokenSet> {
  const env = getEnv();
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: env.WHOOP_CLIENT_ID,
      client_secret: env.WHOOP_CLIENT_SECRET,
      redirect_uri: env.WHOOP_REDIRECT_URI,
    }).toString(),
  });
  if (!res.ok) throw new Error(`WHOOP token exchange failed: ${res.status}`);
  const j = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  };
  if (!j.refresh_token) {
    throw new Error("WHOOP did not return a refresh token (is the offline scope granted?)");
  }
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: new Date(now.getTime() + j.expires_in * 1000),
    scope: j.scope ?? WHOOP_SCOPES,
  };
}

/** Extracts `user_id` from a `/user/profile/basic` body; null if it isn't a number. */
export function parseProfileUserId(body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  const id = (body as { user_id?: unknown }).user_id;
  return typeof id === "number" ? id : null;
}
