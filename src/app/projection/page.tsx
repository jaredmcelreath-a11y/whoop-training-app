import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ProjectionCard } from "@/components/projection-card";
import { TabBar } from "@/components/tab-bar";
import { AppPage } from "@/components/ui/app-page";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { RULES } from "@/lib/engine/rules/catalog";
import { getEnv } from "@/lib/env";
import { localDate, weekStart } from "@/lib/log/dates";
import { ensureWeekProjection, liveWeekProjection, projectionHistory } from "@/lib/plan/projection";
import { getPlanSettings } from "@/lib/plan/settings";
import styles from "./projection.module.css";

/** Static shell; the projection streams in. Opened from the Projected Finish card on Today. */
export default function ProjectionPage() {
  return (
    <>
      <AppPage>
        <header className={styles.header}>
          <Link href="/" className={styles.back}>
            ‹ Today
          </Link>
          <h1 className={styles.title}>Projected Finish</h1>
        </header>
        <Suspense fallback={<p className={styles.sub}>Loading…</p>}>
          <Projection />
        </Suspense>
      </AppPage>
      <TabBar active="today" />
    </>
  );
}

async function Projection() {
  if (!(await requireSession())) redirect("/login");
  const db = getDb();
  const tz = getEnv().OWNER_TZ;
  const now = new Date();
  const today = localDate(now, tz);
  const ws = weekStart(today);
  const P = RULES["race.projection"].params;
  const current = await ensureWeekProjection(db, ws, tz);
  // All saved weeks, so the chart starts from the very first projection.
  const history = await projectionHistory(db, ws, Number.MAX_SAFE_INTEGER);
  const { goalSec } = await getPlanSettings(db, now, tz);
  const liveS = await liveWeekProjection(db, ws, today, tz);
  return <ProjectionCard current={current} history={history} goalSec={goalSec} goalDefaultSec={P.defaultGoalSec} liveS={liveS} />;
}
