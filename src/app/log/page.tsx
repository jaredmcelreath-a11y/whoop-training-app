import { redirect } from "next/navigation";
import { Suspense } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";
import { TabBar } from "@/components/tab-bar";
import { Cap, Card } from "@/components/ui/ui";
import { AppPage } from "@/components/ui/app-page";
import { getLogHub, pickTodayLift } from "@/lib/log/hub";
import { getDayPlan } from "@/lib/plan/service";
import { titleCase } from "@/lib/ui/title-case";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { getWeekly } from "@/lib/log/body";
import { localDate } from "@/lib/log/dates";
import { WeeklyForm, WeightForm } from "./forms";
import styles from "./log.module.css";

const SECTIONS: { href: string; label: string; icon: IconName }[] = [
  { href: "/log/strength", label: "Strength", icon: "lift" },
  { href: "/log/cardio", label: "Swim / Bike / Run", icon: "bike" },
  { href: "/log/pain", label: "Pain Check", icon: "alert" },
  { href: "/log/sweat", label: "Sweat Test", icon: "drop" },
  { href: "/log/scans", label: "Scans", icon: "scale" },
  { href: "/log/labs", label: "Labs", icon: "chart" },
];

/** The page shell is static; everything that reads the session or the DB streams in. */
export default function LogPage() {
  return (
    <>
      <AppPage title="Log">
        <Suspense fallback={<p className={styles.sub}>Loading…</p>}>
          <LogContent />
        </Suspense>
      </AppPage>
      <TabBar active="log" />
    </>
  );
}

async function LogContent() {
  if (!(await requireSession())) redirect("/login");
  const db = getDb();
  const tz = getEnv().OWNER_TZ;
  const now = new Date();
  const week = await getWeekly(db, localDate(now, tz));
  const hub = await getLogHub(db, now, tz);
  let planned: ReturnType<typeof pickTodayLift> = null;
  try {
    // Today's adapted sessions, the same list Today shows (a hold or swap drops the lift).
    const day = await getDayPlan(db, localDate(now, tz), now, tz);
    planned = pickTodayLift(day.sessions.map((x) => ({ ...x, status: x.completedRef !== null ? "done" : x.status })));
  } catch (err) {
    console.error("getDayPlan failed:", err);
  }

  return (
    <>
      {hub.active ? (
        <Card hot href={`/log/strength/${hub.active.id}`}>
          <Cap>Strength · In Progress</Cap>
          <p className={styles.hotTitle}>{planned ? titleCase(planned.title) : "Strength Session"}</p>
          {hub.active.lastExercise ? <p className={styles.sub}>Last: {hub.active.lastExercise}</p> : null}
          <p className={styles.sub}>
            {hub.active.setCount} {hub.active.setCount === 1 ? "set" : "sets"} logged · started{" "}
            {new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(hub.active.startedAt)}
          </p>
          <span className={styles.hotAction}>
            Resume <Icon name="chevron-right" size={16} />
          </span>
        </Card>
      ) : planned ? (
        <Card hot href="/log/strength">
          <Cap>Today&apos;s Lift</Cap>
          <p className={styles.hotTitle}>{titleCase(planned.title)}</p>
          <p className={styles.sub}>{planned.durationMin} min planned</p>
          <span className={styles.hotAction}>
            Start <Icon name="chevron-right" size={16} />
          </span>
        </Card>
      ) : null}

      <nav className={styles.tiles} aria-label="Log sections">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className={styles.tile}>
            <Icon name={s.icon} size={22} />
            <span>{s.label}</span>
          </Link>
        ))}
      </nav>

      <Card>
        <section id="weight">
          <Cap>Weight</Cap>
          <WeightForm />
        </section>
      </Card>
      <Card>
        <section id="weekly">
          <Cap>This Week</Cap>
          <WeeklyForm vo2max={week?.vo2max ?? null} whoopAge={week?.whoopAge ?? null} />
        </section>
      </Card>
    </>
  );
}
