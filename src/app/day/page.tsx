import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Icon } from "@/components/icon";
import { TabBar } from "@/components/tab-bar";
import { Cap, Card, StatChip } from "@/components/ui/ui";
import { AppPage } from "@/components/ui/app-page";
import { clock12, withClock12 } from "@/lib/ui/clock";
import { EDGE_FOR_KIND, ICON_FOR_ITEM, displayTitle, nextItemIndex, targetChips } from "./day-style";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { anchorBedtime, buildTimeline, mergeActual, supplementNote, supplementRuleIds } from "@/lib/engine/day-timeline";
import { RULES } from "@/lib/engine/rules/catalog";
import { getEnv } from "@/lib/env";
import { addDays, localDate } from "@/lib/log/dates";
import { actualWorkouts, latestSleepNeedMin, parseDateParam, sleepAnchorInputs, withDuringFluid } from "@/lib/nutrition/day-view";
import { getDayNutrition } from "@/lib/nutrition/service";
import { getNutritionSettings } from "@/lib/nutrition/settings";
import { getPlanSettings } from "@/lib/plan/settings";
import { dayHeading } from "@/lib/plan/view";
import styles from "./day.module.css";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const RULE_WHY = RULES as Record<string, { why: string } | undefined>;
const TIMING_LABEL: Record<string, string> = {
  morning: "Morning",
  with_meal: "With a Meal",
  pre_workout: "Before Training",
  post_workout: "After Training",
  evening: "Evening",
};

/** Static shell; the day (session + DB reads) streams in. */
export default function DayPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <AppPage title="Day">
        <Suspense fallback={<p className={styles.sub}>Loading…</p>}>
          <DayContent searchParams={searchParams} />
        </Suspense>
      </AppPage>
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
  const anchorIn = await sleepAnchorInputs(db, date, tz);
  const kg = n.weight?.kg ?? null;

  const planned = buildTimeline({
    windows: ps.windows,
    sessions: withDuringFluid(n.sessions, n.water.duringSessions),
    mealsPerDay: ns.mealsPerDay,
    supplements: ns.supplements,
    proteinG: n.targets?.proteinG ?? null,
    carbsG: n.targets?.carbsG ?? null,
    weightKg: kg,
    sleepNeedMin,
    wakeTime: ps.wakeTime ?? undefined,
    bedtime: anchorIn ? anchorBedtime(anchorIn) : undefined,
  });
  // Real workouts sit at their actual start: a planned one moves there, others are added.
  const items = mergeActual(planned, await actualWorkouts(db, date, tz));

  const nowHHMM =
    date === today
      ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now)
      : null;
  const next = nextItemIndex(items, nowHHMM);

  return (
    <>
      <nav className={styles.dayNav} aria-label="Day">
        <Link href={`/day?date=${addDays(date, -1)}`} className={styles.arrow} aria-label="Previous day">
          <Icon name="chevron-left" size={20} />
        </Link>
        <div className={styles.dayLabel}>
          <div className={styles.dayName}>{dayHeading(date)}</div>
          {date !== today ? (
            <Link href="/day" className={styles.todayLink}>
              Back to Today
            </Link>
          ) : (
            <div className={styles.sub}>Today</div>
          )}
        </div>
        <Link href={`/day?date=${addDays(date, 1)}`} className={styles.arrow} aria-label="Next day">
          <Icon name="chevron-right" size={20} />
        </Link>
      </nav>

      <Card>
        <Cap>Targets</Cap>
        <div className={styles.targets}>
          {targetChips(n).map((c) => (
            <StatChip key={c.label} label={c.label} value={c.value} icon={c.icon} />
          ))}
        </div>
        {n.needs.length ? (
          <ul className={styles.needs}>
            {n.needs.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        ) : null}
        {sleepNeedMin === null ? <p className={styles.small}>No WHOOP sleep need yet, so no bedtime is shown.</p> : null}
      </Card>

      <h2 className={styles.sectionTitle}>Timeline</h2>
      <ol className={styles.timeline}>
        {items.map((it, i) => (
          <li key={`${it.time}-${it.kind}-${i}`} className={styles.item}>
            <Card hot={i === next} className={styles.body}>
              <div className={styles.edge} data-edge={EDGE_FOR_KIND[it.kind]} aria-hidden="true" />
              <div className={styles.itemTop}>
                <span className={styles.time}>{clock12(it.time)}</span>
                {i === next ? <Cap>Up Next</Cap> : null}
              </div>
              <div className={styles.itemHead}>
                <Icon name={ICON_FOR_ITEM[it.kind]} size={16} className={styles.itemIcon} />
                <span className={styles.itemTitle}>{displayTitle(it)}</span>
              </div>
              <p className={styles.detail}>{withClock12(it.detail)}</p>
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
            </Card>
          </li>
        ))}
      </ol>

      {/* Collapsed by default: the timeline above already places each supplement in the day. */}
      <details className={styles.suppsSection}>
        <summary className={`${styles.sectionTitle} ${styles.suppsSummary}`}>
          Supplements <span className={styles.suppsCount}>{ns.supplements.length}</span>
        </summary>
      <Card>
        {ns.supplements.length ? (
          <ul className={styles.supps}>
            {ns.supplements.map((s, i) => {
              const note = supplementNote(s.name, kg, s.amount);
              return (
                <li key={`${s.name}-${i}`} className={styles.supp}>
                  <div className={styles.itemHead}>
                    <span className={styles.itemTitle}>{s.name}</span>
                    {s.amount ? <span className={styles.amount}>{s.amount}</span> : null}
                    <span className={styles.badge}>{TIMING_LABEL[s.timing] ?? s.timing}</span>
                  </div>
                  <p className={styles.detail}>{note ?? "No evidence note for this one in the library."}</p>
                  {supplementRuleIds(s.name).map((id) => (
                    <a key={id} href={`/plan/library#${id}`} className={styles.whyLink}>
                      {id === "supplements.creatineBrain" ? "Brain Evidence" : "See the Evidence"}
                    </a>
                  ))}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.small}>No supplements set.</p>
        )}
        <p className={styles.small}>
          <Link href="/settings/nutrition" className={styles.whyLink}>
            Edit Supplements and Meals
          </Link>
        </p>
        <p className={styles.small}>Not medical advice. Check supplements with your doctor or a registered dietitian.</p>
      </Card>
      </details>
    </>
  );
}
