"use client";

import styles from "./error-view.module.css";

/** Shared body for route error boundaries: a short message and a retry button. */
export function ErrorView({ reset }: { reset: () => void }) {
  return (
    <main className={styles.page}>
      <div className={styles.card} role="alert">
        <p className={styles.message}>
          Something went wrong — your last entry may not have saved.
        </p>
        <button type="button" className={styles.retry} onClick={() => reset()}>
          Try again
        </button>
      </div>
    </main>
  );
}
