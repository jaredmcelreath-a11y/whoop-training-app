import type { Db } from "@/db/client";
import { setConnectionStatus } from "@/lib/whoop/connection";
import { WHOOP_API_BASE } from "@/lib/whoop/oauth";
import {
  WhoopReconnectRequired,
  getValidAccessToken,
  refreshAfterUnauthorized,
} from "@/lib/whoop/tokens";

const MAX_RATE_LIMIT_RETRIES = 3;
/** A single 429 wait longer than this is not worth holding a request open for. */
const MAX_RESET_SECONDS = 5;
/** Cap on the total time spent sleeping on 429s within one request. */
const MAX_TOTAL_WAIT_MS = 10_000;
const FETCH_TIMEOUT_MS = 10_000;
const PAGE_LIMIT = "25";

/** WHOOP rate-limited us and waiting it out would take too long. Transient. */
export class WhoopRateLimited extends Error {
  constructor(message = "WHOOP rate limit (429)") {
    super(message);
    this.name = "WhoopRateLimited";
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function buildUrl(path: string, query?: Record<string, string>): string {
  const u = new URL(WHOOP_API_BASE + path);
  for (const [k, v] of Object.entries(query ?? {})) u.searchParams.set(k, v);
  return u.toString();
}

async function request(db: Db, method: "GET" | "DELETE", url: string): Promise<Response> {
  let token = await getValidAccessToken(db);
  let refreshed = false;
  let rateRetries = 0;
  let waitedMs = 0;
  for (;;) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (res.status === 401) {
      if (refreshed) {
        await setConnectionStatus(db, "needs_reconnect");
        throw new WhoopReconnectRequired();
      }
      refreshed = true;
      token = await refreshAfterUnauthorized(db, token);
      continue;
    }

    if (res.status === 429) {
      if (rateRetries >= MAX_RATE_LIMIT_RETRIES) {
        throw new WhoopRateLimited(`WHOOP rate limit (429) persisted after ${rateRetries} retries`);
      }
      const reset = Number.parseInt(res.headers.get("X-RateLimit-Reset") ?? "", 10);
      if (!Number.isFinite(reset) || reset < 0 || reset > MAX_RESET_SECONDS) {
        throw new WhoopRateLimited("WHOOP rate limit (429): reset missing or too long to wait");
      }
      if (waitedMs + reset * 1000 > MAX_TOTAL_WAIT_MS) {
        throw new WhoopRateLimited("WHOOP rate limit (429): total wait would exceed 10 s");
      }
      rateRetries++;
      waitedMs += reset * 1000;
      await sleep(reset * 1000);
      continue;
    }

    if (!res.ok) throw new Error(`WHOOP ${method} ${new URL(url).pathname} failed: ${res.status}`);
    return res;
  }
}

export async function whoopGet<T>(
  db: Db,
  path: string,
  query?: Record<string, string>,
): Promise<T> {
  const res = await request(db, "GET", buildUrl(path, query));
  return (await res.json()) as T;
}

export async function whoopDelete(db: Db, path: string): Promise<void> {
  await request(db, "DELETE", buildUrl(path));
}

/** Fetches every page of a collection endpoint, following `next_token`. */
export async function listAll<T>(
  db: Db,
  path: string,
  range: { start: Date; end?: Date },
): Promise<T[]> {
  const out: T[] = [];
  let nextToken: string | undefined;
  do {
    const query: Record<string, string> = { start: range.start.toISOString(), limit: PAGE_LIMIT };
    if (range.end) query.end = range.end.toISOString();
    if (nextToken) query.nextToken = nextToken;
    const page = await whoopGet<{ records?: T[]; next_token?: string | null }>(db, path, query);
    out.push(...(page.records ?? []));
    nextToken = page.next_token ?? undefined;
  } while (nextToken);
  return out;
}
