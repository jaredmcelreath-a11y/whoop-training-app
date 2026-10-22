import { describe, expect, it } from "vitest";
import type { TimelineItem } from "@/lib/engine/day-timeline";
import { EDGE_FOR_KIND, ICON_FOR_ITEM, displayTitle, nextItemIndex } from "./day-style";

const item = (time: string, kind: TimelineItem["kind"] = "meal"): TimelineItem => ({
  time,
  kind,
  title: "x",
  detail: "",
  ruleIds: [],
});

describe("Day timeline style", () => {
  it("has an edge color and an icon for every kind", () => {
    for (const k of ["wake", "supplement", "meal", "snack", "session", "bedtime"] as const) {
      expect(EDGE_FOR_KIND[k], k).toMatch(/^(accent|caution|info|sleep)$/);
      expect(ICON_FOR_ITEM[k], k).toBeTruthy();
    }
    expect(EDGE_FOR_KIND.meal).toBe("caution");
    expect(EDGE_FOR_KIND.session).toBe("info");
    expect(EDGE_FOR_KIND.bedtime).toBe("sleep");
  });
});

describe("nextItemIndex", () => {
  const items = [item("06:15", "wake"), item("09:00"), item("12:30"), item("22:15", "bedtime")];

  it("finds the first item at or after now", () => {
    expect(nextItemIndex(items, "08:59")).toBe(1);
    expect(nextItemIndex(items, "09:00")).toBe(1);
    expect(nextItemIndex(items, "13:00")).toBe(3);
  });

  it("is null when every item is past, or the day isn't today", () => {
    expect(nextItemIndex(items, "23:00")).toBeNull();
    expect(nextItemIndex(items, null)).toBeNull();
  });

  it("treats an item after midnight as later in the day", () => {
    const late = [item("21:00"), item("00:30", "bedtime")];
    expect(nextItemIndex(late, "23:45")).toBe(1);
  });
});

describe("displayTitle", () => {
  it("Title Cases app-made titles", () => {
    expect(displayTitle(item("06:45", "snack"))).toBe("X");
    expect(displayTitle({ ...item("06:45", "snack"), title: "pre-run snack" })).toBe("Pre-Run Snack");
  });

  it("leaves supplement names exactly as the owner typed them", () => {
    expect(displayTitle({ ...item("08:00", "supplement"), title: "vitamin D3 (with food)" })).toBe("vitamin D3 (with food)");
  });
});
