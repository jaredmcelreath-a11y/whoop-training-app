import { describe, expect, it } from "vitest";
import { localDate } from "@/lib/log/dates";
import { noonOf, parseTodayDate } from "./today-date";

const TODAY = "2026-10-22";

describe("parseTodayDate", () => {
  it("accepts a real past date", () => {
    expect(parseTodayDate("2026-10-21", TODAY)).toEqual({ date: "2026-10-21", past: true });
    expect(parseTodayDate(["2026-01-05", "x"], TODAY)).toEqual({ date: "2026-01-05", past: true });
  });
  it("reads no date, or today itself, as today", () => {
    expect(parseTodayDate(undefined, TODAY)).toEqual({ date: TODAY, past: false });
    expect(parseTodayDate(TODAY, TODAY)).toEqual({ date: TODAY, past: false });
  });
  it("refuses future and junk dates", () => {
    expect(parseTodayDate("2026-10-23", TODAY)).toBeNull();
    expect(parseTodayDate("2026-02-30", TODAY)).toBeNull();
    expect(parseTodayDate("yesterday", TODAY)).toBeNull();
    expect(parseTodayDate("", TODAY)).toBeNull();
  });
});

describe("noonOf", () => {
  it("is local noon on that day, across DST", () => {
    const tz = "America/Chicago";
    expect(noonOf("2026-10-21", tz).toISOString()).toBe("2026-10-21T17:00:00.000Z");
    expect(noonOf("2026-11-02", tz).toISOString()).toBe("2026-11-02T18:00:00.000Z");
    expect(localDate(noonOf("2026-03-08", tz), tz)).toBe("2026-03-08");
  });
});
