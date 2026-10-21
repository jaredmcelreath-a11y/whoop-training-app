"use client";

import { useActionState, useState } from "react";
import { keepInputOnSubmit } from "@/components/keep-input";
import { parseLabPaste } from "@/lib/log/lab-paste";
import cardio from "../cardio/cardio.module.css";
import { logLabPanel, type RecordState } from "../records-actions";
import styles from "../records.module.css";
import base from "../strength/strength.module.css";

type Row = {
  key: number;
  marker: string;
  value: string;
  unit: string;
  flag: string;
};
let nextKey = 1;
const blank = (): Row => ({
  key: nextKey++,
  marker: "",
  value: "",
  unit: "",
  flag: "",
});

export function LabForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState<RecordState, FormData>(
    logLabPanel,
    {},
  );
  const [rows, setRows] = useState<Row[]>(() => [blank()]);
  const [paste, setPaste] = useState("");
  const [unparsed, setUnparsed] = useState<string[]>([]);
  const [seen, setSeen] = useState(state.savedAt);

  // After a successful save, reset the rows.
  if (state.savedAt !== seen) {
    setSeen(state.savedAt);
    setRows([blank()]);
    setPaste("");
    setUnparsed([]);
  }

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  function applyPaste() {
    const { parsed, unparsed: bad } = parseLabPaste(paste);
    setUnparsed(bad);
    if (!parsed.length) return;
    setRows((rs) => [
      ...rs.filter((r) => r.marker || r.value || r.unit),
      ...parsed.map((p) => ({
        key: nextKey++,
        marker: p.marker,
        value: String(p.value),
        unit: p.unit,
        flag: "",
      })),
    ]);
    setPaste("");
  }

  return (
    // Remounts after a save so date and source go back to their defaults.
    <form
      key={state.savedAt ?? 0}
      action={action}
      onSubmit={keepInputOnSubmit(action)}
      className={cardio.form}
    >
      <label className={cardio.field}>
        <span className={cardio.label}>Date drawn</span>
        <input
          type="date"
          name="drawnOn"
          defaultValue={today}
          required
          className={base.input}
        />
      </label>
      <label className={cardio.field}>
        <span className={cardio.label}>Source (optional)</span>
        <input
          name="source"
          maxLength={100}
          placeholder="manual"
          className={base.input}
        />
      </label>

      <label className={cardio.field}>
        <span className={cardio.label}>
          Paste results, one per line (Marker: value unit)
        </span>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          className={styles.textarea}
          placeholder={"Ferritin: 120 ng/mL\nHbA1c: 5.2 %"}
        />
      </label>
      <button
        type="button"
        className={base.secondary}
        onClick={applyPaste}
        disabled={!paste.trim()}
      >
        Parse into rows
      </button>
      {unparsed.length ? (
        <div className={base.error} role="alert">
          Couldn’t read {unparsed.length} line{unparsed.length === 1 ? "" : "s"}
          :
          <ul>
            {unparsed.map((l, i) => (
              <li key={`${i}-${l}`}>{l}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {rows.map((r, i) => (
        <div key={r.key} className={styles.labRow}>
          <label className={cardio.field}>
            <span className={cardio.label}>Marker</span>
            <input
              name="marker"
              value={r.marker}
              onChange={(e) => update(r.key, { marker: e.target.value })}
              className={base.input}
              autoComplete="off"
            />
          </label>
          <label className={cardio.field}>
            <span className={cardio.label}>Value</span>
            <input
              name="value"
              inputMode="decimal"
              value={r.value}
              onChange={(e) => update(r.key, { value: e.target.value })}
              className={base.input}
              autoComplete="off"
            />
          </label>
          <label className={cardio.field}>
            <span className={cardio.label}>Unit</span>
            <input
              name="unit"
              value={r.unit}
              onChange={(e) => update(r.key, { unit: e.target.value })}
              className={base.input}
              autoComplete="off"
            />
          </label>
          <label className={cardio.field}>
            <span className={cardio.label}>Flag (optional)</span>
            <input
              name="flag"
              value={r.flag}
              onChange={(e) => update(r.key, { flag: e.target.value })}
              className={base.input}
              maxLength={30}
              autoComplete="off"
            />
          </label>
          {rows.length > 1 ? (
            <button
              type="button"
              className={`${base.secondary} ${styles.wide}`}
              onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              aria-label={`Remove row ${i + 1}`}
            >
              Remove row
            </button>
          ) : null}
        </div>
      ))}
      <button
        type="button"
        className={base.secondary}
        onClick={() => setRows((rs) => [...rs, blank()])}
      >
        Add row
      </button>

      <button type="submit" className={base.primary} disabled={pending}>
        {pending ? "Saving…" : "Save panel"}
      </button>
      {!pending && state.error ? (
        <p className={base.error} role="alert">
          {state.error}
        </p>
      ) : null}
      {!pending && state.ok ? (
        <p className={cardio.saved} role="status">
          Saved
        </p>
      ) : null}
    </form>
  );
}
