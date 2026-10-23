import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { getTodaySummary, unscoredLabel, type TodaySummary } from "@/lib/today";
import { getDayPlan, getStrainTarget, storedDaySessions, type DaySession } from "@/lib/plan/service";
import type { StrainTarget } from "@/lib/engine/strain-target";
import { recoveryBand } from "@/lib/ui/recovery";
import { weightHint } from "@/lib/ui/weight-hint";
import { ensureFresh } from "@/lib/whoop/ensure-fresh";
import { addDays, localDate, weekStart } from "@/lib/log/dates";
import { Icon } from "@/components/icon";
import { MiniRing } from "@/components/mini-ring";
import { ProjectionCard } from "@/components/projection-card";
import { ensureWeekProjection, projectionHistory, savedWeekProjection, type SavedProjection } from "@/lib/plan/projection";
import { getPlanSettings } from "@/lib/plan/settings";
import { RULES } from "@/lib/engine/rules/catalog";
import { RecoveryRing } from "@/components/recovery-ring";
import { TabBar } from "@/components/tab-bar";
import { Page, PageGlow, StatChip } from "@/components/ui/ui";
import styles from "./today.module.css";
import { TodayFuel } from "./today-fuel";
import { TodayTraining } from "./today-training";
import { noonOf, parseTodayDate } from "./today-date";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** The page shell is static; everything that reads the session or the DB streams in. */
export default function TodayPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <Page glow="none">
        <header className={styles.header}>
          <h1 className={styles.title}>Today</h1>
          <Link href="/settings" className={styles.settingsLink} aria-label="Settings">
            <Icon name="settings" size={20} />
          </Link>
        </header>
        <Suspense fallback={<TodaySkeleton />}>
          <TodayContent searchParams={searchParams} />
        </Suspense>
      </Page>
      <TabBar active="today" />
    </>
  );
}

async function TodayContent({ searchParams }: { searchParams: SearchParams }) {
  if (!(await requireSession())) redirect("/login");

  const tz = getEnv().OWNER_TZ;
  const realNow = new Date();
  const today = localDate(realNow, tz);
  const day = parseTodayDate((await searchParams).date, today);
  if (day === null) redirect("/");
  const { date, past } = day;

  const db = getDb();
  let syncFailed = false;
  // A past day is read only: no WHOOP sync and no plan adaptation, just what is stored.
  if (!past) {
    try {
      await ensureFresh(db);
    } catch (err) {
      // A WHOOP outage must never break the page; show what is stored.
      console.error("ensureFresh failed:", err);
      syncFailed = true;
    }
  }
  const now = past ? noonOf(date, tz) : realNow;
  const t = await getTodaySummary(db, now, tz);
  const score = t.recovery?.score ?? null;
  const band = recoveryBand(score);

  // The day's sessions, loaded once: the strain target and the training card both use them.
  // Today is adapted; a past day is its stored rows only (getDayPlan would mark, generate and log).
  let sessions: DaySession[] | null = null;
  try {
    sessions = past ? await storedDaySessions(db, date) : (await getDayPlan(db, date, realNow, tz)).sessions;
  } catch (err) {
    console.error("getDayPlan failed:", err);
  }
  // This week's race projection: saved on first view (a past day only reads what was saved).
  let projection: { current: SavedProjection; history: SavedProjection[]; goalSec: number | null } | null = null;
  try {
    const ws = weekStart(date);
    const current = past ? await savedWeekProjection(db, ws) : await ensureWeekProjection(db, ws, tz);
    if (current) {
      const P = RULES["race.projection"].params;
      projection = {
        current,
        history: await projectionHistory(db, ws, P.trendWeeks),
        goalSec: (await getPlanSettings(db, realNow, tz)).goalSec,
      };
    }
  } catch (err) {
    console.error("race projection failed:", err);
  }

  let target: StrainTarget | null = null;
  try {
    target = sessions ? await getStrainTarget(db, date, sessions, tz) : null;
  } catch (err) {
    console.error("getStrainTarget failed:", err);
  }

  return (
    <>
      <PageGlow glow={band ?? "accent"} />
      <nav className={styles.dayNav} aria-label="Day">
        <Link href={`/?date=${addDays(date, -1)}`} className={styles.arrow} aria-label="Previous day">
          <Icon name="chevron-left" size={20} />
        </Link>
        <div className={styles.dayLabel}>
          <p className={styles.meta}>{formatDate(now, tz)}</p>
          {past ? (
            <Link href="/" className={styles.todayLink}>
              Back to Today
            </Link>
          ) : null}
        </div>
        {past ? (
          <Link
            href={addDays(date, 1) === today ? "/" : `/?date=${addDays(date, 1)}`}
            className={styles.arrow}
            aria-label="Next day"
          >
            <Icon name="chevron-right" size={20} />
          </Link>
        ) : (
          <span aria-hidden="true" />
        )}
      </nav>
      {past ? null : <Banner connection={t.connection} />}
      {projection ? (
        <ProjectionCard
          current={projection.current}
          history={projection.history}
          goalSec={projection.goalSec}
          goalDefaultSec={RULES["race.projection"].params.defaultGoalSec}
        />
      ) : null}
      <div className={styles.rings}>
        <SleepRing t={t} />
        <div>
          <RecoveryRing
            score={score}
            band={band}
            pendingLabel={t.recovery ? unscoredLabel(t.recovery.state) : "No Data"}
          />
          <p className={styles.ringSub}>
            7-day avg {t.recovery?.avg7 == null ? "—" : `${Math.round(t.recovery.avg7)}%`}
          </p>
        </div>
        <StrainRing t={t} target={target} />
      </div>
      <div className={styles.chips}>
        <HrvChip t={t} />
        <StatChip label="Resting HR" value={t.rhr === null ? null : `${Math.round(t.rhr)} bpm`} />
        <WeightChip t={t} />
      </div>
      {/* These two read `date` against the real clock, so a past day never adapts or generates. */}
      <TodayTraining db={db} date={date} sessions={sessions} past={past} />
      <TodayFuel db={db} date={date} now={realNow} tz={tz} past={past} />
      {past ? null : (
        <p className={styles.sync}>
          {t.lastSyncedAt ? `Last synced ${formatDateTime(t.lastSyncedAt, tz)}` : "Not synced yet"}
          {syncFailed ? <span className={styles.syncFailed}> · Sync failed</span> : null}
        </p>
      )}
    </>
  );
}

