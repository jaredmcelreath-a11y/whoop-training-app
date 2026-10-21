"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { addWaterTap } from "./fuel-actions";
import styles from "./today.module.css";

/** "+16 oz". One clientId per tap (made at tap time); disabled while pending. */
export function WaterButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);

  function tap() {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    const clientId = crypto.randomUUID();
    start(async () => {
      try {
        const r = await addWaterTap(clientId);
        if (!r.ok) setError(r.error ?? "Couldn't save water");
        else router.refresh();
      } catch {
        setError("Couldn't save water");
      } finally {
        busy.current = false;
      }
    });
  }

  return (
    <>
      <button type="button" className={styles.waterButton} onClick={tap} disabled={pending} aria-busy={pending || undefined}>
        {pending ? "Adding…" : "+16 oz"}
      </button>
      {error ? <p className={styles.small} role="alert">{error}</p> : null}
    </>
  );
}
