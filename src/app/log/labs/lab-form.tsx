"use client";

import { useActionState, useState } from "react";
import { keepInputOnSubmit } from "@/components/keep-input";
import { mergeRows, type FormRow } from "@/lib/log/lab-rows";
import { parseLabText, parseLabTexts, type LabRead } from "@/lib/log/lab-text";
import { readImageText } from "./read-image";
import cardio from "../cardio/cardio.module.css";
import { logLabPanel, type RecordState } from "../records-actions";
import styles from "../records.module.css";
import base from "../strength/strength.module.css";

type Row = FormRow;
let nextKey = 1;
const newKey = () => nextKey++;
const blank = (): Row => ({
  key: newKey(),
  marker: "",
  value: "",
  unit: "",
  flag: "",
  refRange: "",
});

/** `known` is the owner's stored marker names, so screenshots match them too. */
export function LabForm({ today, known }: { today: string; known: string[] }) {
  const [state, action, pending] = useActionState<RecordState, FormData>(
    logLabPanel,
    {},
  );
  const [rows, setRows] = useState<Row[]>(() => [blank()]);
  const [paste, setPaste] = useState("");
  const [unparsed, setUnparsed] = useState<string[]>([]);
  const [drawnOn, setDrawnOn] = useState(today);
  const [note, setNote] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const [seen, setSeen] = useState(state.savedAt);

  // After a successful save, reset the rows.
  if (state.savedAt !== seen) {
    setSeen(state.savedAt);
    setRows([blank()]);
    setPaste("");
    setUnparsed([]);
    setDrawnOn(today);
    setNote(null);
  }

  const update = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  /** Puts read results into the rows for review; nothing is saved until Save Panel. */
  function apply({ results, unread, drawnOn: found }: LabRead) {
    setUnparsed(unread);
    if (found) setDrawnOn(found);
    if (!results.length) {
      setNote("Couldn't read any results. Try a clearer screenshot or type them in.");
      return false;
    }
    setRows((rs) => mergeRows(rs, results, newKey));
    setNote(`Found ${results.length} result${results.length === 1 ? "" : "s"}. Check them before saving.`);
    return true;
  }

  function applyPaste() {
    if (apply(parseLabText(paste, known, { loose: true }))) setPaste("");
  }

  async function readScreenshots(files: File[]) {
    if (!files.length) return;
    setNote(null);
    try {
      const texts = await readImageText(files, (done, total) =>
        setReading(done < total ? `Reading ${done + 1} of ${total}…` : null),
      );
      apply(parseLabTexts(texts, known));
    } catch (err) {
      console.error("readImageText failed:", err);
      setNote("Couldn't read the screenshots. Try again or paste the text.");
    } finally {
      setReading(null);
    }
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
          value={drawnOn}
          onChange={(e) => setDrawnOn(e.target.value)}
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

      <label className={styles.fileButton}>
        <input
          type="file"
          accept="image/*"
          multiple
          className={styles.fileInput}
          disabled={reading !== null}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            void readScreenshots(files);
          }}
        />
        {reading ?? "Read Screenshots"}
      </label>
      <p className={cardio.label}>Read on this phone; screenshots aren&apos;t uploaded or saved.</p>
      <label className={cardio.field}>
        <span className={cardio.label}>
          Or paste results (one per line)
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
        Parse Into Rows
      </button>
      {note ? (
        <p className={cardio.label} role="status">
          {note}
        </p>
      ) : null}
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
            <span className={cardio.label}>Range (optional)</span>
            <input
              name="refRange"
              value={r.refRange}
              onChange={(e) => update(r.key, { refRange: e.target.value })}
              className={base.input}
              maxLength={40}
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
        Add Row
      </button>

      <button type="submit" className={base.primary} disabled={pending}>
        {pending ? "Saving…" : "Save Panel"}
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
