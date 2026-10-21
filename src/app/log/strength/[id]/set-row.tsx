"use client";

import { useActionState } from "react";
import { keepInputOnSubmit } from "@/components/keep-input";
import { addExerciseAction, addSetAction, type SetState } from "../actions";
import styles from "../strength.module.css";

/**
 * The "add set" row. Its clientId lives in action state: a double-tap submits the same id twice
 * (the server keeps one set), and a fresh id comes back only with a saved response.
 * The first id is minted by the server page so SSR and hydration agree.
 */
export function SetRow({
  sessionId,
  exerciseId,
  setIndex,
  reps,
  weightLb,
  initialClientId,
}: {
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  reps: number | null;
  weightLb: number | null;
  initialClientId: string;
}) {
  const [state, action, pending] = useActionState<SetState, FormData>(
    addSetAction.bind(null, sessionId),
    { clientId: initialClientId },
  );
  return (
    // Keyed by clientId so each new row remounts with the fresh prefill; on an error the
    // clientId (and so the typed reps/weight) stays.
    <form
      key={state.clientId}
      action={action}
      onSubmit={keepInputOnSubmit(action)}
      className={styles.addRow}
    >
      <input type="hidden" name="clientId" value={state.clientId} />
      <input type="hidden" name="exerciseId" value={exerciseId} />
      <input type="hidden" name="setIndex" value={setIndex} />
      <span className={styles.setNum} aria-label={`Set ${setIndex + 1}`}>
        {setIndex + 1}
      </span>
      <label className={styles.numField}>
        <span className={styles.srOnly}>Reps</span>
        <input
          name="reps"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          placeholder="reps"
          defaultValue={reps ?? ""}
          className={styles.numInput}
          required
        />
      </label>
      <label className={styles.numField}>
        <span className={styles.srOnly}>Weight (lb, empty for bodyweight)</span>
        <input
          name="weightLb"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder="lb"
          defaultValue={weightLb ?? ""}
          className={styles.numInput}
        />
      </label>
      <button type="submit" className={styles.addButton} disabled={pending}>
        {pending ? "…" : "Add set"}
      </button>
      {state.error && !pending ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

const CATEGORIES = ["strength", "bodyweight", "plyo", "core", "mobility"] as const;

/** `exList` is the current `?ex=` list; the new exercise is appended to it. */
export function AddExerciseForm({ sessionId, exList }: { sessionId: string; exList: string }) {
  const [state, action, pending] = useActionState(addExerciseAction, {});
  return (
    <form action={action} onSubmit={keepInputOnSubmit(action)} className={styles.stack}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="ex" value={exList} />
      <input
        name="name"
        type="text"
        autoComplete="off"
        placeholder="New exercise name"
        aria-label="New exercise name"
        className={styles.input}
        maxLength={80}
        required
      />
      <div className={styles.inline}>
        <select name="category" aria-label="Category" className={styles.select} defaultValue="strength">
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button type="submit" className={styles.secondary} disabled={pending}>
          {pending ? "Adding…" : "Add new"}
        </button>
      </div>
      {state.error && !pending ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

/** Wraps the delete form's submit button in a native confirm. */
export function DeleteWorkoutButton() {
  return (
    <button
      type="submit"
      className={styles.dangerLink}
      onClick={(e) => {
        if (!window.confirm("Delete this workout and all its sets?")) e.preventDefault();
      }}
    >
      Delete workout
    </button>
  );
}
