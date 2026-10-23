import { RULES } from "@/lib/engine/rules/catalog";
import type { ChangeView as Change } from "@/lib/plan/today-view";
import { titleCase } from "@/lib/ui/title-case";
import styles from "./change-view.module.css";

const RULE_WHY = RULES as Record<string, { why: string } | undefined>;

const line = (s: { title: string; durationMin: number }) =>
  s.durationMin > 0 ? `${titleCase(s.title)} · ${s.durationMin} min` : titleCase(s.title);

/** What a changed session was, what it became (when known) and why, with links to the rules. */
export function ChangeView({ before, now, reasons }: Change) {
  return (
    <div className={styles.panel}>
      <p className={styles.row}>
        <span className={styles.label}>Before</span>
        <span className={styles.was}>{line(before)}</span>
      </p>
      {now ? (
        <p className={styles.row}>
          <span className={styles.label}>Now</span>
          <span>{line(now)}</span>
        </p>
      ) : null}
      <ul className={styles.reasons}>
        {reasons.map((r, i) => (
          <li key={`${r.ruleId}-${i}`}>
            {r.text}{" "}
            <a href={`/plan/library#${r.ruleId}`} className={styles.why} title={RULE_WHY[r.ruleId]?.why}>
              Why
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The small red dot on a card the plan changed. `className` moves it for a different card shape. */
export function ChangeDot({ className }: { className?: string }) {
  return <span className={className ? `${styles.dot} ${className}` : styles.dot} role="img" aria-label="Changed by the Plan" />;
}
