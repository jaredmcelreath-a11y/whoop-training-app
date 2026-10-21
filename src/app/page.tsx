import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { getTodaySummary, unscoredLabel, type TodaySummary } from "@/lib/today";
import { ensureFresh } from "@/lib/whoop/ensure-fresh";
import styles from "./today.module.css";

const PLACEHOLDER_TABS = ["Day", "Plan", "Log", "Progress"];

/** The page shell is static; everything that reads the session or the DB streams in. */
export default function TodayPage() {
  return (
    <>
      <main className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>Today</h1>
          <Link href="/settings" className={styles.settingsLink}>
            Settings
          </Link>
        </header>
        <Suspense fallback={<TodaySkeleton />}>
          <TodayContent />
        </Suspense>
      </main>
      <nav className={styles.tabs} aria-label="Main">
        <div className={styles.tabsInner}>
          <Link href="/" className={styles.tabActive} aria-current="page">
            Today
          </Link>
          {PLACEHOLDER_TABS.map((t) => (
            <span key={t} className={styles.tab} aria-disabled="true" title="Coming soon">
              {t}
            </span>
          ))}
        </div>
      </nav>
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

  return (
    <>
      <p className={styles.meta}>{formatDate(now, tz)}</p>
      <Banner connection={t.connection} />
      <div className={styles.grid}>
        <RecoveryTile t={t} />
        <SleepTile t={t} />
        <HrvTile t={t} />
        <StrainTile t={t} />
      </div>
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

function Tile(props: {
  label: string;
  value: string;
  unit?: string;
  valueClass?: string;
  sub: React.ReactNode;
}) {
  return (
    <section className={styles.tile}>
      <h2 className={styles.tileLabel}>{props.label}</h2>
      <p className={`${styles.tileNum} ${props.valueClass ?? ""}`}>
        {props.value}
        {props.unit ? <span className={styles.unit}>{props.unit}</span> : null}
      </p>
      <p className={styles.small}>{props.sub}</p>
    </section>
  );
}

const NO_DATA = "—";
const PENDING = "Pending";

function recoveryClass(score: number): string {
  if (score >= 67) return styles.green;
  if (score >= 34) return styles.yellow;
  return styles.red;
}

function RecoveryTile({ t }: { t: TodaySummary }) {
  const r = t.recovery;
  if (!r) return <Tile label="Recovery" value={NO_DATA} sub="No data yet" />;
  const avg = r.avg7 === null ? NO_DATA : `${Math.round(r.avg7)}%`;
  if (r.score === null) return <Tile label="Recovery" value={unscoredLabel(r.state)} valueClass={styles.pending} sub={`7-day avg ${avg}`} />;
  return (
    <Tile
      label="Recovery"
      value={`${Math.round(r.score)}%`}
      valueClass={recoveryClass(r.score)}
      sub={`7-day avg ${avg}`}
    />
  );
}

function SleepTile({ t }: { t: TodaySummary }) {
  const s = t.sleep;
  if (!s) return <Tile label="Sleep" value={NO_DATA} sub="No data yet" />;
  const need = s.needMin === null ? null : `need ${hm(s.needMin)}`;
  if (s.asleepMin === null) return <Tile label="Sleep" value={PENDING} valueClass={styles.pending} sub={need ?? "Not scored yet"} />;
  return <Tile label="Sleep" value={hm(s.asleepMin)} sub={need ?? "Need unknown"} />;
}

function HrvTile({ t }: { t: TodaySummary }) {
  const h = t.hrv;
  if (!h) return <Tile label="HRV" value={NO_DATA} sub="No data yet" />;
  const avg = h.avg30 === null ? null : Math.round(h.avg30);
  if (h.ms === null) {
    return <Tile label="HRV" value={unscoredLabel(t.recovery?.state)} valueClass={styles.pending} sub={avg === null ? "30-day avg —" : `30-day avg ${avg}`} />;
  }
  const ms = Math.round(h.ms);
  let sub: React.ReactNode = "30-day avg —";
  if (avg !== null) {
    const up = ms >= avg;
    sub = (
      <>
        <span className={up ? styles.green : styles.yellow}>{up ? "↑" : "↓"}</span> vs 30-day avg {avg}
      </>
    );
  }
  return <Tile label="HRV" value={String(ms)} unit="ms" sub={sub} />;
}

function StrainTile({ t }: { t: TodaySummary }) {
  const rhr = t.rhr === null ? null : `RHR ${Math.round(t.rhr)} bpm`;
  if (t.dayStrain === null) {
    const noCycle = t.recovery === null && t.sleep === null;
    return (
      <Tile
        label="Day strain"
        value={noCycle ? NO_DATA : PENDING}
        valueClass={noCycle ? undefined : styles.pending}
        sub={rhr ?? (noCycle ? "No data yet" : "Not scored yet")}
      />
    );
  }
  return <Tile label="Day strain" value={t.dayStrain.toFixed(1)} valueClass={styles.blue} sub={rhr ?? "RHR —"} />;
}

function TodaySkeleton() {
  return (
    <>
      <p className={styles.meta}>&nbsp;</p>
      <div className={styles.grid} aria-busy="true">
        {["Recovery", "Sleep", "HRV", "Day strain"].map((l) => (
          <Tile key={l} label={l} value={NO_DATA} sub="Loading…" />
        ))}
      </div>
    </>
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