function Banner({ connection }: { connection: TodaySummary["connection"] }) {
  if (connection === "connected") return null;
  const reconnect = connection === "needs_reconnect";
  return (
    <div className={styles.banner} role="status">
      <p>
        {reconnect
          ? "WHOOP stopped accepting this app's access. Reconnect to keep syncing."
          : "Connect WHOOP to see your recovery, sleep and strain."}
      </p>
      <a href="/api/whoop/connect" className={styles.bannerButton}>
        {reconnect ? "Reconnect WHOOP" : "Connect WHOOP"}
      </a>
    </div>
  );
}

const PENDING = "Pending";

function SleepRing({ t }: { t: TodaySummary }) {
  const s = t.sleep;
  const pct = s?.performancePct ?? null;
  const caption = s?.asleepMin == null ? (s?.needMin == null ? null : `Need ${hm(s.needMin)}`) : hm(s.asleepMin) + (s.needMin == null ? "" : ` / ${hm(s.needMin)}`);
  return (
    <div className={styles.miniRing}>
      <MiniRing
        label="Sleep"
        value={pct}
        max={100}
        display={pct === null ? "" : `${Math.round(pct)}%`}
        tone="sleep"
        band={null}
        pendingLabel={s ? PENDING : "No Data"}
      />
      <p className={styles.ringCap}>Sleep</p>
      {caption ? <p className={styles.ringSub}>{caption}</p> : null}
    </div>
  );
}

const STRAIN_MAX = 21;

function StrainRing({ t, target }: { t: TodaySummary; target: StrainTarget | null }) {
  const noCycle = t.recovery === null && t.sleep === null;
  return (
    <div className={styles.miniRing}>
      <MiniRing
        label="Strain"
        value={t.dayStrain}
        max={STRAIN_MAX}
        display={t.dayStrain === null ? "" : t.dayStrain.toFixed(1)}
        tone="strain"
        band={target ? { low: target.low, high: target.high } : null}
        pendingLabel={noCycle ? "No Data" : PENDING}
      />
      <p className={styles.ringCap}>Strain</p>
      {target ? (
        <p className={styles.ringSub}>
          Target {target.low}–{target.high}
          {target.estimate ? " · Estimate" : ""}
        </p>
      ) : null}
    </div>
  );
}

function HrvChip({ t }: { t: TodaySummary }) {
  const h = t.hrv;
  const avg = h?.avg30 == null ? null : Math.round(h.avg30);
  let value: string | null = null;
  let hint = avg === null ? "30-day avg —" : `30-day avg ${avg}`;
  if (h && h.ms === null && t.recovery) value = unscoredLabel(t.recovery.state);
  if (h && h.ms !== null) {
    const ms = Math.round(h.ms);
    value = `${ms} ms`;
    if (avg !== null) hint = `${ms >= avg ? "↑" : "↓"} vs 30-day avg ${avg}`;
  }
  return <StatChip label="HRV" value={value} hint={hint} />;
}

function WeightChip({ t }: { t: TodaySummary }) {
  const w = t.weight;
  const value = w.latest ? `${w.latest.lb.toFixed(1)} lb` : null;
  return <StatChip label="Weight" icon="scale" value={value} hint={weightHint(w)} href="/log#weight" />;
}

function TodaySkeleton() {
  return (
    <div aria-busy="true">
      <p className={styles.meta}>&nbsp;</p>
      <div className={styles.rings}>
        <div className={styles.miniRing}>
          <MiniRing label="Sleep" value={null} max={100} display="" tone="sleep" band={null} pendingLabel="Loading" />
          <p className={styles.ringCap}>Sleep</p>
        </div>
        <RecoveryRing score={null} band={null} pendingLabel="Loading" />
        <div className={styles.miniRing}>
          <MiniRing label="Strain" value={null} max={STRAIN_MAX} display="" tone="strain" band={null} pendingLabel="Loading" />
          <p className={styles.ringCap}>Strain</p>
        </div>
      </div>
      <div className={styles.chips}>
        {["HRV", "Resting HR", "Weight"].map((l) => (
          <StatChip key={l} label={l} value={null} hint="Loading…" />
        ))}
      </div>
    </div>
  );
}

/** Minutes as h:mm, e.g. 460 → "7:40". */
function hm(min: number): string {
  const m = Math.round(min);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

function formatDate(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(d);
}

function formatDateTime(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}
