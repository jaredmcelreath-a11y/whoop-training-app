import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { TabBar } from "@/components/tab-bar";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { buildTimeline, supplementNote, type TimelineItem } from "@/lib/engine/day-timeline";
import { RULES } from "@/lib/engine/rules/catalog";
import { getEnv } from "@/lib/env";
import { addDays, localDate } from "@/lib/log/dates";
import { latestSleepNeedMin, parseDateParam, withDuringFluid } from "@/lib/nutrition/day-view";
import { mlToOz } from "@/lib/nutrition/fuel-view";
import { getDayNutrition } from "@/lib/nutrition/service";
import { getNutritionSettings } from "@/lib/nutrition/settings";
import { getPlanSettings } from "@/lib/plan/settings";
import { dayHeading } from "@/lib/plan/view";
import styles from "./day.module.css";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const RULE_WHY = RULES as Record<string, { why: string } | undefined>;
const TIMING_LABEL: Record<string, string> = {
  morning: "Morning",
  with_meal: "With a meal",
  pre_workout: "Before training",
  post_workout: "After training",
  evening: "Evening",
};
const KIND_CLASS: Record<TimelineItem["kind"], string> = {
  wake: styles.kWake,
  supplement: styles.kSupp,
  meal: styles.kMeal,
  snack: styles.kSnack,
  session: styles.kSession,
  bedtime: styles.kBed,
};

/** Static shell; the day (session + DB reads) streams in. */
export default function DayPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <main className={styles.page}>
        <h1 className={styles.title}>Day</h1>
        <Suspense fallback={<p className={styles.sub}>Loading…</p>}>
          <DayContent searchParams={searchParams} />
        </Suspense>
      </main>
      <TabBar active="day" />
    </>
  );
}

async function DayContent({ searchParams }: { searchParams: SearchParams }) {
  if (!(await requireSession())) redirect("/login");
  const sp = await searchParams;
  const tz = getEnv().OWNER_TZ;
  const now = new Date();
  const today = localDate(now, tz);
  const date = parseDateParam(sp.date, today);
  const db = getDb();

  const n = await getDayNutrition(db, date, now, tz);
  const ps = await getPlanSettings(db, now, tz);
  const ns = await getNutritionSettings(db);
  const sleepNeedMin = await latestSleepNeedMin(db, date, tz);
  const kg = n.weight?.kg ?? null;

  const items = buildTimeline({
    windows: ps.windows,
    sessions: withDuringFluid(n.sessions, n.water.duringSessions),
    mealsPerDay: ns.mealsPerDay,
    supplements: ns.supplements,
    proteinG: n.targets?.proteinG ?? null,
    carbsG: n.targets?.carbsG ?? null,
    weightKg: kg,
    sleepNeedMin,
  });

  return (
    <>
      <nav className={styles.dayNav} aria-label="Day">
        <Link href={`/day?date=${addDays(date, -1)}`} className={styles.arrow} aria-label="Previous day">
          ‹
        </Link>
        <div className={styles.dayLabel}>
          <div className={styles.dayName}>{dayHeading(date)}</div>
          {date !== today ? (
            <Link href="/day" className={styles.todayLink}>
              Back to today
            </Link>
          ) : (
            <div className={styles.sub}>Today</div>
          )}
        </div>
        <Link href={`/day?date=${addDays(date, 1)}`} className={styles.arrow} aria-label="Next day">
          ›
        </Link>
      </nav>

      <section className={styles.card} aria-label="Targets">
        <h2 className={styles.cardTitle}>Targets</h2>
        <dl className={styles.targets}>
          <Target label="Calories" value={n.targets ? `${Math.round(n.targets.kcal)}` : "–"} unit="kcal" />
          <Target label="Protein" value={n.targets ? `${Math.round(n.targets.proteinG)}` : "–"} unit="g" />
          <Target label="Carbs" value={n.targets ? `${Math.round(n.targets.carbsG)}` : "–"} unit="g" />
          <Target label="Fat" value={n.targets ? `${Math.round(n.targets.fatG)}` : "–"} unit="g" />
          <Target label="Water" value={`${Math.round(mlToOz(n.water.targetMl))}`} unit="oz" />
        </dl>
        {n.needs.length ? (
          <ul className={styles.needs}>
            {n.needs.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        ) : null}
        {sleepNeedMin === null ? <p className={styles.small}>No WHOOP sleep need yet, so no bedtime is shown.</p> : null}
      </section>

      <section className={styles.card} aria-label="Timeline">
        <h2 className={styles.cardTitle}>Timeline</h2>
        <ol className={styles.timeline}>
          {items.map((it, i) => (
            <li key={`${it.time}-${it.kind}-${i}`} className={styles.item}>
              <span className={styles.time}>{it.time}</span>
              <div className={styles.body}>
                <div className={styles.itemHead}>
                  <span className={KIND_CLASS[it.kind]}>{it.kind}</span>
                  <span className={styles.itemTitle}>{it.title}</span>
                </div>
                <p className={styles.detail}>{it.detail}</p>
                <details className={styles.why}>
                  <summary className={styles.whySummary}>Why</summary>
                  <ul className={styles.whyList}>
                    {it.ruleIds.map((id) => (
                      <li key={id}>
                        <a href={`/plan/library#${id}`} className={styles.whyLink}>
                          {RULE_WHY[id]?.why ?? id}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.card} aria-label="Supplements">
        <h2 className={styles.cardTitle}>Supplements</h2>
        {ns.supplements.length ? (
          <ul className={styles.supps}>
            {ns.supplements.map((s, i) => {
              const note = supplementNote(s.name, kg);
              return (
                <li key={`${s.name}-${i}`} className={styles.supp}>
                  <div className={styles.itemHead}>
                    <span className={styles.itemTitle}>{s.name}</span>
                    <span className={styles.badge}>{TIMING_LABEL[s.timing] ?? s.timing}</span>
                  </div>
                  <p className={styles.detail}>{note ?? "No evidence note for this one in the library."}</p>
                  {note ? (
                    <a href="/plan/library#supplements.evidence" className={styles.whyLink}>
                      See the evidence
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.small}>No supplements set.</p>
        )}
        <p className={styles.small}>
          <Link href="/settings/nutrition" className={styles.whyLink}>
            Edit supplements and meals per day
          </Link>
        </p>
        <p className={styles.small}>Not medical advice. Check supplements with your doctor or a registered dietitian.</p>
      </section>
    </>
  );
}

function Target({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className={styles.target}>
      <dt className={styles.targetLabel}>{label}</dt>
      <dd className={styles.targetValue}>
        {value}
        <span className={styles.unit}> {unit}</span>
      </dd>
    </div>
  );
}
