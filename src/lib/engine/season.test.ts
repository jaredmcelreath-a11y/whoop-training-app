import { describe, it, expect } from "vitest";
import { RULES } from "@/lib/engine/rules/catalog";
import { rampEnduranceMin, seasonCalendar, weeklyTargets, type WeekHistory } from "@/lib/engine/season";

const P = RULES["season.phases"].params;
const REC = RULES["season.recoveryWeek"].params;
const END = RULES["volume.endurance"].params;
const RUN = RULES["volume.run"].params;
const LC = RULES["volume.loadCheck"].params;

const START = "2026-10-26";
const RACE = "2027-10-17";

const phasesOf = (cal: ReturnType<typeof seasonCalendar>) => cal.weeks.map((w) => w.phase);
const emptyHistory = (): WeekHistory => ({ actualEnduranceMin: [], actualRunMin: [], strainRatio: [] });

describe("seasonCalendar", () => {
  it("counts phases backward from the race week", () => {
    const cal = seasonCalendar({ seasonStart: START, raceDate: RACE });
    const ph = phasesOf(cal);
    const n = ph.length;
    expect(cal.weeks[0].weekStart).toBe(START);
    expect(cal.weeks[n - 1].weekStart).toBe("2027-10-11");
    expect(ph[n - 1]).toBe("race");
    expect(ph.slice(n - 3, n - 1)).toEqual(["taper", "taper"]);
    expect(ph.slice(n - 7, n - 3)).toEqual(["peak", "peak", "peak", "peak"]);
    expect(ph.filter((p) => p === "build")).toHaveLength(12);
    expect(ph.slice(n - 19, n - 7).every((p) => p === "build")).toBe(true);
    expect(ph.slice(0, n - 19).every((p) => p === "base")).toBe(true);
    expect(cal.weeks.map((w) => w.index)).toEqual(ph.map((_, i) => i));
  });

  it("gain phase covers the first 26 weeks only when build starts later", () => {
    const cal = seasonCalendar({ seasonStart: START, raceDate: RACE });
    const gain = cal.weeks.filter((w) => w.gainPhase).map((w) => w.index);
    expect(gain).toEqual(Array.from({ length: 26 }, (_, i) => i));
  });

  it("an earlier race shrinks the gain phase, never build (Review Focus 2)", () => {
    const cal = seasonCalendar({ seasonStart: START, raceDate: "2027-06-06" });
    const ph = phasesOf(cal);
    const buildStart = ph.indexOf("build");
    expect(ph.filter((p) => p === "build")).toHaveLength(12);
    const gain = cal.weeks.filter((w) => w.gainPhase).map((w) => w.index);
    expect(gain).toEqual(Array.from({ length: buildStart }, (_, i) => i));
    expect(cal.weeks[buildStart - 1].gainPhase).toBe(true);
    expect(cal.weeks[buildStart].gainPhase).toBe(false);
  });

  it("no recovery week falls in taper, race or peak; others every Nth week", () => {
    for (const raceDate of [RACE, "2027-06-06", "2027-03-14"]) {
      const cal = seasonCalendar({ seasonStart: START, raceDate });
      for (const w of cal.weeks) {
        if (w.phase === "taper" || w.phase === "race" || w.phase === "peak") expect(w.recovery).toBe(false);
        else expect(w.recovery).toBe(w.index % REC.every === REC.every - 1);
      }
    }
  });

  it("shrinks base first, then build, and throws below the minimum", () => {
    // 10 weeks total: race + 2 taper + 4 peak leaves 3 for build, 0 base.
    const short = seasonCalendar({ seasonStart: START, raceDate: "2027-01-03" });
    expect(phasesOf(short)).toEqual([
      "build", "build", "build", "peak", "peak", "peak", "peak", "taper", "taper", "race",
    ]);
    const min = P.taperWeeks + P.peakWeeks + 1;
    const exact = seasonCalendar({ seasonStart: START, raceDate: "2026-12-13" });
    expect(exact.weeks).toHaveLength(min);
    expect(() => seasonCalendar({ seasonStart: START, raceDate: "2026-12-06" })).toThrow(
      new RegExp(`${min} weeks`),
    );
  });

  it("throws when the season start is not a Monday", () => {
    expect(() => seasonCalendar({ seasonStart: "2026-10-27", raceDate: RACE })).toThrow(/Monday/);
  });
});

