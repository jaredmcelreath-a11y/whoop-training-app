import { redirect } from "next/navigation";
import { AppPage } from "@/components/ui/app-page";
import { Suspense } from "react";
import { TabBar } from "@/components/tab-bar";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { seasonCalendar } from "@/lib/engine/season";
import { getEnv } from "@/lib/env";
import { addDays, localDate, weekStart } from "@/lib/log/dates";
import { getPlanSettings } from "@/lib/plan/settings";
import { longDate, PHASE_BLURB, PHASE_LABEL, phaseBlocks, shortDay, weeksToRace } from "@/lib/plan/view";
import { PlanHeader } from "../plan-nav";
import styles from "../plan.module.css";

const DAYS_PER_WEEK = 7;

/** Static shell; the season (session + DB reads) streams in. */
export default function SeasonPage() {
  return (
    <>
      <AppPage>
        <PlanHeader active="season" title="Season" />
        <Suspense fallback={<p className={styles.sub}>Loading…</p>}>
          <SeasonContent />
        </Suspense>
      </AppPage>
      <TabBar active="plan" />
    </>
  );
}

async function SeasonContent() {
  if (!(await requireSession())) redirect("/login");
  const tz = getEnv().OWNER_TZ;
  const now = new Date();
  const settings = await getPlanSettings(getDb(), now, tz);
  const thisWeek = weekStart(localDate(now, tz));
  const { weeks } = seasonCalendar(settings);
  const blocks = phaseBlocks(weeks);
  const left = weeksToRace(thisWeek, settings.raceDate);
  const gain = weeks.filter((w) => w.gainPhase);
  const started = thisWeek >= settings.seasonStart;

  return (
    <>
      <section className={styles.card}>
        <p className={styles.countdown}>
          {left} {left === 1 ? "week" : "weeks"} to race
        </p>
        <p className={styles.sub}>Race day: {longDate(settings.raceDate)}</p>
        {!started ? <p className={styles.sub}>The season starts {longDate(settings.seasonStart)}.</p> : null}
      </section>

      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Phases</h2>
        <ul className={styles.legend} aria-label="Legend">
          <li>
            <span className={`${styles.chip} ${styles.chipNow}`} aria-hidden="true">
              #
            </span>
            This Week
          </li>
          <li>
            <span className={`${styles.chip} ${styles.chipGain}`} aria-hidden="true">
              #
            </span>
            Gain Week
          </li>
          <li>
            <span className={`${styles.chip} ${styles.chipRecovery}`} aria-hidden="true">
              #
            </span>
            Recovery Week
          </li>
        </ul>
        {gain.length ? (
          <p className={styles.spaced}>
            Muscle-gain phase: weeks {gain[0].index + 1}–{gain[gain.length - 1].index + 1} ({shortDay(gain[0].weekStart)} –{" "}
            {shortDay(addDays(gain[gain.length - 1].weekStart, DAYS_PER_WEEK - 1))})
          </p>
        ) : (
          <p className={styles.spaced}>
            No muscle-gain phase this season.
          </p>
        )}
        <ol className={styles.timeline}>
          {blocks.map((b) => {
            const now = b.weeks.some((w) => w.weekStart === thisWeek);
            return (
              <li key={b.start} className={now ? `${styles.phase} ${styles.phaseNow}` : styles.phase}>
                <p className={styles.phaseName}>
                  {PHASE_LABEL[b.phase]}
                  {now ? " · now" : ""}
                </p>
                <p className={styles.phaseBlurb}>{PHASE_BLURB[b.phase]}</p>
                <p className={styles.phaseRange}>
                  {shortDay(b.start)} – {shortDay(b.end)} · {b.weeks.length} {b.weeks.length === 1 ? "week" : "weeks"}
                </p>
                <div className={styles.chips}>
                  {b.weeks.map((w) => {
                    const cls = [
                      styles.chip,
                      w.gainPhase ? styles.chipGain : "",
                      w.recovery ? styles.chipRecovery : "",
                      w.weekStart === thisWeek ? styles.chipNow : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    const tags = [
                      w.weekStart === thisWeek ? "this week" : "",
                      w.gainPhase ? "gain" : "",
                      w.recovery ? "recovery" : "",
                    ].filter(Boolean);
                    const label = `Week ${w.index + 1}, ${shortDay(w.weekStart)}${tags.length ? `, ${tags.join(", ")}` : ""}`;
                    return (
                      <span key={w.weekStart} className={cls} title={label} aria-label={label} role="img">
                        {w.index + 1}
                      </span>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}
