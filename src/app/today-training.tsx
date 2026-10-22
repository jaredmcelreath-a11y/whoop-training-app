import Link from "next/link";
import { ICON_FOR_KIND, Icon } from "@/components/icon";
import { Cap, Card } from "@/components/ui/ui";
import { titleCase } from "@/lib/ui/title-case";
import type { Db } from "@/db/client";
import { weekStart } from "@/lib/log/dates";
import { getDayPlan, storedDaySessions, type DaySession } from "@/lib/plan/service";
import { reasonView, sessionLogLink, sessionNotes } from "@/lib/plan/today-view";
import { INTENSITY_LABEL } from "@/lib/plan/view";
import { trainingCardView } from "@/lib/nutrition/fuel-view";
import styles from "./today.module.css";
import { WhySheet } from "./why-sheet";

/** "Today's training": the day's adapted sessions, why they changed, and where to log them. */
export async function TodayTraining({
  db,
  date,
  now,
  tz,
  past,
}: {
  db: Db;
  date: string;
  now: Date;
  tz: string;
  past: boolean;
}) {
  const cap = (n: number) => (past ? (n > 1 ? "Sessions" : "Session") : n > 1 ? "Today's Sessions" : "Today's Session");
  let sessions: DaySession[];
  try {
    // A past day shows its stored rows only: getDayPlan would mark, generate and log.
    sessions = past ? await storedDaySessions(db, date) : (await getDayPlan(db, date, now, tz)).sessions;
  } catch (err) {
    console.error("getDayPlan failed:", err);
    return (
      <Card hot>
        <Cap>{cap(1)}</Cap>
        <p className={styles.small}>Couldn&apos;t load {past ? "this day's" : "today's"} plan</p>
      </Card>
    );
  }

  if (trainingCardView(sessions).kind === "rest") {
    return (
      <Card hot href={past ? `/plan?week=${weekStart(date)}` : "/plan"}>
        <Cap>{cap(1)}</Cap>
        <p className={styles.restDay}>
          <Icon name="rest" size={22} className={styles.kindIcon} />
          Rest Day
        </p>
      </Card>
    );
  }

  return (
    <Card hot>
      <Cap>{cap(sessions.length)}</Cap>
      {sessions.map((s) => (
        <SessionRow key={s.id} s={s} past={past} />
      ))}
    </Card>
  );
}

function SessionRow({ s, past }: { s: DaySession; past: boolean }) {
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
      {link && !done && !past ? (
        <Link href={link.href} className={styles.logLink}>
          {link.label}
        </Link>
      ) : null}
      <WhySheet entries={v.sheet} />
    </div>
  );
}
