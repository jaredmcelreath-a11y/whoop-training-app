import Link from "next/link";
import { ICON_FOR_KIND, Icon } from "@/components/icon";
import { Cap, Card } from "@/components/ui/ui";
import { titleCase } from "@/lib/ui/title-case";
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
      <Card hot>
        <Cap>Today&apos;s Session</Cap>
        <p className={styles.small}>Couldn&apos;t load today&apos;s plan</p>
      </Card>
    );
  }

  return (
    <Card hot>
      <Cap>{sessions.length > 1 ? "Today's Sessions" : "Today's Session"}</Cap>
      {sessions.length === 0 ? (
        <p className={styles.small}>
          Nothing planned today. <Link href="/plan" className={styles.whyLink}>Open the plan</Link> or{" "}
          <Link href="/plan/settings" className={styles.whyLink}>set up your plan</Link>.
        </p>
      ) : (
        sessions.map((s) => <SessionRow key={s.id} s={s} />)
      )}
    </Card>
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
          <Icon name={ICON_FOR_KIND[s.kind]} size={18} className={styles.kindIcon} />
          {titleCase(s.title)}
          {done ? <Icon name="check" label="Done" className={styles.doneIcon} /> : null}
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
