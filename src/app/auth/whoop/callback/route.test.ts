import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "whoop_state" ? { name, value: "STATE" } : undefined),
  }),
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: vi.fn(async () => true) }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/whoop/connection", () => ({ saveConnection: vi.fn() }));
vi.mock("@/lib/whoop/oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/whoop/oauth")>()),
  exchangeCode: vi.fn(),
}));

import { exchangeCode } from "@/lib/whoop/oauth";
import { GET } from "./route";

const url = (q: string) => new NextRequest(`http://localhost:3000/auth/whoop/callback?${q}`);

describe("GET /auth/whoop/callback", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
    vi.mocked(exchangeCode).mockReset();
  });

  it("does not reflect error_description back to the browser", async () => {
    const res = await GET(url("error=access_denied&error_description=%3Cscript%3Eevil%3C%2Fscript%3E"));
    expect(res.status).toBe(400);
    const body = await res.text();
    expect(body).toBe("WHOOP authorization was denied or failed");
    expect(body).not.toContain("evil");
  });

  it("a thrown error returns a generic 502 and is logged server-side", async () => {
    vi.mocked(exchangeCode).mockRejectedValue(new Error("secret internal detail"));
    const res = await GET(url("state=STATE&code=abc"));
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).toBe("WHOOP connect failed");
    expect(body).not.toContain("secret internal detail");
    expect(errorSpy).toHaveBeenCalled();
  });
});
