import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { getTodaySummary, unscoredLabel, type TodaySummary } from "@/lib/today";
import { recoveryBand } from "@/lib/ui/recovery";
import { weightHint } from "@/lib/ui/weight-hint";
import { ensureFresh } from "@/lib/whoop/ensure-fresh";
import { addDays, localDate } from "@/lib/log/dates";
import { Icon } from "@/components/icon";
import { RecoveryRing } from "@/components/recovery-ring";
import { TabBar } from "@/components/tab-bar";
import { Cap, Card, Page, PageGlow, StatChip } from "@/components/ui/ui";
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
      <RecoveryRing
        score={score}
        band={band}
        pendingLabel={t.recovery ? unscoredLabel(t.recovery.state) : "No Data"}
      />
      <p className={styles.ringSub}>
        7-day avg {t.recovery?.avg7 == null ? "—" : `${Math.round(t.recovery.avg7)}%`}
      </p>
      <div className={styles.chips}>
        <SleepChip t={t} />
        <StrainChip t={t} />
        <WeightChip t={t} />
      </div>
      <HrvCard t={t} />
      {/* These two read `date` against the real clock, so a past day never adapts or generates. */}
      <TodayTraining db={db} date={date} now={realNow} tz={tz} past={past} />
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

function SleepChip({ t }: { t: TodaySummary }) {
  const s = t.sleep;
  if (!s) return <StatChip label="Sleep" icon="moon" value={null} hint="No data yet" />;
  const need = s.needMin === null ? undefined : `Need ${hm(s.needMin)}`;
  if (s.asleepMin === null) return <StatChip label="Sleep" icon="moon" value={PENDING} hint={need ?? "Not scored yet"} />;
  return <StatChip label="Sleep" icon="moon" value={hm(s.asleepMin)} hint={need ?? "Need unknown"} />;
}

function StrainChip({ t }: { t: TodaySummary }) {
  if (t.dayStrain !== null) return <StatChip label="Strain" icon="bolt" value={t.dayStrain.toFixed(1)} hint="Day Strain" />;
  const noCycle = t.recovery === null && t.sleep === null;
  return <StatChip label="Strain" icon="bolt" value={noCycle ? null : PENDING} hint={noCycle ? "No data yet" : "Not scored yet"} />;
}

function WeightChip({ t }: { t: TodaySummary }) {
  const w = t.weight;
  const value = w.latest ? `${w.latest.lb.toFixed(1)} lb` : null;
  return <StatChip label="Weight" icon="scale" value={value} hint={weightHint(w)} href="/log#weight" />;
}

function HrvCard({ t }: { t: TodaySummary }) {
  const h = t.hrv;
  const avg = h?.avg30 == null ? null : Math.round(h.avg30);
  let hrv = "—";
  let hint = avg === null ? "30-day avg —" : `30-day avg ${avg}`;
  if (h && h.ms === null) hrv = unscoredLabel(t.recovery?.state);
  if (h && h.ms !== null) {
    const ms = Math.round(h.ms);
    hrv = `${ms} ms`;
    if (avg !== null) hint = `${ms >= avg ? "↑" : "↓"} vs 30-day avg ${avg}`;
  }
  return (
    <Card>
      <div className={styles.strainRow}>
        <div>
          <Cap>HRV</Cap>
          <p className={styles.strainNum}>{hrv}</p>
          <p className={styles.small}>{hint}</p>
        </div>
        <div className={styles.strainRight}>
          <Cap>Resting HR</Cap>
          <p className={styles.strainNum}>{t.rhr === null ? "—" : `${Math.round(t.rhr)} bpm`}</p>
        </div>
      </div>
    </Card>
  );
}

function TodaySkeleton() {
  return (
    <div aria-busy="true">
      <p className={styles.meta}>&nbsp;</p>
      <RecoveryRing score={null} band={null} pendingLabel="Loading" />
      <div className={styles.chips}>
        {["Sleep", "Strain", "Weight"].map((l) => (
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
