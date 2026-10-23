import { redirect } from "next/navigation";
import { Reenter } from "@/components/reenter";
import { getWeekly, getWeightTrend } from "@/lib/log/body";
import { unlinkedWhoopCardio, weeklyBoxOpen } from "@/lib/log/log-boxes";
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

import { localDate } from "@/lib/log/dates";
import { WeeklyForm, WeightForm } from "./forms";
import { dismissWorkoutAction } from "./actions";
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
  const today = localDate(now, tz);
  const week = await getWeekly(db, today);
  const weight = await getWeightTrend(db, now, tz);
  const weighedToday = weight.latest?.date === today ? weight.latest : null;
  const weekOpen = weeklyBoxOpen(week ? { updatedLocalDate: localDate(week.updatedAt, tz) } : null, today);
  const needDetails = await unlinkedWhoopCardio(db, now);
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
          {/* Remounts after each save so the box collapses once today's weight is in. */}
          <Reenter
            key={weighedToday ? `w-${weighedToday.loggedAt.getTime()}` : "w-none"}
            title={<Cap>Weight</Cap>}
            open={!weighedToday}
            summary={weighedToday ? `Logged ${weighedToday.lb.toFixed(1)} lb today` : null}
          >
            <WeightForm />
          </Reenter>
        </section>
      </Card>
      <Card>
        <section id="weekly">
          <Reenter
            key={week ? `wk-${week.updatedAt.getTime()}` : "wk-none"}
            title={<Cap>This Week</Cap>}
            open={weekOpen}
            summary={week ? `VO2 Max ${week.vo2max ?? "—"} · Age ${week.whoopAge ?? "—"}` : null}
          >
            <WeeklyForm vo2max={week?.vo2max ?? null} whoopAge={week?.whoopAge ?? null} />
          </Reenter>
        </section>
      </Card>

      {needDetails.length ? (
        <Card>
          <Cap>WHOOP Workouts Missing Details</Cap>
          <p className={styles.sub}>Add distance, pool length or watts so pace and power show in Progress.</p>
          <ul className={styles.detailsList}>
            {needDetails.map((w) => (
              <li key={w.id} className={styles.detailsRow}>
                <span className={styles.detailsText}>
                  <Icon name={w.kind === "swim" ? "swim" : w.kind === "bike" ? "bike" : "run"} size={16} />{" "}
                  {titleCase(w.kind)} · {w.durationMin} min ·{" "}
                  {new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "numeric", minute: "2-digit" }).format(w.start)}
                </span>
                <span className={styles.detailsActions}>
                  <form action={dismissWorkoutAction.bind(null, w.id)}>
                    <button type="submit" className={styles.dismiss}>
                      Not a Workout
                    </button>
                  </form>
                  <Link href={`/log/cardio?kind=${w.kind}&whoop=${encodeURIComponent(w.id)}`} className={styles.detailsLink}>
                    Add Details
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
