import { desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { cycles, recoveries } from "@/db/schema";
import { recoveryBand, type Band } from "./recovery";

/** A recovery older than this no longer colors the app. */
const MAX_AGE_MS = 36 * 60 * 60 * 1000;

/**
 * Today's recovery band for the page glow: the latest cycle's own recovery, as Today shows it.
 * Reads stored data only (never calls WHOOP); null while pending, stale or missing.
 */
export async function getTodayBand(db: Db, now: Date): Promise<Band | null> {
  const [latest] = await db
    .select({ start: cycles.start, state: recoveries.scoreState, score: recoveries.recoveryScore })
    .from(cycles)
    .leftJoin(recoveries, eq(recoveries.cycleId, cycles.id))
    .orderBy(desc(cycles.start))
    .limit(1);
  if (!latest || now.getTime() - latest.start.getTime() > MAX_AGE_MS) return null;
  if (latest.state !== "SCORED") return null;
  return recoveryBand(latest.score);
}
