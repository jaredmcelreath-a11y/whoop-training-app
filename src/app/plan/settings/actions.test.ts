import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PlanSettings } from "@/lib/plan/settings";

// Invented values only. Everything but the action's own control flow is mocked.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/auth/session", () => ({ requireSession: vi.fn(async () => ({ sub: "owner" })) }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ OWNER_TZ: "America/Chicago" }) }));
vi.mock("@/lib/plan/service", () => ({ regenerateFuture: vi.fn() }));
vi.mock("@/lib/plan/settings", () => ({ getPlanSettings: vi.fn(), updatePlanSettings: vi.fn() }));
vi.mock("@/lib/plan/view", () => ({ settingsFromForm: vi.fn() }));

import { revalidatePath } from "next/cache";
import { regenerateFuture } from "@/lib/plan/service";
import { getPlanSettings, updatePlanSettings } from "@/lib/plan/settings";
import { settingsFromForm } from "@/lib/plan/view";
import { savePlanSettings } from "./actions";

const SETTINGS: PlanSettings = {
  raceDate: "2027-10-17",
  seasonStart: "2026-10-26",
  windows: [{ start: "06:00", end: "09:00" }],
  longRideDow: 5,
  longRunDow: 6,
  restDow: 0,
  jointStatus: "caution",
  poolLengthM: 22.86,
};

beforeEach(() => {
  vi.mocked(getPlanSettings).mockResolvedValue(SETTINGS);
  vi.mocked(settingsFromForm).mockReturnValue({ ok: true, settings: SETTINGS });
  vi.mocked(updatePlanSettings).mockResolvedValue(SETTINGS);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("savePlanSettings", () => {
  it("returns a fixed message, logs the error and never echoes it when re-planning fails", async () => {
    const err = new Error("secret internals: relation planned_sessions xyz");
    vi.mocked(regenerateFuture).mockRejectedValueOnce(err);
    const res = await savePlanSettings({}, new FormData());
    expect(res).toEqual({ error: "Settings saved, but re-planning failed — please save again." });
    expect(JSON.stringify(res)).not.toContain("secret");
    expect(console.error).toHaveBeenCalled();
  });

  it("does not echo a save error's message either", async () => {
    vi.mocked(updatePlanSettings).mockRejectedValueOnce(new Error("secret db detail"));
    const res = await savePlanSettings({}, new FormData());
    expect(res.error).toBeDefined();
    expect(res.error).not.toContain("secret");
    expect(regenerateFuture).not.toHaveBeenCalled();
  });

  it("saves, re-plans and revalidates on success", async () => {
    vi.mocked(regenerateFuture).mockResolvedValueOnce({ deleted: 1, created: 1 });
    const res = await savePlanSettings({}, new FormData());
    expect(res.ok).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/plan", "layout");
  });
});
