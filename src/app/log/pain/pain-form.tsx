"use client";

import { useActionState, useState } from "react";
import { keepInputOnSubmit } from "@/components/keep-input";
import { PAIN_AREAS } from "@/lib/log/validate";
import styles from "../cardio/cardio.module.css";
import base from "../strength/strength.module.css";
import { logPain, type PainState } from "./actions";

/** One submit for every area; only areas with "log" ticked are written. */
export function PainForm({ trends }: { trends: Record<string, string> }) {
  const [state, action, pending] = useActionState<PainState, FormData>(logPain, {});
  return (
    <form
      key={state.savedAt ?? 0}
      action={action}
      onSubmit={keepInputOnSubmit(action)}
      className={styles.form}
    >
      {PAIN_AREAS.map((area) => (
        // Remounts after each save so ticks and sliders reset.
        <AreaRow key={`${area}-${state.savedAt ?? 0}`} area={area} trend={trends[area]} />
      ))}
      <label className={styles.field}>
        <span className={styles.label}>Context</span>
        <select name="context" defaultValue="daily" className={base.select}>
          <option value="daily">daily</option>
          <option value="before_run">before run</option>
          <option value="after_run">after run</option>
        </select>
      </label>
      <button type="submit" className={base.primary} disabled={pending}>
        {pending ? "Saving…" : "Log pain"}
      </button>
      {!pending && state.error ? (
        <p className={base.error} role="alert">
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

function AreaRow({ area, trend }: { area: string; trend: string }) {
  const [score, setScore] = useState(0);
  const [log, setLog] = useState(false);
  return (
    <div className={styles.painArea}>
      <div className={styles.painHead}>
        <span className={styles.areaName}>{area}</span>
        <label className={styles.check}>
          <input
            type="checkbox"
            name={`log_${area}`}
            checked={log}
            onChange={(e) => setLog(e.target.checked)}
          />
          log
        </label>
      </div>
      <label className={styles.slider}>
        <span className={base.srOnly}>{area} score, 0 to 10</span>
        <input
          type="range"
          name={`score_${area}`}
          min={0}
          max={10}
          step={1}
          value={score}
          onChange={(e) => {
            setScore(Number(e.target.value));
            setLog(true);
          }}
        />
        <output className={styles.sliderValue}>{score}</output>
      </label>
      <label className={styles.field}>
        <span className={base.srOnly}>{area} side</span>
        <select name={`side_${area}`} defaultValue="both" className={base.select}>
          <option value="both">both</option>
          <option value="left">left</option>
          <option value="right">right</option>
        </select>
      </label>
      <p className={styles.trend}>
        <span className={styles.label}>14 days: </span>
        {trend}
      </p>
    </div>
  );
}
