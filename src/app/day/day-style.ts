import type { IconName } from "@/components/icon";
import type { TimelineItem, TimelineKind } from "@/lib/engine/day-timeline";
import { titleCase } from "@/lib/ui/title-case";

export type Edge = "accent" | "caution" | "info" | "sleep";

/** The colored left edge of each timeline card. */
export const EDGE_FOR_KIND: Record<TimelineKind, Edge> = {
  wake: "accent",
  supplement: "accent",
  routine: "sleep",
  meal: "caution",
  snack: "caution",
  session: "info",
  bedtime: "sleep",
};

export const ICON_FOR_ITEM: Record<TimelineKind, IconName> = {
  wake: "sun",
  supplement: "pill",
  routine: "sun",
  meal: "meal",
  snack: "bolt",
  session: "flag",
  bedtime: "moon",
};

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Index of the first item at or after `nowHHMM`, or null when everything is past or the
 * day isn't today (`nowHHMM` null). Items come in day order, so a clock time that goes
 * backwards (a bedtime after midnight) belongs to the next day.
 */
export function nextItemIndex(items: readonly TimelineItem[], nowHHMM: string | null): number | null {
  if (nowHHMM === null) return null;
  const now = minutes(nowHHMM);
  let offset = 0;
  let prev = -1;
  for (let i = 0; i < items.length; i++) {
    let t = minutes(items[i].time) + offset;
    if (t < prev) {
      offset += 24 * 60;
      t += 24 * 60;
    }
    prev = t;
    if (t >= now) return i;
  }
  return null;
}

/** The title shown for an item: Title Case, except supplement names, which stay as typed. */
export const displayTitle = (it: TimelineItem): string => (it.kind === "supplement" ? it.title : titleCase(it.title));
