import Link from "next/link";
import type { Point } from "@/lib/progress/series";
import { shortDate } from "@/lib/progress/view";
import { chartGeometry } from "./chart-geometry";
import { ChartTips } from "./chart-tips";
import styles from "./line-chart.module.css";

const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 140;
const DEFAULT_PAD = 24;
const MIN_POINTS = 2;
const DOT_RADIUS = 3;
const TICK_GAP = 4;
const LABEL_DROP = 14;

type Props = {
  segments: Point[][];
  secondary?: Point[][];
  goal?: number;
  unit: string;
  /** The unit in a dot's popup when it differs from the caption's (e.g. "lb" under "lb (7-day avg)"). */
  dotUnit?: string;
  /** How values read on the axis, popups and caption; defaults to one decimal. */
  format?: (value: number) => string;
  label: string;
  emptyText: string;
  emptyHref?: string;
  width?: number;
  height?: number;
  pad?: number;
};

const fmt = (v: number) => String(Math.round(v * 10) / 10);

export function LineChart({
  segments,
  secondary,
  goal,
  unit,
  dotUnit = unit,
  format = fmt,
  label,
  emptyText,
  emptyHref,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  pad = DEFAULT_PAD,
}: Props) {
  const sec = secondary ?? [];
  // Emptiness is decided on the raw points only: secondary (average) points don't count.
  const distinctDates = new Set(segments.flat().map((p) => p.date)).size;
  if (distinctDates < MIN_POINTS) {
    return emptyHref ? (
      <Link href={emptyHref} className={styles.empty}>
        {emptyText}
      </Link>
    ) : (
      <p className={styles.empty}>{emptyText}</p>
    );
  }

  const values = [...segments, ...sec].flat().map((p) => p.value);
  if (goal !== undefined) values.push(goal);
  // One shared scale for raw points and the secondary line.
  const g = chartGeometry([...segments, ...sec], {
    width,
    height,
    pad,
    yMin: Math.min(...values),
    yMax: Math.max(...values),
    format,
  });
  const rawCount = segments.reduce((n, s) => n + s.length, 0);
  const rawDots = g.dots.slice(0, rawCount);
  const linePaths = sec.length > 0 ? g.paths.slice(segments.length) : g.paths;
  const last = (sec.length > 0 ? sec : segments).flat().at(-1);
  const tips = segments.flat().map((p, i) => ({ ...rawDots[i], text: `${format(p.value)} ${dotUnit} · ${shortDate(p.date)}` }));

  return (
    <figure className={styles.chart} style={{ margin: 0 }}>
      <ChartTips tips={tips} width={width} height={height}>
        <svg className={styles.svg} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
          {g.yTicks.map((t, i) => (
            <g key={i}>
              <line className={styles.grid} x1={pad} x2={width - pad} y1={t.y} y2={t.y} />
              <text className={styles.tick} x={pad} y={t.y - TICK_GAP}>
                {t.label}
              </text>
            </g>
          ))}
          {goal !== undefined && (
            <line className={styles.goal} x1={pad} x2={width - pad} y1={g.yOf(goal)} y2={g.yOf(goal)} />
          )}
          {linePaths.map((d, i) => (
            <path key={`a${i}`} className={styles.area} data-area="true" d={areaPath(d, height - pad)} />
          ))}
          {linePaths.map((d, i) => (
            <path key={i} className={styles.line} d={d} />
          ))}
          {rawDots.map((p, i) => (
            <circle
              key={i}
              className={sec.length > 0 ? styles.dotFaint : styles.dot}
              cx={p.x}
              cy={p.y}
              r={DOT_RADIUS}
            />
          ))}
          {g.xLabels.map((l, i) => (
            <text
              key={i}
              className={styles.tick}
              x={l.x}
              y={height - pad + LABEL_DROP}
              textAnchor={i === 0 ? "start" : "end"}
            >
              {l.label}
            </text>
          ))}
        </svg>
      </ChartTips>
      {last && (
        <figcaption className={styles.latest}>
          {format(last.value)} {unit}
        </figcaption>
      )}
    </figure>
  );
}

/** Closes a line path ("M x y L x y …") down to the chart floor, for the soft fill under it. */
function areaPath(d: string, floorY: number): string {
  const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  if (nums.length < 4) return "";
  const firstX = nums[0];
  const lastX = nums[nums.length - 2];
  return `${d} L ${lastX} ${floorY} L ${firstX} ${floorY} Z`;
}
