import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { nutritionDays } from "@/db/schema";
import {
  IngestPayload,
  ingestDays,
  MAX_BODY_BYTES,
  MAX_IGNORED_KEYS,
  MAX_SENT_AT_AHEAD_MS,
  readBodyCapped,
  sentAtTooFarAhead,
  type IngestPayloadT,
} from "./ingest";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await db.delete(nutritionDays);
});

const payload = (sentAt: string, totals: Record<string, number>, date = "2026-03-02"): IngestPayloadT =>
  IngestPayload.parse({ sentAt, days: [{ date, totals }] });

describe("ingestDays", () => {
  it("replaces a day's totals with the later post, never summing", async () => {
    await ingestDays(db, payload("2026-03-02T10:00:00Z", { energy_kcal: 1000, protein_g: 50 }));
    const r = await ingestDays(db, payload("2026-03-02T20:00:00Z", { energy_kcal: 2500 }));
    expect(r.written).toBe(1);
    const [row] = await db.select().from(nutritionDays);
    expect(row.kcal).toBe(2500);
    expect(row.proteinG).toBeNull();
    expect(row.source).toBe("apple_health");
  });

  it("an older post replayed after a newer one changes nothing", async () => {
    await ingestDays(db, payload("2026-03-02T10:00:00Z", { energy_kcal: 1000 }));
    await ingestDays(db, payload("2026-03-02T20:00:00Z", { energy_kcal: 2500 }));
    const r = await ingestDays(db, payload("2026-03-02T10:00:00Z", { energy_kcal: 1000 }));
    expect(r.written).toBe(0);
    const [row] = await db.select().from(nutritionDays);
    expect(row.kcal).toBe(2500);
  });

  it("maps columns and micros with canonical units; reports unknown keys once", async () => {
    const r = await ingestDays(
      db,
      payload("2026-03-02T10:00:00Z", {
        energy_kcal: 2000,
        protein_g: 100,
        carbs_g: 250,
        fat_g: 70,
        fiber_g: 30,
        water_ml: 2000,
        iron_mg: 12,
        vitamin_d_ug: 15,
        bogus: 1,
      }),
    );
    expect(r.ignoredKeys).toEqual(["bogus"]);
    const [row] = await db.select().from(nutritionDays);
    expect([row.kcal, row.proteinG, row.carbsG, row.fatG, row.fiberG, row.waterMl]).toEqual([
      2000, 100, 250, 70, 30, 2000,
    ]);
    expect(row.micros).toEqual({
      iron_mg: { value: 12, unit: "mg" },
      vitamin_d_ug: { value: 15, unit: "ug" },
    });
  });

  it("dedupes ignored keys across days", async () => {
    const p = IngestPayload.parse({
      sentAt: "2026-03-03T10:00:00Z",
      days: [
        { date: "2026-03-01", totals: { zzz: 1 } },
        { date: "2026-03-02", totals: { zzz: 2 } },
      ],
    });
    const r = await ingestDays(db, p);
    expect(r.ignoredKeys).toEqual(["zzz"]);
    expect(r.written).toBe(2);
  });
});

describe("ignored-keys echo cap", () => {
  it("echoes at most MAX_IGNORED_KEYS unknown keys, plus the full count", async () => {
    const totals = Object.fromEntries(Array.from({ length: 30 }, (_, k) => [`junk_${k}`, 1]));
    const r = await ingestDays(db, payload("2026-03-02T10:00:00Z", { energy_kcal: 1800, ...totals }));
    expect(r.ignoredKeys).toHaveLength(MAX_IGNORED_KEYS);
    expect(MAX_IGNORED_KEYS).toBe(20);
    expect(r.ignoredKeys[0]).toBe("junk_0");
    expect(r.ignoredKeyCount).toBe(30);
    expect(r.written).toBe(1);
  });

  it("counts every unknown key when under the cap", async () => {
    const r = await ingestDays(db, payload("2026-03-02T10:00:00Z", { a: 1, b: 2 }));
    expect(r).toMatchObject({ ignoredKeys: ["a", "b"], ignoredKeyCount: 2 });
  });
});

