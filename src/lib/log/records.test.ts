import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { bodyScans, labPanels, labResults } from "@/db/schema";
import { createTestDb } from "@/db/test-db";
import {
  addLabPanel,
  addScan,
  deleteLabPanel,
  deleteScan,
  getLabPanel,
  listLabPanels,
  listMarkers,
  listScans,
  markerHistory,
  markerResults,
} from "./records";

const TZ = "America/Chicago";
let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
afterEach(async () => {
  await db.delete(labPanels);
  await db.delete(bodyScans);
});

describe("scans", () => {
  it("adds, lists newest first, deletes", async () => {
    await addScan(db, { scannedOn: "2026-01-01", weightLb: 180 });
    const { id } = await addScan(db, {
      scannedOn: "2026-06-01",
      weightLb: 175,
      bodyFatPct: 15,
      extras: { note: "x" },
    });
    const list = await listScans(db);
    expect(list.map((s) => s.scannedOn)).toEqual(["2026-06-01", "2026-01-01"]);
    expect(list[0].source).toBe("manual");
    await deleteScan(db, id);
    expect(await listScans(db)).toHaveLength(1);
  });
});

describe("lab panels", () => {
  it("keeps the last value for a repeated marker", async () => {
    const { id } = await addLabPanel(db, {
      drawnOn: "2026-05-01",
      results: [
        { marker: "Ferritin", value: 50, unit: "ng/mL" },
        { marker: "Ferritin", value: 120, unit: "ng/mL" },
      ],
    });
    const p = await getLabPanel(db, id);
    expect(p?.results).toHaveLength(1);
    expect(p?.results[0].value).toBe(120);
  });

  it("markerHistory is case-insensitive, oldest first", async () => {
    await addLabPanel(db, {
      drawnOn: "2026-05-01",
      results: [{ marker: "Ferritin", value: 120, unit: "ng/mL" }],
    });
    await addLabPanel(db, {
      drawnOn: "2025-05-01",
      results: [{ marker: "ferritin", value: 40, unit: "ng/mL" }],
    });
    const h = await markerHistory(db, "FERRITIN");
    expect(h).toEqual([
      { drawnOn: "2025-05-01", value: 40, unit: "ng/mL" },
      { drawnOn: "2026-05-01", value: 120, unit: "ng/mL" },
    ]);
  });

  it("deleting a panel removes its results", async () => {
    const { id } = await addLabPanel(db, {
      drawnOn: "2026-05-01",
      results: [{ marker: "A", value: 1, unit: "u" }],
    });
    await deleteLabPanel(db, id);
    expect(await db.select().from(labResults)).toHaveLength(0);
    expect(await getLabPanel(db, id)).toBeNull();
  });

  it("lists with marker count and age in local days", async () => {
    await addLabPanel(db, {
      drawnOn: "2026-04-20",
      results: [
        { marker: "A", value: 1, unit: "u" },
        { marker: "B", value: 2, unit: "u" },
      ],
    });
    // 2026-10-20 03:00 UTC is still Oct 19 in Chicago -> 182 days.
    const list = await listLabPanels(db, new Date("2026-10-20T03:00:00Z"), TZ);
    expect(list).toEqual([
      expect.objectContaining({
        drawnOn: "2026-04-20",
        markerCount: 2,
        ageDays: 182,
      }),
    ]);
  });
});

describe("listMarkers", () => {
  it("groups case-insensitively with the latest spelling and count", async () => {
    await addLabPanel(db, {
      drawnOn: "2026-01-01",
      results: [{ marker: "LDL", value: 100, unit: "mg/dL" }],
    });
    await addLabPanel(db, {
      drawnOn: "2026-05-01",
      results: [{ marker: " ldl ", value: 90, unit: "mg/dL", flag: "" }],
    });
    const out = await listMarkers(db);
    expect(out).toHaveLength(1);
    expect(out[0].marker).toBe("ldl");
    expect(out[0].count).toBe(2);
    expect(out[0].latest).toEqual({
      drawnOn: "2026-05-01",
      value: 90,
      unit: "mg/dL",
      flag: null,
    });
  });

  it("sorts flagged markers before unflagged, then alphabetically", async () => {
    await addLabPanel(db, {
      drawnOn: "2026-02-01",
      results: [
        { marker: "Albumin", value: 4, unit: "g/dL" },
        { marker: "Zinc", value: 50, unit: "ug/dL", flag: "L" },
        { marker: "Ferritin", value: 30, unit: "ng/mL" },
      ],
    });
    const out = await listMarkers(db);
    expect(out.map((m) => m.marker)).toEqual(["Zinc", "Albumin", "Ferritin"]);
    expect(out[0].latest.flag).toBe("L");
  });
});

describe("markerHistory trimming", () => {
  it("matches stored names with surrounding whitespace", async () => {
    await addLabPanel(db, {
      drawnOn: "2026-01-01",
      results: [{ marker: " ldl ", value: 100, unit: "mg/dL" }],
    });
    await addLabPanel(db, {
      drawnOn: "2026-05-01",
      results: [{ marker: "LDL", value: 90, unit: "mg/dL" }],
    });
    expect(await markerHistory(db, "ldl")).toHaveLength(2);
  });
});

describe("markerResults", () => {
  it("returns flags and stored names, oldest first, matching like markerHistory", async () => {
    await addLabPanel(db, {
      drawnOn: "2026-05-01",
      results: [{ marker: "Zinc ", value: 50, unit: "ug/dL", flag: "L" }],
    });
    await addLabPanel(db, {
      drawnOn: "2026-01-01",
      results: [{ marker: "zinc", value: 80, unit: "ug/dL", flag: "" }],
    });
    expect(await markerResults(db, " ZINC")).toEqual([
      { drawnOn: "2026-01-01", value: 80, unit: "ug/dL", flag: null, marker: "zinc" },
      { drawnOn: "2026-05-01", value: 50, unit: "ug/dL", flag: "L", marker: "Zinc " },
    ]);
  });
});
