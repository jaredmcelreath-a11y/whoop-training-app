/** Pure SVG geometry for the line chart: maps date/value points to pixel coordinates. */
import { dayNumber, type Point } from "@/lib/progress/series";

export type ChartOpts = { width: number; height: number; pad: number; yMin?: number; yMax?: number };
export type ChartGeometry = {
  paths: string[];
  dots: { x: number; y: number; date: string; value: number }[];
  yTicks: { y: number; label: string }[];
  xLabels: { x: number; label: string }[];
  /** Pixel y for a value on the same scale (used for goal lines). */
  yOf: (value: number) => number;
};

const FLAT_HALF_RANGE = 1;
const TICK_COUNT = 3;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const round1 = (x: number) => Math.round(x * 10) / 10;
const shortDate = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${Number(d.slice(8, 10))}`;
const tickLabel = (v: number) => String(round1(v));

export function chartGeometry(segments: Point[][], opts: ChartOpts): ChartGeometry {
  const { width, height, pad } = opts;
  const all = segments.flat();
  const days = all.map((p) => dayNumber(p.date));
  const x0 = days.length ? Math.min(...days) : 0;
  const x1 = days.length ? Math.max(...days) : 0;
  const values = all.map((p) => p.value);
  let lo = opts.yMin ?? (values.length ? Math.min(...values) : 0);
  let hi = opts.yMax ?? (values.length ? Math.max(...values) : 0);
  if (hi - lo === 0) {
    lo -= FLAT_HALF_RANGE;
    hi += FLAT_HALF_RANGE;
  }
  const innerW = width - 2 * pad;
  const innerH = height - 2 * pad;
  const xOf = (date: string) => (x1 === x0 ? pad : pad + ((dayNumber(date) - x0) / (x1 - x0)) * innerW);
  const yOf = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * innerH;

  const paths = segments
    .filter((s) => s.length > 0)
    .map((s) => s.map((p, i) => `${i === 0 ? "M" : "L"}${round1(xOf(p.date))} ${round1(yOf(p.value))}`).join(" "));
  const dots = all.map((p) => ({ x: xOf(p.date), y: yOf(p.value), date: p.date, value: p.value }));
  const yTicks = Array.from({ length: TICK_COUNT }, (_, i) => {
    const v = lo + ((hi - lo) * i) / (TICK_COUNT - 1);
    return { y: yOf(v), label: tickLabel(v) };
  });
  const dates = all.map((p) => p.date).sort();
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const xLabels = !dates.length
    ? []
    : firstDate === lastDate
      ? [{ x: xOf(firstDate), label: shortDate(firstDate) }]
      : [
          { x: xOf(firstDate), label: shortDate(firstDate) },
          { x: xOf(lastDate), label: shortDate(lastDate) },
        ];
  return { paths, dots, yTicks, xLabels, yOf };
}
