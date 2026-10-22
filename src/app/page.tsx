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
import { Icon } from "@/components/icon";
import { RecoveryRing } from "@/components/recovery-ring";
import { TabBar } from "@/components/tab-bar";
import { Cap, Card, Page, PageGlow, StatChip } from "@/components/ui/ui";
import styles from "./today.module.css";
import { TodayFuel } from "./today-fuel";
import { TodayTraining } from "./today-training";

/** The page shell is static; everything that reads the session or the DB streams in. */
export default function TodayPage() {
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
          <TodayContent />
        </Suspense>
      </Page>
      <TabBar active="today" />
    </>
  );
}

async function TodayContent() {
  if (!(await requireSession())) redirect("/login");

  const db = getDb();
  let syncFailed = false;
  try {
    await ensureFresh(db);
  } catch (err) {
    // A WHOOP outage must never break the page; show what is stored.
    console.error("ensureFresh failed:", err);
    syncFailed = true;
  }
  const tz = getEnv().OWNER_TZ;
  const now = new Date();
  const t = await getTodaySummary(db, now, tz);
  const score = t.recovery?.score ?? null;
  const band = recoveryBand(score);

  return (
    <>
      <PageGlow glow={band ?? "accent"} />
      <p className={styles.meta}>{formatDate(now, tz)}</p>
      <Banner connection={t.connection} />
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
        <HrvChip t={t} />
        <WeightChip t={t} />
      </div>
      <TodayTraining db={db} now={now} tz={tz} />
      <TodayFuel db={db} now={now} tz={tz} />
      <StrainCard t={t} />
      <p className={styles.sync}>
        {t.lastSyncedAt ? `Last synced ${formatDateTime(t.lastSyncedAt, tz)}` : "Not synced yet"}
        {syncFailed ? <span className={styles.syncFailed}> · Sync failed</span> : null}
      </p>
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

function HrvChip({ t }: { t: TodaySummary }) {
  const h = t.hrv;
  if (!h) return <StatChip label="HRV" icon="pulse" value={null} hint="No data yet" />;
  const avg = h.avg30 === null ? null : Math.round(h.avg30);
  const avgHint = avg === null ? "30-day avg —" : `30-day avg ${avg}`;
  if (h.ms === null) return <StatChip label="HRV" icon="pulse" value={unscoredLabel(t.recovery?.state)} hint={avgHint} />;
  const ms = Math.round(h.ms);
  const hint = avg === null ? avgHint : `${ms >= avg ? "↑" : "↓"} vs 30-day avg ${avg}`;
  return <StatChip label="HRV" icon="pulse" value={`${ms} ms`} hint={hint} />;
}

function WeightChip({ t }: { t: TodaySummary }) {
  const w = t.weight;
  const value = w.latest ? `${w.latest.lb.toFixed(1)} lb` : null;
  return <StatChip label="Weight" icon="scale" value={value} hint={weightHint(w)} href="/log#weight" />;
}

function StrainCard({ t }: { t: TodaySummary }) {
  const noCycle = t.recovery === null && t.sleep === null;
  const strain = t.dayStrain === null ? (noCycle ? "—" : PENDING) : t.dayStrain.toFixed(1);
  return (
    <Card>
      <div className={styles.strainRow}>
        <div>
          <Cap>Day Strain</Cap>
          <p className={styles.strainNum}>{strain}</p>
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
        {["Sleep", "HRV", "Weight"].map((l) => (
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