describe("weeklyTargets", () => {
  const cal = seasonCalendar({ seasonStart: START, raceDate: RACE });
  const pct = 1 + END.maxWeeklyIncreasePct / 100;
  const runPct = 1 + RUN.maxWeeklyIncreasePct / 100;
  const runAbs = 1 + RUN.absoluteCapWeeklyIncreasePct / 100;

  it("week 0 with no history starts at the start values", () => {
    const t = weeklyTargets(cal, 0, emptyHistory());
    expect(t.enduranceMin).toBe(END.startHours * 60);
    expect(t.runMin).toBe(RUN.startMinPerWeek);
    expect(t.swimMin + t.bikeMin + t.runMin).toBe(t.enduranceMin);
  });

  it("52-week all-green simulation never breaks a ramp cap or the peak (Review Focus 3)", () => {
    const long = seasonCalendar({ seasonStart: START, raceDate: "2027-10-31" });
    expect(long.weeks.length).toBeGreaterThanOrEqual(52);
    const h = emptyHistory();
    let lastNonRecEnd: number | undefined;
    let lastNonRecRun: number | undefined;
    let peakReached = false;
    for (let i = 0; i < 52; i++) {
      const t = weeklyTargets(long, i, h);
      // Caps hold whenever the reference is not a missed week (Ruling 5).
      if (lastNonRecEnd !== undefined) {
        expect(lastNonRecEnd).toBeGreaterThanOrEqual(END.reentryBelowFraction * END.startHours * 60);
        expect(t.enduranceMin).toBeLessThanOrEqual(lastNonRecEnd * pct);
      }
      if (lastNonRecRun !== undefined) {
        expect(lastNonRecRun).toBeGreaterThanOrEqual(RUN.reentryBelowFraction * RUN.startMinPerWeek);
        expect(t.runMin).toBeLessThanOrEqual(lastNonRecRun * runPct);
        expect(t.runMin).toBeLessThanOrEqual(lastNonRecRun * runAbs);
      }
      expect(t.enduranceMin).toBeLessThanOrEqual(END.peakHours * 60);
      expect(t.runMin).toBeLessThanOrEqual(t.enduranceMin);
      expect(t.swimMin + t.bikeMin + t.runMin).toBe(t.enduranceMin);
      for (const v of Object.values(t)) expect(Number.isInteger(v)).toBe(true);
      if (t.enduranceMin === END.peakHours * 60) peakReached = true;
      if (!long.weeks[i].recovery) {
        lastNonRecEnd = t.enduranceMin;
        lastNonRecRun = t.runMin;
      }
      h.actualEnduranceMin.push(t.enduranceMin);
      h.actualRunMin.push(t.runMin);
      h.strainRatio.push(1);
    }
    expect(peakReached).toBe(true);
  });

  it("a missed week caps the next target against the actual, not the plan", () => {
    // A late-build week, so half the plan is still above the re-entry floor.
    const i = cal.weeks.findIndex((w) => w.phase === "peak") - 2;
    expect(cal.weeks[i].recovery).toBe(false);
    expect(cal.weeks[i - 1].recovery).toBe(false);
    const planned = rampEnduranceMin(cal, i - 1);
    const prevActual = planned / 2;
    const h: WeekHistory = { actualEnduranceMin: [prevActual], actualRunMin: [60], strainRatio: [1] };
    const t = weeklyTargets(cal, i, h);
    expect(prevActual * pct).toBeGreaterThan(END.startHours * 60);
    expect(t.enduranceMin).toBe(Math.floor(prevActual * pct));
    expect(t.enduranceMin).toBeLessThan(rampEnduranceMin(cal, i));
  });

  it("recovery weeks are volumeFactor x the normal target, and the next week ramps off the pre-recovery week", () => {
    const recIdx = REC.every - 1;
    expect(cal.weeks[recIdx].recovery).toBe(true);
    const h = emptyHistory();
    for (let i = 0; i < recIdx; i++) {
      const t = weeklyTargets(cal, i, h);
      h.actualEnduranceMin.push(t.enduranceMin);
      h.actualRunMin.push(t.runMin);
      h.strainRatio.push(1);
    }
    const prev = h.actualEnduranceMin.at(-1)!;
    const normal = Math.min(rampEnduranceMin(cal, recIdx), prev * pct);
    const rec = weeklyTargets(cal, recIdx, h);
    expect(rec.enduranceMin).toBe(Math.floor(normal * REC.volumeFactor));
    expect(rec.enduranceMin).toBeLessThan(prev);

    h.actualEnduranceMin.push(rec.enduranceMin);
    h.actualRunMin.push(rec.runMin);
    h.strainRatio.push(1);
    const after = weeklyTargets(cal, recIdx + 1, h);
    // Capped against the last non-recovery week, not the deliberately low one.
    expect(after.enduranceMin).toBe(Math.floor(Math.min(rampEnduranceMin(cal, recIdx + 1), prev * pct)));
    expect(after.enduranceMin).toBeGreaterThan(rec.enduranceMin * pct);
  });

  it("load check: two strain ratios over the threshold hold at the previous actual", () => {
    const over = 1 + LC.overPct / 100;
    expect(over).toBeCloseTo(1.2);
    const base = { actualEnduranceMin: [330, 350], actualRunMin: [60, 62] };
    const held = weeklyTargets(cal, 10, { ...base, strainRatio: [1.25, 1.3] });
    expect(held.enduranceMin).toBe(350);
    expect(held.runMin).toBe(62);
    const normal = weeklyTargets(cal, 10, { ...base, strainRatio: [1.25, 1.1] });
    expect(normal.enduranceMin).toBe(Math.floor(Math.min(rampEnduranceMin(cal, 10), 350 * pct)));
    expect(normal.enduranceMin).toBeGreaterThan(350);
    const withNull = weeklyTargets(cal, 10, { ...base, strainRatio: [null, 1.3] });
    expect(withNull.enduranceMin).toBe(normal.enduranceMin);
  });

  it("run share is limited early and the swim:bike split takes the rest", () => {
    const S = RULES["volume.split"].params;
    const early = weeklyTargets(cal, 2, { actualEnduranceMin: [300, 330], actualRunMin: [200, 200], strainRatio: [1, 1] });
    expect(early.runMin).toBeLessThanOrEqual(early.enduranceMin * S.earlyRunShare);
    const late = weeklyTargets(cal, S.earlyWeeks + 2, {
      actualEnduranceMin: [500, 520],
      actualRunMin: [300, 300],
      strainRatio: [1, 1],
    });
    expect(late.runMin).toBeLessThanOrEqual(late.enduranceMin * S.run);
    expect(late.runMin).toBeGreaterThan(late.enduranceMin * S.earlyRunShare);
    const rest = late.enduranceMin - late.runMin;
    expect(Math.abs(late.swimMin - (rest * S.swim) / (S.swim + S.bike))).toBeLessThanOrEqual(1);
  });

  it("taper and race weeks apply the taper factor to the peak level", () => {
    const n = cal.weeks.length;
    const peakMin = END.peakHours * 60;
    const h = { actualEnduranceMin: [peakMin], actualRunMin: [150], strainRatio: [1] };
    expect(weeklyTargets(cal, n - 2, h).enduranceMin).toBe(Math.floor(peakMin * P.taperVolumeFactor));
    expect(weeklyTargets(cal, n - 1, h).enduranceMin).toBe(Math.floor(peakMin * P.taperVolumeFactor));
  });

  it("re-entry floor: after a 0-minute endurance week, target is min(ramp, start) then ramps normally", () => {
    const i = 10;
    const h: WeekHistory = { actualEnduranceMin: [350, 0], actualRunMin: [60, 60], strainRatio: [1, 1] };
    const t = weeklyTargets(cal, i, h);
    expect(t.enduranceMin).toBe(Math.floor(Math.min(rampEnduranceMin(cal, i), END.startHours * 60)));
    // Week 11 is a recovery week; check the ramp resumes on week 12, capped against week 10.
    expect(cal.weeks[i + 1].recovery).toBe(true);
    const h2: WeekHistory = {
      actualEnduranceMin: [...h.actualEnduranceMin, t.enduranceMin],
      actualRunMin: [...h.actualRunMin, t.runMin],
      strainRatio: [1, 1, 1],
    };
    const next = weeklyTargets(cal, i + 1, h2);
    const normal11 = Math.min(rampEnduranceMin(cal, i + 1), t.enduranceMin * pct);
    expect(next.enduranceMin).toBe(Math.floor(normal11 * REC.volumeFactor));
    h2.actualEnduranceMin.push(next.enduranceMin);
    h2.actualRunMin.push(next.runMin);
    h2.strainRatio.push(1);
    const after = weeklyTargets(cal, i + 2, h2);
    expect(after.enduranceMin).toBe(Math.floor(Math.min(rampEnduranceMin(cal, i + 2), t.enduranceMin * pct)));
    expect(after.enduranceMin).toBeGreaterThan(t.enduranceMin);
  });

  it("re-entry floor: after a 0-minute run week, run is min(run ramp, start) then ramps normally", () => {
    const S = RULES["volume.split"].params;
    const i = 9;
    const t = weeklyTargets(cal, i, { actualEnduranceMin: [330, 340], actualRunMin: [60, 0], strainRatio: [1, 1] });
    expect(t.runMin).toBe(Math.floor(Math.min(t.enduranceMin * S.run, RUN.startMinPerWeek)));
    expect(t.runMin).toBe(RUN.startMinPerWeek);
    const t2 = weeklyTargets(cal, i + 1, {
      actualEnduranceMin: [330, 340, t.enduranceMin],
      actualRunMin: [60, 0, t.runMin],
      strainRatio: [1, 1, 1],
    });
    expect(t2.runMin).toBe(Math.floor(Math.min(t.runMin * runPct, t2.enduranceMin * S.run)));
    expect(t2.runMin).toBeGreaterThan(t.runMin);
  });

  it("re-entry floor never lifts taper or recovery weeks above their factor", () => {
    const n = cal.weeks.length;
    const zero = { actualEnduranceMin: [0], actualRunMin: [0], strainRatio: [1] };
    expect(weeklyTargets(cal, n - 2, zero).enduranceMin).toBeLessThanOrEqual(rampEnduranceMin(cal, n - 2));
    const recIdx = REC.every - 1;
    const rec = weeklyTargets(cal, recIdx, { actualEnduranceMin: [0], actualRunMin: [0], strainRatio: [1] });
    expect(rec.enduranceMin).toBe(
      Math.floor(Math.min(rampEnduranceMin(cal, recIdx), END.startHours * 60) * REC.volumeFactor),
    );
  });

  it("ramp hits literal values: week 0, a linear midpoint and the first peak week", () => {
    const firstPeak = cal.weeks.findIndex((w) => w.phase === "peak");
    expect(firstPeak).toBe(44);
    expect(rampEnduranceMin(cal, 0)).toBe(300);
    expect(rampEnduranceMin(cal, 22)).toBe(480);
    expect(rampEnduranceMin(cal, firstPeak)).toBe(660);
    expect(rampEnduranceMin(cal, firstPeak + 3)).toBe(660);
  });

  it("re-entry only after a missed week: a low-but-not-missed week is capped strictly", () => {
    const i = 10;
    const startMin = END.startHours * 60;
    expect(200).toBeGreaterThanOrEqual(END.reentryBelowFraction * startMin);
    const low = weeklyTargets(cal, i, { actualEnduranceMin: [350, 200], actualRunMin: [60, 30], strainRatio: [1, 1] });
    expect(low.enduranceMin).toBeLessThanOrEqual(220);
    expect(low.enduranceMin).toBe(220);
    expect(30).toBeGreaterThanOrEqual(RUN.reentryBelowFraction * RUN.startMinPerWeek);
    expect(low.runMin).toBe(33);
    const missed = weeklyTargets(cal, i, { actualEnduranceMin: [350, 0], actualRunMin: [60, 0], strainRatio: [1, 1] });
    expect(missed.enduranceMin).toBe(startMin);
    expect(missed.runMin).toBe(RUN.startMinPerWeek);
  });

  it("throws on an out-of-range week index", () => {
    expect(() => weeklyTargets(cal, cal.weeks.length, emptyHistory())).toThrow(RangeError);
  });
});

