import Link from "next/link";
import { ProgressChart } from "@/components/progress-chart";
import { Cap, Card, StatChip } from "@/components/ui/ui";
import type { SavedProjection } from "@/lib/plan/projection";
import { changeLine, goalLine, hms, legTime, progressPoints, thisWeekLine } from "@/lib/ui/projection-view";
import styles from "./projection-card.module.css";


/**
 * The projected half Ironman finish (rule race.projection): this week's saved projection, the
 * change from the previous saved week, where this week's workouts so far point (`liveS`), the
 * goal, the leg split and the weekly trend.
 */
export function ProjectionCard({
  current,
  history,
  goalSec,
  goalDefaultSec,
  liveS,
}: {
  current: SavedProjection;
  history: SavedProjection[];
  goalSec: number | null;
  goalDefaultSec: number;
  /** liveWeekProjection for the current week; omitted for any other week. */
  liveS?: number;
}) {
  const earlier = history.filter((h) => h.weekStart < current.weekStart);
  const previous = earlier.length ? earlier[earlier.length - 1].totalS : null;
  const estimate = current.estimates.swim || current.estimates.bike || current.estimates.run;
  const hint = (e: boolean) => (e ? "Estimate" : undefined);
  return (
    <Card hot>
      <div className={styles.head}>
        <Cap>Projected Finish</Cap>
        {estimate ? <span className={styles.estimate}>Estimate</span> : null}
      </div>
      <p className={styles.total}>{hms(current.totalS)}</p>
      <p className={styles.change}>{changeLine(current.totalS, previous)}</p>
      {liveS === undefined ? null : <p className={styles.change}>{thisWeekLine(liveS, current.totalS)}</p>}
      <p className={styles.goal}>{goalLine(goalSec)}</p>
      <div className={styles.legs}>
        <StatChip label="Swim" value={legTime(current.swimS)} hint={hint(current.estimates.swim)} />
        <StatChip label="Bike" value={legTime(current.bikeS)} hint={hint(current.estimates.bike)} />
        <StatChip label="Run" value={legTime(current.runS)} hint={hint(current.estimates.run)} />
        <StatChip label="T1 + T2" value={legTime(current.transitionS)} />
      </div>
      <ProgressChart points={progressPoints(history)} goalS={goalSec ?? goalDefaultSec} />
      <Link href="/plan/library#race.projection" className={styles.how}>
        How This Is Worked Out
      </Link>
    </Card>
  );
}
