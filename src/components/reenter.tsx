"use client";

import { useState, type ReactNode } from "react";
import styles from "./reenter.module.css";

/**
 * A done state with a small Re-enter button that reveals the form again. When collapsed, the
 * card's `title` and the one-line `summary` sit together on the left, with the button centred
 * beside both.
 */
export function Reenter({
  open,
  title,
  summary,
  children,
}: {
  open: boolean;
  title?: ReactNode;
  summary: ReactNode;
  children: ReactNode;
}) {
  const [show, setShow] = useState(open);
  if (show)
    return (
      <>
        {title}
        {children}
      </>
    );
  return (
    <div className={styles.done}>
      <div className={styles.info}>
        {title}
        <div className={styles.summary}>{summary}</div>
      </div>
      <button type="button" className={styles.button} onClick={() => setShow(true)}>
        Re-enter
      </button>
    </div>
  );
}
