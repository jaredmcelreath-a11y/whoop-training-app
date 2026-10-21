import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { syncState, whoopConnection } from "@/db/schema";

vi.mock("./client", () => ({ whoopDelete: vi.fn() }));

import { whoopDelete } from "./client";
import { WhoopReconnectRequired } from "./tokens";
import { disconnectWhoop } from "./disconnect";

let db: Db;

const connect = () =>
  db.insert(whoopConnection).values({
    id: 1,
    whoopUserId: 1,
    accessTokenEnc: "x",
    refreshTokenEnc: "x",
    expiresAt: new Date("2030-01-01T00:00:00Z"),
    scope: "offline",
  });

beforeAll(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.delete(whoopConnection);
  await db.delete(syncState);
  vi.mocked(whoopDelete).mockReset();
});

describe("disconnectWhoop", () => {
  it("clears the whoop sync_state row so a reconnect backfills 7 days", async () => {
    await connect();
    await db.insert(syncState).values({ key: "whoop", lastSyncedAt: new Date() });
    vi.mocked(whoopDelete).mockResolvedValue(undefined);
    await disconnectWhoop(db);
    expect(await db.select().from(syncState)).toEqual([]);
  });

  it("revokes access at WHOOP, then deletes the connection row", async () => {
    await connect();
    vi.mocked(whoopDelete).mockResolvedValue(undefined);
    await disconnectWhoop(db);
    expect(whoopDelete).toHaveBeenCalledWith(db, "/user/access");
    expect(await db.select().from(whoopConnection)).toEqual([]);
  });

  it("still deletes the row when the revoke call throws", async () => {
    await connect();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(whoopDelete).mockRejectedValue(new Error("WHOOP DELETE /user/access failed: 500"));
    await disconnectWhoop(db);
    expect(await db.select().from(whoopConnection)).toEqual([]);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it("still deletes the row when WHOOP needs a reconnect", async () => {
    await connect();
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(whoopDelete).mockRejectedValue(new WhoopReconnectRequired());
    await disconnectWhoop(db);
    expect(await db.select().from(whoopConnection)).toEqual([]);
    err.mockRestore();
  });
});
