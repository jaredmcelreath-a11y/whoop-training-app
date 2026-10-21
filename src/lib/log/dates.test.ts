import { describe, expect, it } from "vitest";
import { localDate, toZonedLocal, weekStart, zonedLocalToUtc } from "./dates";

describe("localDate", () => {
  it("uses the local date in CST, not UTC", () => {
    expect(localDate(new Date("2026-11-04T05:30:00Z"), "America/Chicago")).toBe("2026-11-03");
  });
  it("uses the local date in CDT", () => {
    expect(localDate(new Date("2026-07-01T04:30:00Z"), "America/Chicago")).toBe("2026-06-30");
  });
});

describe("weekStart", () => {
  it("maps Sunday to the previous Monday", () => {
    expect(weekStart("2026-10-25")).toBe("2026-10-19");
  });
  it("keeps a Monday", () => {
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
  });
  it("is stable across DST changes", () => {
    expect(weekStart("2026-11-01")).toBe("2026-10-26");
    expect(weekStart("2026-03-08")).toBe("2026-03-02");
  });
});

describe("zonedLocalToUtc", () => {
  it("converts a CST wall time (UTC-6)", () => {
    expect(zonedLocalToUtc("2026-11-04T08:00", "America/Chicago")).toBe("2026-11-04T14:00:00.000Z");
  });
  it("converts a CDT wall time (UTC-5)", () => {
    expect(zonedLocalToUtc("2026-07-01T08:00", "America/Chicago")).toBe("2026-07-01T13:00:00.000Z");
  });
  it("handles the day after fall-back and an 11:30 pm entry", () => {
    expect(zonedLocalToUtc("2026-11-01T23:30", "America/Chicago")).toBe("2026-11-02T05:30:00.000Z");
  });
  it("rejects malformed input", () => {
    expect(() => zonedLocalToUtc("2026-11-04 08:00", "America/Chicago")).toThrow(RangeError);
    expect(() => zonedLocalToUtc("2026-02-30T08:00", "America/Chicago")).toThrow(RangeError);
  });
});

describe("toZonedLocal", () => {
  it("formats an instant as a datetime-local value in the zone", () => {
    expect(toZonedLocal(new Date("2026-11-04T14:05:00Z"), "America/Chicago")).toBe(
      "2026-11-04T08:05",
    );
    expect(toZonedLocal(new Date("2026-07-01T04:30:00Z"), "America/Chicago")).toBe(
      "2026-06-30T23:30",
    );
  });
  it("round-trips through zonedLocalToUtc", () => {
    const local = toZonedLocal(new Date("2026-03-09T02:15:00Z"), "America/Chicago");
    expect(zonedLocalToUtc(local, "America/Chicago")).toBe("2026-03-09T02:15:00.000Z");
  });
});
