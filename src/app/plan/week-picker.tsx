"use client";

import { useRouter } from "next/navigation";
import { weekFromDate } from "@/lib/log/dates";
import styles from "./plan.module.css";

/**
 * The week's date range as a tap target: a transparent native date input sits over it, so a
 * tap opens the phone's calendar. Picking any day jumps to that day's week.
 */
export function WeekPicker({ weekStart, label }: { weekStart: string; label: string }) {
  const router = useRouter();
  return (
    <label className={styles.weekPick}>
      <span className={styles.weekRange}>{label}</span>
      <input
        type="date"
        className={styles.weekPickInput}
        defaultValue={weekStart}
        aria-label="Pick a week"
        // Desktop browsers only open the calendar from its icon; open it on any click.
        onClick={(e) => e.currentTarget.showPicker?.()}
        onChange={(e) => {
          const ws = weekFromDate(e.target.value);
          if (ws) router.push(`/plan?week=${ws}`);
        }}
      />
    </label>
  );
}
