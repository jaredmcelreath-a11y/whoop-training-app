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

describe("pain side and pool unit", () => {
  it("default to unset and yards", async () => {
    const s0 = await getPlanSettings(db, NOW, TZ);
    expect([s0.startSwimSecPer100Yd, s0.startRunSecPerMi, s0.startBikeMph, s0.goalSec]).toEqual([null, null, null, null]);
    expect(s0.painSide).toBeNull();
    expect(s0.poolUnit).toBe("yd");
  });

  it("can be set", async () => {
    await getPlanSettings(db, NOW, TZ);
    const s1 = await updatePlanSettings(db, { painSide: "left", poolUnit: "ft" });
    expect(s1.painSide).toBe("left");
    expect(s1.poolUnit).toBe("ft");
  });

  it("an unset unit keeps the old display: whole yards in yards, else meters", async () => {
    await getPlanSettings(db, NOW, TZ);
    await db.update(planSettings).set({ poolLengthM: 25, poolUnit: null });
    expect((await getPlanSettings(db, NOW, TZ)).poolUnit).toBe("m");
    await db.update(planSettings).set({ poolLengthM: 22.86 });
    expect((await getPlanSettings(db, NOW, TZ)).poolUnit).toBe("yd");
  });
});

describe("wake time", () => {
  it("defaults to none, so the Day timeline derives it from the first window", async () => {
    expect((await getPlanSettings(db, NOW, TZ)).wakeTime).toBeNull();
  });

  it("can be set and cleared", async () => {
    await getPlanSettings(db, NOW, TZ);
    expect((await updatePlanSettings(db, { wakeTime: "07:00" })).wakeTime).toBe("07:00");
    expect((await updatePlanSettings(db, { wakeTime: null })).wakeTime).toBeNull();
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
  it("accepts a pain side or none, and rejects other values", () => {
    for (const v of [null, "left", "right", "both"]) expect(PlanSettingsInput.safeParse({ ...base, painSide: v }).success, String(v)).toBe(true);
    expect(PlanSettingsInput.safeParse({ ...base, painSide: "middle" }).success).toBe(false);
  });

  it("accepts an HH:MM wake time or none, and rejects other text", () => {
    expect(PlanSettingsInput.safeParse({ ...base, wakeTime: "07:00" }).success).toBe(true);
    expect(PlanSettingsInput.safeParse({ ...base, wakeTime: null }).success).toBe(true);
    expect(PlanSettingsInput.safeParse({ ...base, wakeTime: "7am" }).success).toBe(false);
  });

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
  it("keeps starting paces and the goal in sane ranges", () => {
    const ok = (patch: Record<string, number | null>) => PlanSettingsInput.safeParse({ ...base, ...patch }).success;
    expect(ok({ startSwimSecPer100Yd: 125, startRunSecPerMi: 660, startBikeMph: 16, goalSec: 21600 })).toBe(true);
    expect(ok({ startSwimSecPer100Yd: null, startRunSecPerMi: null, startBikeMph: null, goalSec: null })).toBe(true);
    expect(ok({ startSwimSecPer100Yd: 39 })).toBe(false);
    expect(ok({ startSwimSecPer100Yd: 601 })).toBe(false);
    expect(ok({ startRunSecPerMi: 239 })).toBe(false);
    expect(ok({ startRunSecPerMi: 1201 })).toBe(false);
    expect(ok({ startBikeMph: 4 })).toBe(false);
    expect(ok({ startBikeMph: 41 })).toBe(false);
    expect(ok({ goalSec: 3 * 3600 - 1 })).toBe(false);
    expect(ok({ goalSec: 9 * 3600 + 1 })).toBe(false);
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
