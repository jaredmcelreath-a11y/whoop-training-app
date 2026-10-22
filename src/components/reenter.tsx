"use client";

import { useState, type ReactNode } from "react";
import styles from "./reenter.module.css";

/** A done state with a small Re-enter button that reveals the form again. */
export function Reenter({ open, summary, children }: { open: boolean; summary: ReactNode; children: ReactNode }) {
  const [show, setShow] = useState(open);
  if (show) return <>{children}</>;
  return (
    <div className={styles.done}>
      <div className={styles.summary}>{summary}</div>
      <button type="button" className={styles.button} onClick={() => setShow(true)}>
        Re-enter
      </button>
    </div>
  );
}
