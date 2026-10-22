"use client";

import { useActionState, useState } from "react";
import { keepInputOnSubmit } from "@/components/keep-input";
import { SubmitButton } from "@/components/submit-button";
import { MAX_MEALS, MAX_SUPPLEMENT_ROWS, MIN_MEALS, REF_PROFILES, TIMINGS } from "@/lib/nutrition/form";
import type { NutritionSettings } from "@/lib/nutrition/settings";
import { saveNutritionSettings, type NutritionSettingsState } from "./actions";
import styles from "./nutrition.module.css";

const WATER_OPTIONS: { value: NutritionSettings["waterSource"]; label: string; text: string }[] = [
  {
    value: "app",
    label: "Count water from this app",
    text: "Use the +16 oz taps here. Water Cronometer writes to Apple Health is ignored.",
  },
  {
    value: "cronometer",
    label: "Count water from Cronometer",
    text: "Use the water you log in Cronometer. Taps in this app are ignored.",
  },
  {
    value: "both",
    label: "Count both",
    text: "Adds the two together. Only choose this if you log different drinks in each; logging the same drink in both counts it twice.",
  },
];

let nextRowId = 0;
type Row = { id: number; name: string; timing: NutritionSettings["supplements"][number]["timing"] };

export function NutritionSettingsForm({ settings }: { settings: NutritionSettings }) {
  const [state, action, pending] = useActionState<NutritionSettingsState, FormData>(saveNutritionSettings, {});
  return (
    <FormBody key={state.savedAt ?? 0} settings={settings} state={state} pending={pending} action={action} />
  );
}

function FormBody({
  settings,
  state,
  pending,
  action,
}: {
  settings: NutritionSettings;
  state: NutritionSettingsState;
  pending: boolean;
  action: (fd: FormData) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    settings.supplements.map((s) => ({ id: nextRowId++, name: s.name, timing: s.timing })),
  );
  const update = (id: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <form action={action} onSubmit={keepInputOnSubmit(action)} className={styles.form}>
      <section className={styles.card}>
        <label className={styles.field}>
          <span className={styles.cardTitle}>Reference-Intake Profile</span>
          <select name="refProfile" defaultValue={settings.refProfile ?? ""} className={styles.select}>
            <option value="">Not set (no micronutrient targets)</option>
            {REF_PROFILES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <p className={styles.text}>
          This only picks which published reference intakes (Dietary Reference Intakes) the micronutrient targets are
          taken from. It is a lookup, not a statement about you.
        </p>
      </section>

      <section className={styles.card}>
        <label className={styles.field}>
          <span className={styles.cardTitle}>Meals Per Day</span>
          <input
            type="number"
            name="mealsPerDay"
            inputMode="numeric"
            min={MIN_MEALS}
            max={MAX_MEALS}
            step={1}
            required
            defaultValue={settings.mealsPerDay}
            className={styles.input}
          />
        </label>
        <p className={styles.text}>Between {MIN_MEALS} and {MAX_MEALS}. Used to spread protein and carbohydrate across the day.</p>
      </section>

      <fieldset className={styles.card}>
        <legend className={styles.cardTitle}>Water Source</legend>
        <p className={styles.text}>
          If you log water in Cronometer and also tap the +16 oz button here, the same drink would be counted twice.
          Pick one source to avoid that.
        </p>
        {WATER_OPTIONS.map((o) => (
          <label key={o.value} className={styles.radio}>
            <input type="radio" name="waterSource" value={o.value} defaultChecked={settings.waterSource === o.value} />
            <span className={styles.radioLabel}>{o.label}</span>
            <span className={styles.radioText}>{o.text}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className={styles.card}>
        <legend className={styles.cardTitle}>Supplements</legend>
        <p className={styles.text}>Names and timing only. The app never suggests a dose.</p>
        {rows.map((r, i) => (
          <div key={r.id} className={styles.suppRow}>
            <input
              type="text"
              name="supplementName"
              aria-label={`Supplement ${i + 1} name`}
              placeholder="Name"
              maxLength={60}
              value={r.name}
              onChange={(e) => update(r.id, { name: e.target.value })}
              className={styles.input}
            />
            <select
              name="supplementTiming"
              aria-label={`Supplement ${i + 1} timing`}
              value={r.timing}
              onChange={(e) => update(r.id, { timing: e.target.value as Row["timing"] })}
              className={styles.select}
            >
              {TIMINGS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.iconBtn}
              aria-label={`Remove supplement ${i + 1}`}
              onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className={styles.secondary}
          disabled={rows.length >= MAX_SUPPLEMENT_ROWS}
          onClick={() => setRows((rs) => [...rs, { id: nextRowId++, name: "", timing: "morning" }])}
        >
          Add Row
        </button>
        {rows.length >= MAX_SUPPLEMENT_ROWS ? <p className={styles.text}>Up to {MAX_SUPPLEMENT_ROWS} rows.</p> : null}
      </fieldset>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Gain Goal</h2>
        <label className={styles.field}>
          <span className={styles.label}>Goal (lb to Gain)</span>
          <input
            type="text"
            name="gainGoalLb"
            inputMode="decimal"
            required
            defaultValue={String(settings.gainGoalLb)}
            className={styles.input}
          />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Start Weight (lb, Optional)</span>
          <input
            type="text"
            name="gainStartWeightLb"
            inputMode="decimal"
            placeholder="Leave blank to use your first logged weight"
            defaultValue={settings.gainStartWeightLb === null ? "" : String(settings.gainStartWeightLb)}
            className={styles.input}
          />
        </label>
      </section>

      <SubmitButton className={styles.primary} pendingLabel="Saving…">
        Save
      </SubmitButton>
      {!pending && state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      {!pending && state.ok ? (
        <p className={styles.saved} role="status">
          Saved
        </p>
      ) : null}
    </form>
  );
}
