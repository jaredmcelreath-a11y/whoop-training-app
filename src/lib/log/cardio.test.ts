import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { cardioEntries, painEntries } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  addCardio,
  cardioFormToInput,
  deleteCardio,
  formatCardio,
  recentCardio,
  runEndedAt,
} from "./cardio";
import { addPain, addPains } from "./pain";
import { CardioInput } from "./validate";

const TZ = "America/Chicago";
let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.delete(painEntries);
  await db.delete(cardioEntries);
});

const base = {
  startedAt: "2026-10-20T06:00:00-05:00",
  avgWatts: null,
  inclinePct: null,
  poolLength: null,
  indoor: true,
  notes: "",
};

function input(
  v: Partial<CardioInput> & Pick<CardioInput, "kind" | "durationMin" | "distance" | "unit">,
) {
  return CardioInput.parse({ ...base, ...v });
}

describe("addCardio", () => {
  it("stores a 1,500 yd swim in meters with a default 25 yd pool", async () => {
    const { id } = await addCardio(
      db,
      input({ kind: "swim", durationMin: 32, distance: 1500, unit: "yd" }),
      TZ,
    );
    const [row] = await db.select().from(cardioEntries).where(eq(cardioEntries.id, id));
    expect(row.distanceM).toBeCloseTo(1371.6, 6);
    expect(row.poolLengthM).toBeCloseTo(22.86, 6);
    expect(row.durationS).toBe(1920);
    expect(row.localDate).toBe("2026-10-20");
    expect(row.whoopWorkoutId).toBeNull();
    expect(formatCardio(row)).toBe("Swim · 1,500 yd · 32 min · 2:08 /100yd");
  });

  it("converts a given pool length with the swim's unit", async () => {
    const { id } = await addCardio(
      db,
      input({ kind: "swim", durationMin: 30, distance: 1000, unit: "m", poolLength: 50 }),
      TZ,
    );
    const [row] = await db.select().from(cardioEntries).where(eq(cardioEntries.id, id));
    expect(row.poolLengthM).toBe(50);
    expect(row.distanceM).toBe(1000);
  });

  it("takes the pool length in its own unit, including feet", async () => {
    const { id } = await addCardio(
      db,
      input({ kind: "swim", durationMin: 30, distance: 1000, unit: "yd", poolLength: 75, poolUnit: "ft" }),
      TZ,
    );
    const [row] = await db.select().from(cardioEntries).where(eq(cardioEntries.id, id));
    expect(row.poolLengthM).toBeCloseTo(22.86, 6);
    expect(row.distanceM).toBeCloseTo(914.4, 6);
  });

  it("rejects a pool length outside 10-100 m in its own unit", () => {
    expect(CardioInput.safeParse({ ...base, kind: "swim", durationMin: 30, distance: 1000, unit: "yd", poolLength: 20, poolUnit: "ft" }).success).toBe(false);
  });

  it("files an 11:30 pm Chicago run under that Chicago date and leaves pool length empty", async () => {
    const { id } = await addCardio(
      db,
      input({
        kind: "run",
        durationMin: 20,
        distance: 2,
        unit: "mi",
        startedAt: "2026-10-20T23:30:00-05:00",
      }),
      TZ,
    );
    const [row] = await db.select().from(cardioEntries).where(eq(cardioEntries.id, id));
    expect(row.localDate).toBe("2026-10-20");
    expect(row.poolLengthM).toBeNull();
  });

  it("rounds a fractional duration to whole seconds", async () => {
    const { id } = await addCardio(
      db,
      input({ kind: "run", durationMin: 24.1667, distance: 2, unit: "mi" }),
      TZ,
    );
    const [row] = await db.select().from(cardioEntries).where(eq(cardioEntries.id, id));
    expect(row.durationS).toBe(1450);
  });
});

describe("formatCardio", () => {
  const row = (v: Partial<Parameters<typeof formatCardio>[0]>) => ({
    kind: "run" as const,
    durationS: 0,
    distanceM: null,
    avgWatts: null,
    ...v,
  });

  it("formats a run with m:ss duration and pace per mile", () => {
    expect(formatCardio(row({ kind: "run", durationS: 1450, distanceM: 2 * 1609.344 }))).toBe(
      "Run · 2.0 mi · 24:10 · 12:05 /mi",
    );
  });
  it("formats a run of an hour or more as h:mm:ss", () => {
    expect(formatCardio(row({ kind: "run", durationS: 3900, distanceM: 6 * 1609.344 }))).toBe(
      "Run · 6.0 mi · 1:05:00 · 10:50 /mi",
    );
  });
  it("formats a swim with pace per 100 yd", () => {
    expect(formatCardio(row({ kind: "swim", durationS: 1920, distanceM: 1371.6 }))).toBe(
      "Swim · 1,500 yd · 32 min · 2:08 /100yd",
    );
  });
  it("formats a bike with watts and no pace", () => {
    expect(
      formatCardio(row({ kind: "bike", durationS: 2700, distanceM: 10 * 1609.344, avgWatts: 145 })),
    ).toBe("Bike · 10.0 mi · 45 min · 145 W");
  });
  it("formats a long bike as h:mm:ss and skips missing distance and watts", () => {
    expect(formatCardio(row({ kind: "bike", durationS: 3900 }))).toBe("Bike · 1:05:00");
  });
});

