import Link from "next/link";
import { AppPage } from "@/components/ui/app-page";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SubmitButton } from "@/components/submit-button";
import { TabBar } from "@/components/tab-bar";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { localDate } from "@/lib/log/dates";
import { recentSessions } from "@/lib/log/strength";
import { todayLifts, yesterdayLifts } from "@/lib/plan/service";
import { shortDate } from "@/lib/log/strength-view";
import { startWorkout } from "./actions";
import styles from "./strength.module.css";

/** Static shell; the session list streams in. */
export default function StrengthPage() {
  return (
    <>
      <AppPage>
        <header className={styles.header}>
          <Link href="/log" className={styles.back}>
            ‹ Log
          </Link>
          <h1 className={styles.title}>Strength</h1>
        </header>
        <Suspense fallback={<p className={styles.sub}>Loading…</p>}>
          <Sessions />
        </Suspense>
      </AppPage>
      <TabBar active="log" />
    </>
  );
}

async function Sessions() {
  if (!(await requireSession())) redirect("/login");
  const sessions = await recentSessions(getDb(), 10);
  const today = localDate(new Date(), getEnv().OWNER_TZ);
  const resumable = sessions.some((s) => !s.finished && s.localDate === today);
  const lifts = resumable ? [] : await todayLifts(getDb(), new Date(), getEnv().OWNER_TZ);
  const late = resumable ? [] : await yesterdayLifts(getDb(), new Date(), getEnv().OWNER_TZ);
  const choices = [
    ...late.map((l) => ({ id: l.id, label: `Log ${l.title} From ${shortDate(l.date)}` })),
    ...lifts.map((l) => ({ id: l.id, label: `${l.checked ? "Log" : "Start"} ${l.title}` })),
  ];

  return (
    <>
      <form action={startWorkout} className={styles.startForm}>
        {resumable ? (
          <SubmitButton className={styles.primary} pendingLabel="Starting…">
            Resume Today's Workout
          </SubmitButton>
        ) : (
          <>
            {choices.map((c, i) => (
              <SubmitButton
                key={c.id}
                name="plan"
                value={c.id}
                className={i === 0 ? styles.primary : styles.choice}
              >
                {c.label}
              </SubmitButton>
            ))}
            <SubmitButton className={choices.length ? styles.choice : styles.primary}>
              {choices.length ? "Start Empty Workout" : "Start Workout"}
            </SubmitButton>
          </>
        )}
      </form>
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Recent</h2>
        {sessions.length ? (
          <ul className={styles.recent}>
            {sessions.map((s) => (
              <li key={s.id}>
                <Link href={`/log/strength/${s.id}`} className={styles.recentLink}>
                  <span className={styles.recentDate}>{shortDate(s.localDate)}</span>
                  <span className={styles.sub}>
                    {s.exerciseCount} exercises · {s.setCount} sets
                    {s.finished ? "" : " · in progress"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.sub}>No workouts yet.</p>
        )}
      </section>
    </>
  );
}
