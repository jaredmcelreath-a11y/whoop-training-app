"use client";

import { useActionState } from "react";
import { keepInputOnSubmit } from "@/components/keep-input";
import { SubmitButton } from "@/components/submit-button";
import type { PlanSettings } from "@/lib/plan/settings";
import { formatClock, JOINT_OPTIONS, poolDisplay, WEEKDAYS } from "@/lib/plan/view";
import styles from "../plan.module.css";
import { savePlanSettings, type PlanSettingsState } from "./actions";

export function PlanSettingsForm({ settings }: { settings: PlanSettings }) {
  const [state, action, pending] = useActionState<PlanSettingsState, FormData>(savePlanSettings, {});
  const pool = poolDisplay(settings.poolLengthM, settings.poolUnit);
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
      <DaySelect name="longRunDow" label="Long run day" value={settings.longRunDow} />
      <DaySelect name="restDow" label="Rest day" value={settings.restDow} />
      <DaySelect name="secondRestDow" label="Second rest day" value={settings.secondRestDow} none="None" />

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
            <option value="yd">Yards</option>
            <option value="m">Meters</option>
            <option value="ft">Feet</option>
          </select>
        </div>
      </fieldset>

      <label className={styles.field}>
        <span className={styles.label}>Pain Side</span>
        <select name="painSide" defaultValue={settings.painSide ?? ""} className={styles.select}>
          <option value="">Not Set (Ask Each Time)</option>
          <option value="left">Left</option>
          <option value="right">Right</option>
          <option value="both">Both</option>
        </select>
        <span className={styles.disclaimer}>When set, the pain log skips the side picker.</span>
      </label>

      <fieldset className={styles.field}>
        <legend className={styles.label}>Pain Monitoring</legend>
        <label className={styles.checkRow}>
          <input type="checkbox" name="painMonitoring" defaultChecked={settings.painMonitoring} />
          <span>Adjust Runs for Pain</span>
        </label>
        <p className={styles.disclaimer}>
          On: pain above 3/10 swaps runs for easy rides until it settles. Off: pain you log is kept but changes nothing, and runs skip the pain question.
        </p>
      </fieldset>

      <fieldset className={styles.field}>
        <legend className={styles.label}>Race Projection</legend>
        <label className={styles.field}>
          <span className={styles.label}>Starting Swim Pace (per 100 yd)</span>
          <input name="startSwim" placeholder="2:00" autoComplete="off" defaultValue={formatClock(settings.startSwimSecPer100Yd, "pace")} className={styles.input} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Starting Long-Run Pace (per mile)</span>
          <input name="startRun" placeholder="11:00" autoComplete="off" defaultValue={formatClock(settings.startRunSecPerMi, "pace")} className={styles.input} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Starting Bike Speed (mph)</span>
          <input name="startBike" inputMode="decimal" placeholder="16" autoComplete="off" defaultValue={settings.startBikeMph ?? ""} className={styles.input} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Race Goal (h:mm)</span>
          <input name="goal" placeholder="6:00" autoComplete="off" defaultValue={formatClock(settings.goalSec, "goal")} className={styles.input} />
        </label>
        <span className={styles.disclaimer}>
          Used until each leg has enough logged workouts. Leave a pace blank to use a first-timer estimate.
        </span>
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

/** `none` adds an empty first option, for a day that can be left unset. */
function DaySelect({ name, label, value, none }: { name: string; label: string; value: number | null; none?: string }) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <select name={name} defaultValue={value === null ? "" : String(value)} className={styles.select}>
        {none ? <option value="">{none}</option> : null}
        {WEEKDAYS.map((d, i) => (
          <option key={d} value={i}>
            {d}
          </option>
        ))}
      </select>
    </label>
  );
}
