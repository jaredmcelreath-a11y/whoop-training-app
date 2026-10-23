import { hms } from "@/lib/ui/projection-view";
import { ChartTips } from "./chart-tips";
import styles from "./progress-chart.module.css";

const W = 320;
const H = 150;
const PAD_X = 16;
const PAD_TOP = 14;
const PAD_BOTTOM = 26;
const DOT_R = 3.5;
/** Headroom above and below the data so the line never sits on an edge (seconds). */
const MARGIN_S = 300;

/**
 * The projected finish over time: evenly spaced points (Start, then each week), lower is faster,
 * with the goal as a dashed line. Points are evenly spaced because Start and the first week can
 * fall in the same week.
 */
export function ProgressChart({ points, goalS }: { points: { label: string; totalS: number }[]; goalS: number }) {
  if (points.length < 2) return <p className={styles.empty}>Your chart starts after next week&apos;s projection.</p>;
  const values = [...points.map((p) => p.totalS), goalS];
  const lo = Math.min(...values) - MARGIN_S;
  const hi = Math.max(...values) + MARGIN_S;
  const x = (i: number) => PAD_X + (i * (W - 2 * PAD_X)) / (points.length - 1);
  const y = (s: number) => PAD_TOP + ((hi - s) / (hi - lo)) * (H - PAD_TOP - PAD_BOTTOM);
  const first = points[0];
  const last = points[points.length - 1];
  const tips = points.map((p, i) => ({ x: x(i), y: y(p.totalS), text: `${hms(p.totalS)} · ${p.label}` }));
  return (
    <ChartTips tips={tips} width={W} height={H}>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Projected finish from ${hms(first.totalS)} at ${first.label} to ${hms(last.totalS)} at ${last.label}, goal ${hms(goalS)}`}
      >
        <line x1={PAD_X} x2={W - PAD_X} y1={y(goalS)} y2={y(goalS)} className={styles.goal} data-goal="true" />
        <text x={W - PAD_X} y={y(goalS) - 4} textAnchor="end" className={styles.goalText}>
          Goal
        </text>
        <polyline points={points.map((p, i) => `${x(i)},${y(p.totalS)}`).join(" ")} className={styles.line} />
        {points.map((p, i) => (
          <circle key={`${p.label}-${i}`} cx={x(i)} cy={y(p.totalS)} r={DOT_R} className={styles.dot} />
        ))}
        <text x={x(0)} y={H - 8} className={styles.axis}>
          {first.label}
        </text>
        <text x={x(points.length - 1)} y={H - 8} textAnchor="end" className={styles.axis}>
          {last.label}
        </text>
      </svg>
    </ChartTips>
  );
}