describe("readBodyCapped", () => {
  const enc = new TextEncoder();
  /** A stream of `chunks` chunks of `size` bytes; counts how many were pulled. */
  function chunked(chunks: number, size: number) {
    const state = { pulled: 0, cancelled: false };
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        if (state.pulled >= chunks) return c.close();
        state.pulled++;
        c.enqueue(enc.encode("a".repeat(size)));
      },
      cancel() {
        state.cancelled = true;
      },
    });
    return { stream, state };
  }

  it("returns the text of a body within the limit, split across chunks", async () => {
    const { stream } = chunked(4, 1024);
    expect(await readBodyCapped(stream, MAX_BODY_BYTES)).toBe("a".repeat(4096));
  });

  it("returns null at exactly one byte over, and the full body at the limit", async () => {
    expect(await readBodyCapped(chunked(1, MAX_BODY_BYTES + 1).stream, MAX_BODY_BYTES)).toBeNull();
    expect(await readBodyCapped(chunked(1, MAX_BODY_BYTES).stream, MAX_BODY_BYTES)).toHaveLength(MAX_BODY_BYTES);
  });

  it("stops reading and cancels the stream once past the limit", async () => {
    const { stream, state } = chunked(1000, 16 * 1024);
    expect(await readBodyCapped(stream, MAX_BODY_BYTES)).toBeNull();
    expect(state.pulled).toBeLessThanOrEqual(MAX_BODY_BYTES / (16 * 1024) + 2);
    expect(state.cancelled).toBe(true);
  });

  it("an empty or missing body is the empty string", async () => {
    expect(await readBodyCapped(null, MAX_BODY_BYTES)).toBe("");
    expect(await readBodyCapped(chunked(0, 1).stream, MAX_BODY_BYTES)).toBe("");
  });

  it("decodes multi-byte characters split across chunks", async () => {
    const bytes = enc.encode("µg");
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, 1));
        c.enqueue(bytes.slice(1));
        c.close();
      },
    });
    expect(await readBodyCapped(stream, MAX_BODY_BYTES)).toBe("µg");
  });
});

describe("IngestPayload", () => {
  const ok = { sentAt: "2026-03-02T10:00:00Z", days: [{ date: "2026-03-02", totals: { energy_kcal: 1 } }] };
  it("accepts a valid payload", () => {
    expect(IngestPayload.safeParse(ok).success).toBe(true);
  });
  it("rejects 0 or 4 days, duplicate dates, fake dates, negatives and absurd values", () => {
    const d = (date: string) => ({ date, totals: {} });
    expect(IngestPayload.safeParse({ ...ok, days: [] }).success).toBe(false);
    expect(
      IngestPayload.safeParse({ ...ok, days: ["01", "02", "03", "04"].map((x) => d(`2026-03-${x}`)) }).success,
    ).toBe(false);
    expect(IngestPayload.safeParse({ ...ok, days: [d("2026-03-02"), d("2026-03-02")] }).success).toBe(false);
    expect(IngestPayload.safeParse({ ...ok, days: [d("2026-02-30")] }).success).toBe(false);
    for (const totals of [
      { energy_kcal: -5 },
      { energy_kcal: 15001 },
      { water_ml: 15001 },
      { protein_g: 2001 },
      { iron_mg: 100001 },
      { energy_kcal: "5" },
    ]) {
      expect(IngestPayload.safeParse({ ...ok, days: [{ date: "2026-03-02", totals }] }).success).toBe(false);
    }
    expect(IngestPayload.safeParse({ ...ok, sentAt: "yesterday" }).success).toBe(false);
  });
});

describe("sentAtTooFarAhead", () => {
  const now = new Date("2026-03-02T10:00:00Z");
  const at = (ms: number) => new Date(now.getTime() + ms).toISOString();
  it("allows the past, now and up to the tolerance ahead", () => {
    expect(sentAtTooFarAhead(at(-86_400_000), now)).toBe(false);
    expect(sentAtTooFarAhead(at(0), now)).toBe(false);
    expect(sentAtTooFarAhead(at(MAX_SENT_AT_AHEAD_MS), now)).toBe(false);
  });
  it("rejects anything further ahead", () => {
    expect(sentAtTooFarAhead(at(MAX_SENT_AT_AHEAD_MS + 1000), now)).toBe(true);
  });
});
