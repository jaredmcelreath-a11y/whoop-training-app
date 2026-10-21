import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDb } from "@/db/test-db";
import type { Db } from "@/db/client";
import { plannedSessions, planSettings } from "@/db/schema";
import { addDays } from "@/lib/log/dates";
import { getPlanSettings, PlanSettingsInput, updatePlanSettings } from "./settings";

const TZ = "America/Chicago";
// Wednesday 2026-10-21 noon UTC -> first Monday on/after is 2026-10-26
const NOW = new Date("2026-10-21T17:00:00Z");

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
beforeEach(async () => {
  await db.delete(plannedSessions);
  await db.delete(planSettings);
});

describe("getPlanSettings", () => {
  it("creates defaults on first call and is stable after", async () => {
    const a = await getPlanSettings(db, NOW, TZ);
    expect(a).toMatchObject({
      raceDate: "2027-10-17",
      seasonStart: "2026-10-26",
      windows: [
        { start: "06:00", end: "09:00" },
        { start: "11:30", end: "13:30" },
      ],
      longRideDow: 5,
      longRunDow: 6,
      restDow: 0,
      jointStatus: "caution",
      poolLengthM: 22.86,
    });
    const b = await getPlanSettings(db, new Date("2026-12-01T00:00:00Z"), TZ);
    expect(b).toEqual(a);
  });

  it("uses today when it is already a Monday", async () => {
    const s = await getPlanSettings(db, new Date("2026-10-26T15:00:00Z"), TZ);
    expect(s.seasonStart).toBe("2026-10-26");
  });
});

describe("updatePlanSettings", () => {
  it("changes only the patched field", async () => {
    const before = await getPlanSettings(db, NOW, TZ);
    const after = await updatePlanSettings(db, { jointStatus: "unrestricted" });
    expect(after).toEqual({ ...before, jointStatus: "unrestricted" });
  });

  it("throws a readable error on invalid merged settings", async () => {
    await getPlanSettings(db, NOW, TZ);
    await expect(updatePlanSettings(db, { restDow: 5 })).rejects.toThrow(/day/i);
  });
});

describe("PlanSettingsInput", () => {
  const base = {
    raceDate: "2027-10-17",
    seasonStart: "2026-10-26",
    windows: [{ start: "06:00", end: "09:00" }],
    longRideDow: 5,
    longRunDow: 6,
    restDow: 0,
    jointStatus: "caution" as const,
    poolLengthM: 22.86,
  };
  it("accepts a valid input", () => {
    expect(PlanSettingsInput.safeParse(base).success).toBe(true);
  });
  it("rejects a race 8 weeks out", () => {
    const r = PlanSettingsInput.safeParse({ ...base, raceDate: addDays(base.seasonStart, 56) });
    expect(r.success).toBe(false);
  });
  it("rejects a race too far out", () => {
    const r = PlanSettingsInput.safeParse({ ...base, raceDate: addDays(base.seasonStart, 105 * 7) });
    expect(r.success).toBe(false);
  });
  it("rejects rest day equal to long ride day", () => {
    expect(PlanSettingsInput.safeParse({ ...base, restDow: 5 }).success).toBe(false);
  });
  for (const bad of ["2027-13-01", "2027-02-30", "2026-10-00"]) {
    it(`rejects the impossible date ${bad} as race date and as season start`, () => {
      const race = PlanSettingsInput.safeParse({ ...base, raceDate: bad });
      expect(race.success).toBe(false);
      expect(race.error?.issues.some((i) => i.path[0] === "raceDate")).toBe(true);
      const start = PlanSettingsInput.safeParse({ ...base, seasonStart: bad });
      expect(start.success).toBe(false);
      expect(start.error?.issues.some((i) => i.path[0] === "seasonStart")).toBe(true);
    });
  }
  it("accepts a real leap day", () => {
    expect(PlanSettingsInput.safeParse({ ...base, raceDate: "2028-02-29" }).success).toBe(true);
  });
  it("rejects a 06:00-05:00 window", () => {
    const r = PlanSettingsInput.safeParse({ ...base, windows: [{ start: "06:00", end: "05:00" }] });
    expect(r.success).toBe(false);
  });
});

describe("tables", () => {
  it("rejects a second plan_settings row", async () => {
    await getPlanSettings(db, NOW, TZ);
    await expect(
      db.execute(sql`insert into plan_settings (id, race_date, season_start, windows, long_ride_dow, long_run_dow, rest_dow, joint_status, pool_length_m) values (2, '2027-10-17', '2026-10-26', '[]'::jsonb, 5, 6, 0, 'caution', 22.86)`),
    ).rejects.toThrow();
  });

  it("conflicts on same local_date and slot", async () => {
    const row = {
      localDate: "2026-10-27",
      slot: 0,
      kind: "run" as const,
      title: "Easy run",
      durationMin: 30,
      intensity: "z2" as const,
      details: {},
      ruleIds: ["r1"],
      weekStart: "2026-10-26",
    };
    await db.insert(plannedSessions).values(row);
    await expect(db.insert(plannedSessions).values(row)).rejects.toThrow();
  });
});
