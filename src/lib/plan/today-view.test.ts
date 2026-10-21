import { describe, expect, it } from "vitest";
import { NOT_ENOUGH_DATA } from "@/lib/engine/adapt";
import { parseCardioKind, reasonView, sessionLogLink, sessionLogHref, sessionNotes, whyEntries } from "./today-view";

describe("sessionLogHref", () => {
  it("links strength-like sessions to the strength log", () => {
    for (const k of ["strength", "lower_leg", "core"]) expect(sessionLogHref(k)).toBe("/log/strength");
  });
  it("links endurance sessions to the cardio log with the kind preselected", () => {
    expect(sessionLogHref("swim")).toBe("/log/cardio?kind=swim");
    expect(sessionLogHref("bike")).toBe("/log/cardio?kind=bike");
    expect(sessionLogHref("run")).toBe("/log/cardio?kind=run");
  });
  it("has no link for rest and mobility", () => {
    expect(sessionLogHref("rest")).toBeNull();
    expect(sessionLogHref("mobility")).toBeNull();
  });
});

describe("whyEntries", () => {
  it("joins each reason with its rule statement and evidence label", () => {
    const [e] = whyEntries([{ ruleId: "pain.jointStatus", text: "Joint status restricted" }]);
    expect(e.ruleId).toBe("pain.jointStatus");
    expect(e.text).toBe("Joint status restricted");
    expect(e.statement.length).toBeGreaterThan(0);
    expect(e.evidenceLabel.length).toBeGreaterThan(0);
    expect(e.href).toBe("/plan/library#pain.jointStatus");
  });
  it("keeps reasons for unknown rules without a statement", () => {
    const [e] = whyEntries([{ ruleId: "nope.nope", text: "x" }]);
    expect(e.statement).toBe("");
    expect(e.evidence).toBeNull();
  });
});

describe("sessionNotes", () => {
  it("reuses the plan detail notes", () => {
    expect(sessionNotes({ optional: true })).toEqual(["Optional today"]);
    expect(sessionNotes({})).toEqual([]);
  });
});

describe("parseCardioKind", () => {
  it("accepts the three kinds and defaults to run", () => {
    expect(parseCardioKind("swim")).toBe("swim");
    expect(parseCardioKind(["bike"])).toBe("bike");
    expect(parseCardioKind("x")).toBe("run");
    expect(parseCardioKind(undefined)).toBe("run");
  });
});

describe("sessionLogLink", () => {
  it("labels strength as Start workout and cardio as Log it", () => {
    expect(sessionLogLink("core")).toEqual({ href: "/log/strength", label: "Start workout" });
    expect(sessionLogLink("run")).toEqual({ href: "/log/cardio?kind=run", label: "Log it" });
    expect(sessionLogLink("rest")).toBeNull();
  });
});

describe("reasonView", () => {
  const yellow = { ruleId: "recovery.yellowScale", text: "Yellow recovery: scaled down" };
  const pain = { ruleId: "pain.monitoring", text: "Knee pain hold. Consider talking to your doctor." };
  const debt = { ruleId: "recovery.sleepDebt", text: "Short on sleep; aim for an earlier, consistent bedtime" };
  const unknown = { ruleId: "recovery.color", text: NOT_ENOUGH_DATA };

  it("adjusted yellow session: first reason is the badge, all in the sheet", () => {
    const v = reasonView(true, [yellow]);
    expect(v.badge).toBe(yellow);
    expect(v.lines).toEqual([]);
    expect(v.sheet.map((e) => e.ruleId)).toEqual(["recovery.yellowScale"]);
  });
  it("shows pain and sleep debt in full beyond the first reason", () => {
    const v = reasonView(true, [yellow, pain, debt]);
    expect(v.badge).toBe(yellow);
    expect(v.lines).toEqual([pain, debt]);
    expect(v.sheet).toHaveLength(3);
  });
  it("shows a sleep-debt reason on a non-adjusted session inline", () => {
    const v = reasonView(false, [debt]);
    expect(v.badge).toBeNull();
    expect(v.lines).toEqual([debt]);
  });
  it("keeps pain visible and in the sheet when the first reason is not-enough-data", () => {
    const v = reasonView(false, [unknown, pain]);
    expect(v.subtle).toBe(unknown);
    expect(v.lines).toEqual([pain]);
    expect(v.sheet.map((e) => e.ruleId)).toEqual(["pain.monitoring"]);
  });
  it("not-enough-data alone has no sheet", () => {
    const v = reasonView(false, [unknown]);
    expect(v.subtle).toBe(unknown);
    expect(v.sheet).toEqual([]);
  });
  it("a done session with no reasons shows nothing extra", () => {
    const v = reasonView(false, []);
    expect(v).toMatchObject({ badge: null, subtle: null, lines: [], sheet: [] });
  });
});
