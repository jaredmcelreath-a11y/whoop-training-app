import Link from "next/link";
import type { Db } from "@/db/client";
import { getDayPlan, type DaySession } from "@/lib/plan/service";
import { reasonView, sessionLogLink, sessionNotes } from "@/lib/plan/today-view";
import { INTENSITY_LABEL } from "@/lib/plan/view";
import { localDate } from "@/lib/log/dates";
import styles from "./today.module.css";
import { WhySheet } from "./why-sheet";

/** "Today's training": the day's adapted sessions, why they changed, and where to log them. */
export async function TodayTraining({ db, now, tz }: { db: Db; now: Date; tz: string }) {
  let sessions: DaySession[];
  try {
    sessions = (await getDayPlan(db, localDate(now, tz), now, tz)).sessions;
  } catch (err) {
    console.error("getDayPlan failed:", err);
    return (
      <section className={styles.training}>
        <h2 className={styles.tileLabel}>Today&apos;s training</h2>
        <p className={styles.small}>Couldn&apos;t load today&apos;s plan</p>
      </section>
    );
  }

  return (
    <section className={styles.training} aria-label="Today's training">
      <h2 className={styles.tileLabel}>Today&apos;s training</h2>
      {sessions.length === 0 ? (
        <p className={styles.small}>
          Nothing planned today. <Link href="/plan" className={styles.whyLink}>Open the plan</Link> or{" "}
          <Link href="/plan/settings" className={styles.whyLink}>set up your plan</Link>.
        </p>
      ) : (
        sessions.map((s) => <SessionRow key={s.id} s={s} />)
      )}
    </section>
  );
}

function SessionRow({ s }: { s: DaySession }) {
  const done = s.status === "done" || s.completedRef !== null;
  const rest = s.kind === "rest";
  const link = sessionLogLink(s.kind);
  const v = reasonView(s.adjusted, s.reasons);
  const notes = sessionNotes(s.details);
  return (
    <div className={styles.session}>
      <div className={styles.sessionHead}>
        <p className={styles.sessionTitle}>
          {done ? <span className={styles.green} aria-label="Done">✓ </span> : null}
          {s.title}
        </p>
        {rest ? null : (
          <p className={styles.small}>
            {s.durationMin} min · {INTENSITY_LABEL[s.intensity] ?? s.intensity}
          </p>
        )}
      </div>
      {v.badge ? (
        <p className={styles.adjusted}>
          <span className={styles.adjBadge}>Adjusted</span> {v.badge.text}
        </p>
      ) : v.subtle ? (
        <p className={styles.small}>{v.subtle.text}</p>
      ) : null}
      {v.lines.map((r, i) => (
        <p key={`${r.ruleId}-${i}`} className={styles.adjusted}>
          {r.text}
        </p>
      ))}
      {notes.map((n, i) => (
        <p key={`${i}-${n}`} className={styles.small}>
          {n}
        </p>
      ))}
      {link && !done ? (
        <Link href={link.href} className={styles.logLink}>
          {link.label}
        </Link>
      ) : null}
      <WhySheet entries={v.sheet} />
    </div>
  );
}
