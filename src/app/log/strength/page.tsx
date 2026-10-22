import Link from "next/link";
import { Page } from "@/components/ui/ui";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SubmitButton } from "@/components/submit-button";
import { TabBar } from "@/components/tab-bar";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { localDate } from "@/lib/log/dates";
import { recentSessions } from "@/lib/log/strength";
import { shortDate } from "@/lib/log/strength-view";
import { startWorkout } from "./actions";
import styles from "./strength.module.css";

/** Static shell; the session list streams in. */
export default function StrengthPage() {
  return (
    <>
      <Page>
        <header className={styles.header}>
          <Link href="/log" className={styles.back}>
            ‹ Log
          </Link>
          <h1 className={styles.title}>Strength</h1>
        </header>
        <Suspense fallback={<p className={styles.sub}>Loading…</p>}>
          <Sessions />
        </Suspense>
      </Page>
      <TabBar active="log" />
    </>
  );
}

async function Sessions() {
  if (!(await requireSession())) redirect("/login");
  const sessions = await recentSessions(getDb(), 10);
  const today = localDate(new Date(), getEnv().OWNER_TZ);
  const resumable = sessions.some((s) => !s.finished && s.localDate === today);

  return (
    <>
      <form action={startWorkout} className={styles.startForm}>
        <SubmitButton className={styles.primary} pendingLabel="Starting…">
          {resumable ? "Resume today's workout" : "Start Workout"}
        </SubmitButton>
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
