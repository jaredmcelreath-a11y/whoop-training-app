import Link from "next/link";
import type { WhyEntry } from "@/lib/plan/today-view";
import styles from "./today.module.css";

/** A `<details>` sheet listing every reason with its rule statement and evidence level. */
export function WhySheet({ entries }: { entries: WhyEntry[] }) {
  if (!entries.length) return null;
  return (
    <details className={styles.why}>
      <summary className={styles.whySummary}>Why</summary>
      <ul className={styles.whyList}>
        {entries.map((e, i) => (
          <li key={`${e.ruleId}-${i}`} className={styles.whyItem}>
            <p className={styles.whyText}>{e.text}</p>
            {e.statement ? <p className={styles.small}>{e.statement}</p> : null}
            <p className={styles.small}>
              {e.evidenceLabel ? <span className={styles.evBadge}>{e.evidenceLabel}</span> : null}
              <Link href={e.href} className={styles.whyLink}>
                See the evidence
              </Link>
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}
