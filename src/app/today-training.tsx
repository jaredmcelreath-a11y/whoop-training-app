import Link from "next/link";
import { ChangeDot, ChangeView } from "@/components/change-view";
import { CheckButton } from "@/components/check-button";
import { ICON_FOR_KIND, Icon } from "@/components/icon";
import { Cap, Card } from "@/components/ui/ui";
import { titleCase } from "@/lib/ui/title-case";
import type { Db } from "@/db/client";
import { weekStart } from "@/lib/log/dates";
import { loggedChanges, type DaySession } from "@/lib/plan/service";
import { canUncheck, changeFor, logLinkFor, reasonView, type ChangeView as Change, sessionNotes, splitDay } from "@/lib/plan/today-view";
import { sessionMetaLabel } from "@/lib/plan/view";
import { trainingCardView } from "@/lib/nutrition/fuel-view";
import styles from "./today.module.css";
import { WhySheet } from "./why-sheet";

/**
 * "Today's training": finished sessions as one-line rows, then the session to do now in full
 * (why it changed, where to log it, a check to mark it done), then what follows.
 */
export async function TodayTraining({
  db,
  date,
  sessions,
  past,
}: {
  db: Db;
  date: string;
  /** The day's sessions, loaded by the page (adapted today, stored on a past day); null if that failed. */
  sessions: DaySession[] | null;
  past: boolean;
}) {
  const cap = (n: number) => (past ? (n > 1 ? "Sessions" : "Session") : n > 1 ? "Today's Sessions" : "Today's Session");
  let logged: Awaited<ReturnType<typeof loggedChanges>> | null = null;
  try {
    // A past day's changes come from what was logged that day (read only).
    if (past) logged = await loggedChanges(db, date);
  } catch (err) {
    console.error("loggedChanges failed:", err);
  }
  if (sessions === null) {
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

  const { done, current, later } = splitDay(sessions);
  const change = (s: DaySession) => changeFor(s, logged?.get(s.id));
  return (
    <Card hot>
      <Cap>{cap(done.length + later.length + (current ? 1 : 0))}</Cap>
      {done.map((s) => (
        <ShortRow key={s.id} s={s} past={past} change={change(s)} note={s.completedRef !== null ? "Done · Logged" : "Done"} />
      ))}
      {current ? (
        <SessionRow s={current} past={past} change={change(current)} />
      ) : (
        <p className={styles.allDone}>{past ? "All Done" : "All Done for Today"}</p>
      )}
      {later.map((s) => (
        <ShortRow key={s.id} s={s} past={past} change={change(s)} note="Up Next" />
      ))}
    </Card>
  );
}

/**
 * One line: check, title, and a note ("Done", "Up Next"). When the plan changed it, or it can
 * still be logged, tapping the title opens that.
 */
function ShortRow({ s, note, change, past }: { s: DaySession; note: string; change: Change | null; past: boolean }) {
  const done = s.status === "done" || s.completedRef !== null;
  const link = past ? null : logLinkFor(s);
  const title = (
    <span className={styles.shortTitle}>
      <Icon name={ICON_FOR_KIND[s.kind]} size={16} className={styles.kindIcon} />
      {titleCase(s.title)}
    </span>
  );
  return (
    <div className={styles.shortRow}>
      {change ? <ChangeDot /> : null}
      <CheckButton sessionId={s.id} done={done} locked={done && !canUncheck(s)} />
      {change || link ? (
        <details className={styles.shortMore}>
          <summary className={styles.shortSummary}>
            {title}
            <span className={styles.shortNote}>{note}</span>
          </summary>
          {change ? <ChangeView {...change} /> : null}
          {link ? (
            <Link href={link.href} className={styles.logLink}>
              {link.label}
            </Link>
          ) : null}
        </details>
      ) : (
        <>
          {title}
          <span className={styles.shortNote}>{note}</span>
        </>
      )}
    </div>
  );
}

function SessionRow({ s, past, change }: { s: DaySession; past: boolean; change: Change | null }) {
  const done = s.status === "done" || s.completedRef !== null;
  const rest = s.kind === "rest";
  const link = logLinkFor(s);
  const v = reasonView(s.adjusted, s.reasons);
  const notes = sessionNotes(s.details);
  return (
    <div className={styles.session}>
      {change ? <ChangeDot /> : null}
      <div className={styles.sessionHeadRow}>
        <div className={styles.sessionHead}>
          <p className={styles.sessionTitle}>
            <Icon name={ICON_FOR_KIND[s.kind]} size={18} className={styles.kindIcon} />
            {titleCase(s.title)}
          </p>
          {rest ? null : (
            <p className={styles.small}>
              {[`${s.durationMin} min`, sessionMetaLabel(s.kind, s.intensity)].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        {rest ? null : <CheckButton sessionId={s.id} done={done} locked={done && !canUncheck(s)} />}
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
      {link && !past ? (
        <Link href={link.href} className={styles.logLink}>
          {link.label}
        </Link>
      ) : null}
      {change ? (
        <details className={styles.changed}>
          <summary className={styles.changedSummary}>What Changed</summary>
          <ChangeView {...change} />
        </details>
      ) : null}
      <WhySheet entries={v.sheet} />
    </div>
  );
}
