"use client";

import { useActionState } from "react";
import { keepInputOnSubmit } from "@/components/keep-input";
import { logWeekly, logWeight, type FormState } from "./actions";
import styles from "./log.module.css";

function Status({ state, pending }: { state: FormState; pending: boolean }) {
  if (pending) return null;
  if (state.error) {
    return (
      <p className={styles.error} role="alert">
        {state.error}
      </p>
    );
  }
  if (state.ok) {
    return (
      <p className={styles.saved} role="status">
        Saved
      </p>
    );
  }
  return null;
}

export function WeightForm() {
  const [state, action, pending] = useActionState(logWeight, {});
  return (
    <form
      key={state.savedAt ?? 0}
      action={action}
      onSubmit={keepInputOnSubmit(action)}
      className={styles.form}
    >
      <label className={styles.field}>
        <span className={styles.label}>Today&apos;s Weight (lb)</span>
        <input
          name="weightLb"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="165.2"
          className={styles.input}
          required
        />
      </label>
      <button type="submit" className={styles.primary} disabled={pending}>
        {pending ? "Saving…" : "Log Weight"}
      </button>
      <Status state={state} pending={pending} />
    </form>
  );
}

export function WeeklyForm({ vo2max, whoopAge }: { vo2max: number | null; whoopAge: number | null }) {
  const [state, action, pending] = useActionState(logWeekly, {});
  return (
    <form
      key={state.savedAt ?? 0}
      action={action}
      onSubmit={keepInputOnSubmit(action)}
      className={styles.form}
    >
      <div className={styles.row}>
        <label className={styles.field}>
          <span className={styles.label}>VO2 Max</span>
          <input
            name="vo2max"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={vo2max ?? ""}
            className={styles.input}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>WHOOP Age</span>
          <input
            name="whoopAge"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            defaultValue={whoopAge ?? ""}
            className={styles.input}
          />
        </label>
      </div>
      <button type="submit" className={styles.primary} disabled={pending}>
        {pending ? "Saving…" : "Save This Week"}
      </button>
      <Status state={state} pending={pending} />
    </form>
  );
}