describe("recentCardio and deleteCardio", () => {
  it("lists newest first and deleting a run keeps its pain entries, unlinked", async () => {
    const a = await addCardio(
      db,
      input({ kind: "bike", durationMin: 45, distance: 10, unit: "mi" }),
      TZ,
    );
    const b = await addCardio(
      db,
      input({
        kind: "run",
        durationMin: 20,
        distance: 2,
        unit: "mi",
        startedAt: "2026-10-21T06:00:00-05:00",
      }),
      TZ,
    );
    expect((await recentCardio(db)).map((r) => r.id)).toEqual([b.id, a.id]);
    expect(await recentCardio(db, 1)).toHaveLength(1);

    await addPain(
      db,
      { area: "knee", side: "both", score: 4, context: "after_run" },
      new Date(),
      TZ,
      b.id,
    );
    await deleteCardio(db, b.id);
    expect((await recentCardio(db)).map((r) => r.id)).toEqual([a.id]);
    const pain = await db.select().from(painEntries);
    expect(pain).toHaveLength(1);
    expect(pain[0].cardioEntryId).toBeNull();
  });
});

describe("cardioFormToInput", () => {
  function fd(v: Record<string, string>) {
    const f = new FormData();
    for (const [k, val] of Object.entries(v)) f.set(k, val);
    return f;
  }

  it("converts the Chicago start time to UTC and makes swims indoor", () => {
    const r = cardioFormToInput(
      fd({
        kind: "swim",
        startedAt: "2026-11-04T06:00",
        durationMin: "32",
        distance: "1500",
        unit: "yd",
        poolLength: "",
      }),
      TZ,
    );
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.startedAt).toBe("2026-11-04T12:00:00.000Z");
    expect(r.data.indoor).toBe(true);
    expect(r.data.poolLength).toBeNull();
    expect(r.data.avgWatts).toBeNull();
  });

  it("reads the pool length unit, defaulting to the distance unit", () => {
    const swim = (extra: Record<string, string>) =>
      cardioFormToInput(fd({ kind: "swim", startedAt: "2026-11-04T06:00", durationMin: "32", distance: "1500", unit: "yd", poolLength: "75", ...extra }), TZ);
    const ft = swim({ poolUnit: "ft" });
    expect(ft.success && ft.data.poolUnit).toBe("ft");
    const none = swim({});
    expect(none.success && none.data.poolUnit).toBeUndefined();
  });

  it("reads the run's indoor checkbox and ignores fields of other kinds", () => {
    const r = cardioFormToInput(
      fd({
        kind: "run",
        startedAt: "2026-07-01T06:00",
        durationMin: "24",
        distance: "2",
        unit: "mi",
        inclinePct: "1",
        avgWatts: "200",
        poolLength: "25",
      }),
      TZ,
    );
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.startedAt).toBe("2026-07-01T11:00:00.000Z");
    expect(r.data.indoor).toBe(false);
    expect(r.data.inclinePct).toBe(1);
    expect(r.data.avgWatts).toBeNull();
    expect(r.data.poolLength).toBeNull();
  });

  it("rejects a bad start time and a bad number", () => {
    expect(
      cardioFormToInput(fd({ kind: "run", startedAt: "", durationMin: "24", unit: "mi" }), TZ)
        .success,
    ).toBe(false);
    expect(
      cardioFormToInput(
        fd({ kind: "run", startedAt: "2026-07-01T06:00", durationMin: "1,5", unit: "mi" }),
        TZ,
      ).success,
    ).toBe(false);
  });
});

describe("runEndedAt", () => {
  it("is the start plus the duration", () => {
    expect(runEndedAt(new Date("2026-10-20T11:00:00Z"), 2700)).toEqual(
      new Date("2026-10-20T11:45:00Z"),
    );
  });

  it("dates after-run pain by when the run ended, not when it was logged", async () => {
    // Started 23:30 local on Oct 19, ran 45 min, logged the next evening.
    const [run] = await db
      .insert(cardioEntries)
      .values({
        kind: "run",
        startedAt: new Date("2026-10-19T23:30:00-05:00"),
        localDate: "2026-10-19",
        durationS: 2700,
      })
      .returning();
    const end = runEndedAt(run.startedAt, run.durationS);
    const knee = { area: "knee", side: "both", score: 3, context: "after_run" } as const;
    await addPains(db, [knee], end, TZ, run.id);
    const [p] = await db.select().from(painEntries);
    expect(p.loggedAt).toEqual(new Date("2026-10-20T00:15:00-05:00"));
    expect(p.localDate).toBe("2026-10-20");
  });
});
