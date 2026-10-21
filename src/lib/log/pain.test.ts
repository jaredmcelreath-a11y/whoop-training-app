import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/test-db";
import { cardioEntries, painEntries } from "@/db/schema";
import {
  PAIN_AREAS,
  addPain,
  addPains,
  afterRunFormToInputs,
  painFormToInputs,
  painTrend,
} from "./pain";
import { PainInput } from "./validate";

const TZ = "America/Chicago";
let db: Db;

beforeAll(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.delete(painEntries);
  await db.delete(cardioEntries);
});

function fd(v: Record<string, string>) {
  const f = new FormData();
  for (const [k, val] of Object.entries(v)) f.set(k, val);
  return f;
}

describe("PainInput", () => {
  it("is built from PAIN_AREAS", () => {
    expect(PAIN_AREAS).toEqual(["knee", "ankle", "shin"]);
    expect(
      PainInput.safeParse({ area: "elbow", side: "left", score: 3, context: "daily" }).success,
    ).toBe(false);
  });
});

describe("painTrend", () => {
  it("takes the max per local date and omits days with no entries", async () => {
    const now = new Date("2026-10-20T12:00:00-05:00");
    await addPain(
      db,
      { area: "knee", side: "left", score: 3, context: "before_run" },
      new Date("2026-10-18T06:00:00-05:00"),
      TZ,
    );
    await addPain(
      db,
      { area: "knee", side: "right", score: 5, context: "after_run" },
      new Date("2026-10-18T08:00:00-05:00"),
      TZ,
    );
    await addPain(
      db,
      { area: "knee", side: "both", score: 2, context: "daily" },
      new Date("2026-10-20T07:00:00-05:00"),
      TZ,
    );
    await addPain(
      db,
      { area: "ankle", side: "both", score: 9, context: "daily" },
      new Date("2026-10-19T07:00:00-05:00"),
      TZ,
    );
    expect(await painTrend(db, "knee", now, TZ)).toEqual([
      { date: "2026-10-18", max: 5 },
      { date: "2026-10-20", max: 2 },
    ]);
  });

  it("covers `days` local days including today, by Chicago date", async () => {
    const now = new Date("2026-10-20T12:00:00-05:00");
    // 11:30 pm Chicago on Oct 6 is Oct 7 in UTC; Oct 6 is outside the 14-day window.
    await addPain(
      db,
      { area: "shin", side: "both", score: 4, context: "daily" },
      new Date("2026-10-06T23:30:00-05:00"),
      TZ,
    );
    await addPain(
      db,
      { area: "shin", side: "both", score: 6, context: "daily" },
      new Date("2026-10-07T08:00:00-05:00"),
      TZ,
    );
    expect(await painTrend(db, "shin", now, TZ)).toEqual([{ date: "2026-10-07", max: 6 }]);
    expect(await painTrend(db, "shin", now, TZ, 3)).toEqual([]);
  });
});

describe("addPains", () => {
  it("writes several entries in one statement, linked to a run", async () => {
    const [run] = await db
      .insert(cardioEntries)
      .values({ kind: "run", startedAt: new Date(), localDate: "2026-10-20", durationS: 1200 })
      .returning();
    await addPains(
      db,
      [
        { area: "knee", side: "both", score: 4, context: "after_run" },
        { area: "shin", side: "both", score: 0, context: "after_run" },
      ],
      new Date("2026-10-20T07:00:00-05:00"),
      TZ,
      run.id,
    );
    const rows = await db.select().from(painEntries);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.cardioEntryId === run.id && r.localDate === "2026-10-20")).toBe(
      true,
    );
  });

  it("writes nothing for an empty list", async () => {
    await addPains(db, [], new Date(), TZ);
    expect(await db.select().from(painEntries)).toHaveLength(0);
  });
});

describe("form parsing", () => {
  it("keeps only checked areas on the pain page", () => {
    const r = painFormToInputs(
      fd({
        context: "before_run",
        log_knee: "on",
        score_knee: "3",
        side_knee: "left",
        score_ankle: "7",
        side_ankle: "both",
      }),
    );
    expect(r).toEqual({
      ok: true,
      inputs: [{ area: "knee", side: "left", score: 3, context: "before_run" }],
    });
  });
  it("defaults the context to daily and rejects an out-of-range score", () => {
    expect(painFormToInputs(fd({ log_shin: "on", score_shin: "2", side_shin: "right" }))).toEqual({
      ok: true,
      inputs: [{ area: "shin", side: "right", score: 2, context: "daily" }],
    });
    expect(painFormToInputs(fd({ log_shin: "on", score_shin: "11", side_shin: "right" })).ok).toBe(
      false,
    );
    expect(painFormToInputs(fd({ log_shin: "on", score_shin: "2.5", side_shin: "right" })).ok).toBe(
      false,
    );
  });
  it("after a run, logs the non-skipped areas as after_run on both sides", () => {
    expect(
      afterRunFormToInputs(fd({ score_knee: "4", score_ankle: "skip", score_shin: "0" })),
    ).toEqual({
      ok: true,
      inputs: [
        { area: "knee", side: "both", score: 4, context: "after_run" },
        { area: "shin", side: "both", score: 0, context: "after_run" },
      ],
    });
    expect(
      afterRunFormToInputs(fd({ score_knee: "skip", score_ankle: "skip", score_shin: "skip" })),
    ).toEqual({
      ok: true,
      inputs: [],
    });
  });
});
