import { BAND_LABEL, type Band } from "@/lib/ui/recovery";
import styles from "./recovery-ring.module.css";

const R = 62;
const CIRC = 2 * Math.PI * R;

/** The big recovery ring on Today. Without a score it shows an empty track and the pending label. */
export function RecoveryRing({ score, band, pendingLabel }: { score: number | null; band: Band | null; pendingLabel: string }) {
  const scored = score !== null && band !== null && Number.isFinite(score);
  const pct = scored ? Math.min(Math.max(score, 0), 100) : 0;
  return (
    <div className={styles.wrap}>
      <svg
        className={styles.ring}
        viewBox="0 0 150 150"
        role="img"
        aria-label={scored ? `Recovery ${Math.round(pct)}%, ${BAND_LABEL[band]}` : `Recovery ${pendingLabel}`}
      >
        <circle cx="75" cy="75" r={R} className={styles.track} />
        {scored ? (
          <circle
            cx="75"
            cy="75"
            r={R}
            className={styles.arc}
            data-arc
            data-band={band}
            strokeDasharray={`${Math.round((pct / 100) * CIRC)} ${Math.ceil(CIRC)}`}
            transform="rotate(-90 75 75)"
          />
        ) : null}
        <text x="75" y={scored ? 89 : 87} textAnchor="middle" className={scored ? styles.value : styles.pending}>
          {scored ? (
            <>
              {Math.round(pct)}
              <tspan className={styles.pct}>%</tspan>
            </>
          ) : (
            "—"
          )}
        </text>
      </svg>
      <p className={styles.label} data-band={band ?? "none"}>
        {scored ? BAND_LABEL[band] : pendingLabel}
      </p>
    </div>
  );
}
