"use client";

import { Icon } from "@/components/icon";
import { Page } from "@/components/ui/ui";
import styles from "./error-view.module.css";

/** Shared body for route error boundaries: a short message and a retry button. */
export function ErrorView({ reset }: { reset: () => void }) {
  return (
    <Page glow="low">
      <div className={styles.card} role="alert">
        <Icon name="alert" size={22} className={styles.icon} />
        <p className={styles.message}>
          Something went wrong — your last entry may not have saved.
        </p>
        <button type="button" className={styles.retry} onClick={() => reset()}>
          Try Again
        </button>
      </div>
    </Page>
  );
}
