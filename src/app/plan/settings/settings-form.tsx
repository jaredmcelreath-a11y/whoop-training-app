"use client";

import { useActionState } from "react";
import { keepInputOnSubmit } from "@/components/keep-input";
import { SubmitButton } from "@/components/submit-button";
import { fromMeters } from "@/lib/log/units";
import type { PlanSettings } from "@/lib/plan/settings";
import { JOINT_OPTIONS, WEEKDAYS } from "@/lib/plan/view";
import styles from "../plan.module.css";
import { savePlanSettings, type PlanSettingsState } from "./actions";

/** A stored length within this many yards of a whole number is shown in yards. */
const WHOLE_YD_TOLERANCE = 0.01;

function poolDisplay(m: number): { value: string; unit: "yd" | "m" } {
  const yd = fromMeters(m, "yd");
  if (Math.abs(yd - Math.round(yd)) < WHOLE_YD_TOLERANCE) return { value: String(Math.round(yd)), unit: "yd" };
  return { value: String(Number(m.toFixed(2))), unit: "m" };
}

export function PlanSettingsForm({ settings }: { settings: PlanSettings }) {
  const [state, action, pending] = useActionState<PlanSettingsState, FormData>(savePlanSettings, {});
  const pool = poolDisplay(settings.poolLengthM);
  const [w1, w2] = settings.windows;

  return (
    <form key={state.savedAt ?? 0} action={action} onSubmit={keepInputOnSubmit(action)} className={styles.form}>
      <label className={styles.field}>
        <span className={styles.label}>Race Date</span>
        <input type="date" name="raceDate" required defaultValue={settings.raceDate} className={styles.input} />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Wake Time</span>
        <input type="time" name="wakeTime" defaultValue={settings.wakeTime ?? ""} className={styles.input} />
        <span className={styles.disclaimer}>Sets the start of your Day timeline. Leave blank to use 45 min before your first window.</span>
      </label>

      <fieldset className={styles.field}>
        <legend className={styles.label}>Training Window 1</legend>
        <div className={styles.row}>
          <input type="time" name="w1Start" aria-label="Window 1 start" defaultValue={w1?.start ?? ""} className={styles.input} />
          <input type="time" name="w1End" aria-label="Window 1 end" defaultValue={w1?.end ?? ""} className={styles.input} />
        </div>
      </fieldset>
      <fieldset className={styles.field}>
        <legend className={styles.label}>Training Window 2 (Optional)</legend>
        <p className={styles.disclaimer}>Leave blank for none.</p>
        <div className={styles.row}>
          <input type="time" name="w2Start" aria-label="Window 2 start" defaultValue={w2?.start ?? ""} className={styles.input} />
          <input type="time" name="w2End" aria-label="Window 2 end" defaultValue={w2?.end ?? ""} className={styles.input} />
        </div>
      </fieldset>

      <DaySelect name="longRideDow" label="Long ride day" value={settings.longRideDow} />
      <DaySelect name="longRunDow" label="Long run / swim day" value={settings.longRunDow} />
      <DaySelect name="restDow" label="Rest day" value={settings.restDow} />

      <fieldset className={styles.field}>
        <legend className={styles.label}>Joint Status</legend>
        {JOINT_OPTIONS.map((o) => (
          <label key={o.value} className={styles.radio}>
            <input type="radio" name="jointStatus" value={o.value} defaultChecked={settings.jointStatus === o.value} />
            <span className={styles.radioLabel}>{o.label}</span>
            <span className={styles.radioText}>{o.text}</span>
          </label>
        ))}
        <p className={styles.disclaimer}>Not medical advice — follow your doctor&apos;s guidance.</p>
      </fieldset>

      <fieldset className={styles.field}>
        <legend className={styles.label}>Pool Length</legend>
        <div className={styles.row}>
          <input
            type="text"
            inputMode="decimal"
            name="poolLength"
            aria-label="Pool length"
            required
            defaultValue={pool.value}
            className={styles.input}
          />
          <select name="poolUnit" aria-label="Pool length unit" defaultValue={pool.unit} className={styles.select}>
            <option value="yd">yards</option>
            <option value="m">meters</option>
          </select>
        </div>
      </fieldset>

      <SubmitButton className={styles.primary} pendingLabel="Saving and re-planning…">
        Save and re-plan
      </SubmitButton>
      {!pending && state.error ? (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      ) : null}
      {!pending && state.ok ? (
        <p className={styles.saved} role="status">
          Future weeks re-planned
        </p>
      ) : null}
    </form>
  );
}

function DaySelect({ name, label, value }: { name: string; label: string; value: number }) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <select name={name} defaultValue={String(value)} className={styles.select}>
        {WEEKDAYS.map((d, i) => (
          <option key={d} value={i}>
            {d}
          </option>
        ))}
      </select>
    </label>
  );
}
