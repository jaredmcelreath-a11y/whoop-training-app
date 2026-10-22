import { Icon } from "@/components/icon";
import type { StripState } from "@/lib/plan/view";
import styles from "./plan.module.css";

/** One day's box in the week strip; done and missed also differ by shape, not only color. */
export function StripBox({ state }: { state: StripState }) {
  return (
    <span className={styles.stripBox}>
      {state === "done" ? (
        <span data-glyph="check" className={styles.stripGlyph}>
          <Icon name="check" size={16} />
        </span>
      ) : state === "missed" ? (
        <span data-glyph="close" className={styles.stripGlyph}>
          <Icon name="close" size={14} />
        </span>
      ) : null}
    </span>
  );
}
