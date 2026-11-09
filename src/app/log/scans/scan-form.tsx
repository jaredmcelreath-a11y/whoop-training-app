"use client";

import { useActionState } from "react";
import { keepInputOnSubmit } from "@/components/keep-input";
import cardio from "../cardio/cardio.module.css";
import { DETAIL_FIELDS, SEGMENT_GROUPS, SEGMENTS } from "@/lib/log/scan-extras";
import { logScan, type RecordState } from "../records-actions";
import records from "../records.module.css";
import base from "../strength/strength.module.css";

const FIELDS: { name: string; label: string; step?: string }[] = [
  { name: "weightLb", label: "Weight (lb)" },
  { name: "leanMassLb", label: "Lean mass (lb)" },
  { name: "skeletalMuscleLb", label: "Skeletal muscle (lb)" },
  { name: "fatMassLb", label: "Fat mass (lb)" },
  { name: "bodyFatPct", label: "Body fat (%)" },
  { name: "bmrKcal", label: "BMR (kcal)" },
  { name: "teeKcal", label: "TEE (kcal)" },
  { name: "visceralFatLevel", label: "Visceral fat level" },
];

export function ScanForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState<RecordState, FormData>(
    logScan,
    {},
  );
  return (
    <form
      key={state.savedAt ?? 0}
      action={action}
      onSubmit={keepInputOnSubmit(action)}
      className={cardio.form}
    >
      <label className={cardio.field}>
        <span className={cardio.label}>Date</span>
        <input
          type="date"
          name="scannedOn"
          defaultValue={today}
          required
          className={base.input}
        />
      </label>
      <div className={records.grid}>
        {FIELDS.map((f) => (
          <NumberField key={f.name} name={f.name} label={f.label} />
        ))}
      </div>
      <details className={records.details}>
        <summary className={records.detailsSummary}>Scan details (optional)</summary>
        {SEGMENT_GROUPS.map((g) => (
          <fieldset key={g.key} className={records.fieldset}>
            <legend className={cardio.label}>{g.label}</legend>
            <div className={records.grid}>
              {SEGMENTS.map((seg) => (
                <NumberField key={seg.key} name={`${g.key}.${seg.key}`} label={seg.label} />
              ))}
            </div>
          </fieldset>
        ))}
        <div className={records.grid}>
          {DETAIL_FIELDS.map((f) => (
            <NumberField key={f.key} name={f.key} label={f.label} />
          ))}
        </div>
      </details>
      <p className={records.hint}>
        Saving on a date that already has a scan fills in that scan; blank fields keep what it has.
      </p>
      <label className={cardio.field}>
        <span className={cardio.label}>Source (optional)</span>
        <input
          name="source"
          maxLength={100}
          placeholder="manual"
          className={base.input}
        />
      </label>
      <button type="submit" className={base.primary} disabled={pending}>
        {pending ? "Saving…" : "Save Scan"}
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

function NumberField({ name, label }: { name: string; label: string }) {
  return (
    <label className={cardio.field}>
      <span className={cardio.label}>{label}</span>
      <input name={name} inputMode="decimal" autoComplete="off" className={base.input} />
    </label>
  );
}

export function DeleteButton({ label }: { label: string }) {
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
