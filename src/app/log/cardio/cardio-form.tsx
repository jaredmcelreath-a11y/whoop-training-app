"use client";

import { useActionState, useState } from "react";
import { keepInputOnSubmit } from "@/components/keep-input";
import { PAIN_AREAS } from "@/lib/log/validate";
import base from "../strength/strength.module.css";
import { logAfterRunPain, logCardio, type AfterRunState, type CardioState } from "./actions";
import styles from "./cardio.module.css";

type Kind = "run" | "bike" | "swim";
const KINDS: { kind: Kind; label: string }[] = [
  { kind: "run", label: "Run" },
  { kind: "bike", label: "Bike" },
  { kind: "swim", label: "Swim" },
];
const UNITS: Record<Kind, string[]> = { run: ["mi", "km"], bike: ["mi", "km"], swim: ["yd", "m"] };

function Status({ state, pending }: { state: { ok?: true; error?: string }; pending: boolean }) {
  if (pending) return null;
  if (state.error) {
    return (
      <p className={base.error} role="alert">
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

/** `defaultStart` is "now" in OWNER_TZ as a datetime-local value, minted by the server page. */
export function CardioForm({
  defaultStart,
  initialKind = "run",
  defaultDurationMin,
}: {
  defaultStart: string;
  initialKind?: Kind;
  defaultDurationMin?: number;
}) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [unit, setUnit] = useState(UNITS[initialKind][0]);
  const [state, action, pending] = useActionState<CardioState, FormData>(logCardio, {});

  return (
    <>
      {/* Remounts after a save so the fields clear; kind and unit live above it and stay. */}
      <form
        key={state.savedAt ?? 0}
        action={action}
        onSubmit={keepInputOnSubmit(action)}
        className={styles.form}
      >
        <fieldset className={styles.segmented}>
          <legend className={base.srOnly}>Kind</legend>
          {KINDS.map((k) => (
            <label key={k.kind} className={styles.segment}>
              <input
                type="radio"
                name="kind"
                value={k.kind}
                checked={kind === k.kind}
                onChange={() => {
                  setKind(k.kind);
                  setUnit(UNITS[k.kind][0]);
                }}
              />
              {k.label}
            </label>
          ))}
        </fieldset>

        <label className={styles.field}>
          <span className={styles.label}>Start</span>
          <input
            name="startedAt"
            type="datetime-local"
            defaultValue={defaultStart}
            className={base.input}
            required
          />
        </label>

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Duration (min)</span>
            <input
              name="durationMin"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder="30"
              defaultValue={defaultDurationMin ?? ""}
              className={base.input}
              required
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Distance</span>
            <input
              name="distance"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              placeholder={kind === "swim" ? "1500" : "3.1"}
              className={base.input}
            />
          </label>
        </div>

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Unit</span>
            <select
              name="unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className={base.select}
            >
              {UNITS[kind].map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          {kind === "swim" ? (
            <label className={styles.field}>
              <span className={styles.label}>Pool Length ({unit})</span>
              <input
                name="poolLength"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="25"
                className={base.input}
              />
            </label>
          ) : null}
          {kind === "bike" ? (
            <label className={styles.field}>
              <span className={styles.label}>Avg Watts</span>
              <input
                name="avgWatts"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                placeholder="145"
                className={base.input}
              />
            </label>
          ) : null}
          {kind === "run" ? (
            <label className={styles.field}>
              <span className={styles.label}>Incline (%)</span>
              <input
                name="inclinePct"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="1"
                className={base.input}
              />
            </label>
          ) : null}
        </div>

        {kind === "run" ? (
          <label className={styles.check}>
            <input type="checkbox" name="indoor" defaultChecked />
            Treadmill (indoor)
          </label>
        ) : null}

        <label className={styles.field}>
          <span className={styles.label}>Notes</span>
          <input
            name="notes"
            type="text"
            maxLength={500}
            autoComplete="off"
            className={base.input}
          />
        </label>

        <button type="submit" className={base.primary} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        <Status state={state} pending={pending} />
      </form>
      {state.runId && !pending ? <AfterRunPrompt key={state.runId} runId={state.runId} /> : null}
    </>
  );
}

/** One step after a run: knee, ankle and shin, each 0-10 or skip (the default). */
function AfterRunPrompt({ runId }: { runId: string }) {
  const [dismissed, setDismissed] = useState(false);
  const [state, action, pending] = useActionState<AfterRunState, FormData>(
    logAfterRunPain.bind(null, runId),
    {},
  );
  if (dismissed) return null;
  if (state.ok) {
    return (
      <p className={styles.saved} role="status">
        {state.count
          ? `Pain logged for ${state.count} area${state.count > 1 ? "s" : ""}.`
          : "Skipped."}
      </p>
    );
  }
  return (
    <form
      action={action}
      onSubmit={keepInputOnSubmit(action)}
      className={`${styles.form} ${styles.prompt}`}
      aria-label="After-run pain"
    >
      <p className={styles.promptTitle}>How do your knee, ankle and shin feel? (0–10)</p>
      {PAIN_AREAS.map((area) => (
        <label key={area} className={styles.areaRow}>
          <span className={styles.areaName}>{area}</span>
          <select name={`score_${area}`} defaultValue="skip" className={base.select}>
            <option value="skip">Skip</option>
            {Array.from({ length: 11 }, (_, n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      ))}
      <div className={base.inline}>
        <button type="submit" className={base.primary} disabled={pending}>
          {pending ? "Saving…" : "Log Pain"}
        </button>
        <button type="button" className={base.secondary} onClick={() => setDismissed(true)}>
          Not Now
        </button>
      </div>
      <Status state={state} pending={pending} />
    </form>
  );
}

/** Wraps a delete form's submit button in a native confirm. */
export function DeleteCardioButton({ label }: { label: string }) {
  return (
    <button
      type="submit"
      className={base.remove}
      aria-label={`Delete ${label}`}
      onClick={(e) => {
        if (!window.confirm(`Delete “${label}”?`)) e.preventDefault();
      }}
    >
      ×
    </button>
  );
}
