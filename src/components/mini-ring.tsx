import styles from "./mini-ring.module.css";

const R = 40;
const CIRC = 2 * Math.PI * R;
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Dash pattern and offset that draw the arc from `low` to `high` on a ring of length `circ`. */
export function bandArc(low: number, high: number, max: number, circ: number): { dash: string; offset: number } {
  const from = Math.min(Math.max(low, 0), max);
  const to = Math.min(Math.max(high, from), max);
  return { dash: `${round2(((to - from) / max) * circ)} ${round2(circ)}`, offset: round2(-(from / max) * circ) };
}

/**
 * A small ring beside the recovery ring (sleep or strain). `band`, when given, is drawn as a
 * wider translucent arc on the track: the strain target.
 */
export function MiniRing({
  label,
  value,
  max,
  display,
  tone,
  band,
  pendingLabel,
}: {
  label: string;
  value: number | null;
  max: number;
  display: string;
  tone: "sleep" | "strain";
  band: { low: number; high: number } | null;
  pendingLabel: string;
}) {
  const scored = value !== null && Number.isFinite(value);
  const frac = scored ? Math.min(Math.max(value / max, 0), 1) : 0;
  const target = band ? `, target ${band.low} to ${band.high}` : "";
  const aria = scored ? `${label} ${display}${target}` : `${label} ${pendingLabel}`;
  const arc = band ? bandArc(band.low, band.high, max, CIRC) : null;
  return (
    <svg className={styles.ring} viewBox="0 0 100 100" role="img" aria-label={aria} data-tone={tone}>
      <circle cx="50" cy="50" r={R} className={styles.track} />
      {arc ? (
        <circle
          cx="50"
          cy="50"
          r={R}
          className={styles.band}
          strokeDasharray={arc.dash}
          strokeDashoffset={arc.offset}
          transform="rotate(-90 50 50)"
        />
      ) : null}
      {scored ? (
        <circle
          cx="50"
          cy="50"
          r={R}
          className={styles.arc}
          strokeDasharray={`${round2(frac * CIRC)} ${round2(CIRC)}`}
          transform="rotate(-90 50 50)"
        />
      ) : null}
      <text x="50" y="57" textAnchor="middle" className={scored ? styles.value : styles.pending}>
        {scored ? display : pendingLabel}
      </text>
    </svg>
  );
}
