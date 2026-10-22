import { redirect } from "next/navigation";
import { Suspense } from "react";
import { TabBar } from "@/components/tab-bar";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { getWeekly } from "@/lib/log/body";
import { localDate } from "@/lib/log/dates";
import { WeeklyForm, WeightForm } from "./forms";
import styles from "./log.module.css";

// Sections that later tasks add; each shows up here once its route exists.
const SECTIONS: { href: string; label: string }[] = [
  { href: "/log/strength", label: "Strength" },
  { href: "/log/cardio", label: "Cardio" },
  { href: "/log/pain", label: "Pain" },
  { href: "/log/scans", label: "Scans" },
  { href: "/log/labs", label: "Labs" },
  { href: "/log/sweat", label: "Sweat test" },
];

/** The page shell is static; everything that reads the session or the DB streams in. */
export default function LogPage() {
  return (
    <>
      <main className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Log</h1>
        </header>
        <Suspense fallback={<p className={styles.sub}>Loading…</p>}>
          <LogContent />
        </Suspense>
      </main>
      <TabBar active="log" />
    </>
  );
}

async function LogContent() {
  if (!(await requireSession())) redirect("/login");
  const week = await getWeekly(getDb(), localDate(new Date(), getEnv().OWNER_TZ));

  return (
    <>
      <section id="weight" className={styles.card}>
        <h2 className={styles.cardTitle}>Weight</h2>
        <WeightForm />
      </section>
      <section id="weekly" className={styles.card}>
        <h2 className={styles.cardTitle}>This week</h2>
        <WeeklyForm vo2max={week?.vo2max ?? null} whoopAge={week?.whoopAge ?? null} />
      </section>
      {SECTIONS.length ? (
        <nav className={styles.sections} aria-label="Log sections">
          {SECTIONS.map((s) => (
            <a key={s.href} href={s.href} className={styles.sectionLink}>
              {s.label}
            </a>
          ))}
        </nav>
      ) : null}
    </>
  );
}
