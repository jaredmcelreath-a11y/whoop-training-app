"use client";

import { useActionState } from "react";
import { addSourceAction, type AddSourceState } from "./source-actions";
import styles from "../plan.module.css";

/** "Add a Source" under one rule: a link, DOI or PubMed ID, checked before it's saved. */
export function AddSourceForm({ ruleId }: { ruleId: string }) {
  const [state, action, pending] = useActionState<AddSourceState, FormData>(addSourceAction, {});
  return (
    <details className={styles.addSource}>
      <summary className={styles.addSourceSummary}>Add a Source</summary>
      {/* Remounts after a save so the fields clear. */}
      <form key={state.savedAt ?? 0} action={action} className={styles.addSourceForm}>
        <input type="hidden" name="ruleId" value={ruleId} />
        <label className={styles.field}>
          <span className={styles.label}>Link, DOI or PubMed ID</span>
          <input name="input" required maxLength={500} autoComplete="off" placeholder="https://doi.org/…" className={styles.input} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>It</span>
          <select name="stance" defaultValue="supports" className={styles.input}>
            <option value="supports">Supports This Rule</option>
            <option value="contradicts">Contradicts This Rule</option>
            <option value="context">Is Background Only</option>
          </select>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Note (optional)</span>
          <textarea name="note" maxLength={1000} rows={2} className={styles.input} placeholder="What should change, and why" />
        </label>
        <label className={styles.checkRow}>
          <input type="checkbox" name="propose" />
          <span>Propose a Rule Change</span>
        </label>
        <button type="submit" className={styles.thisWeek} disabled={pending}>
          {pending ? "Checking…" : "Check and Add"}
        </button>
        {!pending && state.error ? (
          <p className={styles.formError} role="alert">
            {state.error}
          </p>
        ) : null}
        {!pending && state.ok ? (
          <p className={styles.sub} role="status">
            {state.ok}
          </p>
        ) : null}
      </form>
    </details>
  );
}
