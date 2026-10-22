import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Icon } from "@/components/icon";
import { TabBar } from "@/components/tab-bar";
import { AppPage } from "@/components/ui/app-page";
import { Card, Meter } from "@/components/ui/ui";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { addDays, localDate } from "@/lib/log/dates";
import { parseDateParam } from "@/lib/nutrition/day-view";
import { nutrientRows, type NutrientRow } from "@/lib/nutrition/nutrients-view";
import { getDayNutrition } from "@/lib/nutrition/service";
import { dayHeading } from "@/lib/plan/view";
import styles from "./fuel.module.css";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const GROUPS: NutrientRow["group"][] = ["Macros", "Vitamins", "Minerals"];

/** Static shell; the day's nutrients (session + DB reads) stream in. */
export default function FuelPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <AppPage title="All Nutrients">
        <Suspense fallback={<p className={styles.sub}>Loading…</p>}>
          <FuelContent searchParams={searchParams} />
        </Suspense>
      </AppPage>
      <TabBar active="today" />
    </>
  );
}

async function FuelContent({ searchParams }: { searchParams: SearchParams }) {
  if (!(await requireSession())) redirect("/login");
  const sp = await searchParams;
  const tz = getEnv().OWNER_TZ;
  const now = new Date();
  const today = localDate(now, tz);
  const date = parseDateParam(sp.date, today);
  const n = await getDayNutrition(getDb(), date, now, tz);
  const rows = nutrientRows(n);

  return (
    <>
      <nav className={styles.dayNav} aria-label="Day">
        <Link href={`/fuel?date=${addDays(date, -1)}`} className={styles.arrow} aria-label="Previous day">
          <Icon name="chevron-left" size={20} />
        </Link>
        <div className={styles.dayLabel}>
          <div className={styles.dayName}>{dayHeading(date)}</div>
          {date !== today ? (
            <Link href="/fuel" className={styles.todayLink}>
              Back to Today
            </Link>
          ) : (
            <div className={styles.sub}>Today</div>
          )}
        </div>
        <Link href={`/fuel?date=${addDays(date, 1)}`} className={styles.arrow} aria-label="Next day">
          <Icon name="chevron-right" size={20} />
        </Link>
      </nav>

      {n.micros === null ? (
        <p className={styles.note}>
          <Link href="/settings/nutrition" className={styles.link}>
            Set your reference-intake profile
          </Link>{" "}
          to see vitamin and mineral targets.
        </p>
      ) : null}

      {GROUPS.map((g) => (
        <Card key={g}>
          <h2 className={styles.groupTitle}>{g}</h2>
          {rows
            .filter((r) => r.group === g)
            .map((r) => (
              <Row key={r.key} r={r} />
            ))}
        </Card>
      ))}
      <p className={styles.note}>
        Targets are the US Dietary Reference Intakes for your profile. Not medical advice: talk to your doctor or a
        registered dietitian.
      </p>
    </>
  );
}

function Row({ r }: { r: NutrientRow }) {
  const shown = (x: number | null) => (x === null ? "—" : x >= 100 ? Math.round(x) : Math.round(x * 10) / 10);
  const over = r.kind === "limit" && r.eaten !== null && r.target !== null && r.eaten > r.target;
  return (
    <div className={styles.row}>
      <div className={styles.rowHead}>
        <span>
          {r.label}
          {r.kind === "limit" ? <span className={styles.limit}>Stay Under</span> : null}
        </span>
        <span className={over ? styles.over : styles.nums}>
          {shown(r.eaten)}
          {r.target === null ? "" : ` / ${shown(r.target)}`} {r.unit}
        </span>
      </div>
      <Meter
        value={r.eaten ?? 0}
        max={r.target ?? 0}
        tone={over ? "low" : r.key === "water_ml" ? "info" : "good"}
        label={r.label}
      />
    </div>
  );
}
