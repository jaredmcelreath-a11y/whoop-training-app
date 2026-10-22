"use client";

import { useActionState } from "react";
import { keepInputOnSubmit } from "@/components/keep-input";
import styles from "../cardio/cardio.module.css";
import base from "../strength/strength.module.css";
import { logSweatTest, type SweatState } from "./actions";

const KINDS = [
  { kind: "run", label: "Run" },
  { kind: "bike", label: "Bike" },
  { kind: "swim", label: "Swim" },
] as const;

function NumberField({ name, label, placeholder }: { name: string; label: string; placeholder: string }) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <input
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        className={base.input}
      />
    </label>
  );
}

/** `today` is the local date in OWNER_TZ, minted by the server page. */
export function SweatForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState<SweatState, FormData>(logSweatTest, {});
  return (
    <form
      key={state.savedAt ?? 0}
      action={action}
      onSubmit={keepInputOnSubmit(action)}
      className={styles.form}
    >
      <fieldset className={styles.segmented}>
        <legend className={base.srOnly}>Sport</legend>
        {KINDS.map((k) => (
          <label key={k.kind} className={styles.segment}>
            <input type="radio" name="kind" value={k.kind} defaultChecked={k.kind === "run"} />
            {k.label}
          </label>
        ))}
      </fieldset>

      <label className={styles.field}>
        <span className={styles.label}>Date</span>
        <input name="testedOn" type="date" defaultValue={today} className={base.input} required />
      </label>

      <div className={styles.row}>
        <NumberField name="preLb" label="Weight before (lb)" placeholder="160.0" />
        <NumberField name="postLb" label="Weight after (lb)" placeholder="158.5" />
      </div>
      <div className={styles.row}>
        <NumberField name="fluidOz" label="Fluid drunk (oz)" placeholder="16" />
        <NumberField name="durationMin" label="Duration (min)" placeholder="60" />
      </div>

      <label className={styles.field}>
        <span className={styles.label}>Notes</span>
        <input name="notes" type="text" maxLength={500} autoComplete="off" className={base.input} />
      </label>

      <button type="submit" className={base.primary} disabled={pending}>
        {pending ? "Saving…" : "Save test"}
      </button>
      {!pending && state.error ? (
        <p className={base.error} role="alert">
          {state.error}
        </p>
      ) : null}
      {!pending && state.ok ? (
        <p className={styles.saved} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