describe("weeklyTargets joint status (Ruling 10)", () => {
  const cal = seasonCalendar({ seasonStart: START, raceDate: RACE });
  const factor = RULES["pain.jointStatus"].params.caution.runIncreaseFactor;
  const cautionPct = 1 + (RUN.maxWeeklyIncreasePct * factor) / 100;
  const cautionAbs = 1 + (RUN.absoluteCapWeeklyIncreasePct * factor) / 100;
  const h: WeekHistory = { actualEnduranceMin: [330, 350], actualRunMin: [60, 62], strainRatio: [1, 1] };

  it("caution halves the run increase cap and leaves endurance unchanged", () => {
    const free = weeklyTargets(cal, 10, h);
    const caution = weeklyTargets(cal, 10, h, { jointStatus: "caution" });
    expect(caution.runMin).toBeLessThanOrEqual(62 * cautionPct);
    expect(caution.runMin).toBe(Math.floor(62 * cautionPct));
    expect(caution.runMin).toBeLessThan(free.runMin);
    expect(caution.enduranceMin).toBe(free.enduranceMin);
    expect(caution.swimMin + caution.bikeMin + caution.runMin).toBe(caution.enduranceMin);
  });

  it("unrestricted (explicit) matches the default", () => {
    expect(weeklyTargets(cal, 10, h, { jointStatus: "unrestricted" })).toEqual(weeklyTargets(cal, 10, h));
  });

  it("restricted drops run minutes without shifting them onto swim or bike", () => {
    const free = weeklyTargets(cal, 10, h);
    const r = weeklyTargets(cal, 10, h, { jointStatus: "restricted" });
    expect(free.runMin).toBeGreaterThan(0);
    expect(r.runMin).toBe(0);
    expect(r.swimMin).toBe(free.swimMin);
    expect(r.bikeMin).toBe(free.bikeMin);
    expect(r.enduranceMin).toBe(r.swimMin + r.bikeMin);
    expect(r.enduranceMin).toBeLessThan(free.enduranceMin);
  });

  it("52-week all-green simulation under caution never breaks the halved run cap", () => {
    const long = seasonCalendar({ seasonStart: START, raceDate: "2027-10-31" });
    const sim: WeekHistory = { actualEnduranceMin: [], actualRunMin: [], strainRatio: [] };
    let lastNonRecRun: number | undefined;
    for (let i = 0; i < 52; i++) {
      const t = weeklyTargets(long, i, sim, { jointStatus: "caution" });
      if (lastNonRecRun !== undefined) {
        expect(lastNonRecRun).toBeGreaterThanOrEqual(RUN.reentryBelowFraction * RUN.startMinPerWeek);
        expect(t.runMin).toBeLessThanOrEqual(lastNonRecRun * cautionPct);
        expect(t.runMin).toBeLessThanOrEqual(lastNonRecRun * cautionAbs);
      }
      expect(t.enduranceMin).toBeLessThanOrEqual(END.peakHours * 60);
      if (!long.weeks[i].recovery) lastNonRecRun = t.runMin;
      sim.actualEnduranceMin.push(t.enduranceMin);
      sim.actualRunMin.push(t.runMin);
      sim.strainRatio.push(1);
    }
  });
});
