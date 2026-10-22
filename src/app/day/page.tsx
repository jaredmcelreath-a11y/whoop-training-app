import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Icon } from "@/components/icon";
import { TabBar } from "@/components/tab-bar";
import { Cap, Card, Page, StatChip } from "@/components/ui/ui";
import { EDGE_FOR_KIND, ICON_FOR_ITEM, displayTitle, nextItemIndex } from "./day-style";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { buildTimeline, supplementNote } from "@/lib/engine/day-timeline";
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

/** Static shell; the day (session + DB reads) streams in. */
export default function DayPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <Page title="Day">
        <Suspense fallback={<p className={styles.sub}>Loading…</p>}>
          <DayContent searchParams={searchParams} />
        </Suspense>
      </Page>
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
          <StatChip label="Calories" value={n.targets ? `${Math.round(n.targets.kcal)}` : null} hint="kcal" />
          <StatChip label="Protein" value={n.targets ? `${Math.round(n.targets.proteinG)}` : null} hint="g" />
          <StatChip label="Carbs" value={n.targets ? `${Math.round(n.targets.carbsG)}` : null} hint="g" />
        </div>
        <div className={styles.targets}>
          <StatChip label="Fat" value={n.targets ? `${Math.round(n.targets.fatG)}` : null} hint="g" />
          <StatChip label="Water" icon="drop" value={`${Math.round(mlToOz(n.water.targetMl))}`} hint="oz" />
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
            <span className={styles.time}>{it.time}</span>
            <Card hot={i === next} className={styles.body}>
              <div className={styles.edge} data-edge={EDGE_FOR_KIND[it.kind]} aria-hidden="true" />
              {i === next ? <Cap>Up Next</Cap> : null}
              <div className={styles.itemHead}>
                <Icon name={ICON_FOR_ITEM[it.kind]} size={16} className={styles.itemIcon} />
                <span className={styles.itemTitle}>{displayTitle(it)}</span>
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
            </Card>
          </li>
        ))}
      </ol>

      <h2 className={styles.sectionTitle}>Supplements</h2>
      <Card>
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
                      See the Evidence
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
            Edit Supplements and Meals
          </Link>
        </p>
        <p className={styles.small}>Not medical advice. Check supplements with your doctor or a registered dietitian.</p>
      </Card>
    </>
  );
}
