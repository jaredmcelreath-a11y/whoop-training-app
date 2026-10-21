import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { getTodaySummary, unscoredLabel, type TodaySummary } from "@/lib/today";
import { ensureFresh } from "@/lib/whoop/ensure-fresh";
import { TabBar } from "@/components/tab-bar";
import styles from "./today.module.css";
import { TodayFuel } from "./today-fuel";
import { TodayTraining } from "./today-training";

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

  return (
    <>
      <p className={styles.meta}>{formatDate(now, tz)}</p>
      <Banner connection={t.connection} />
      <TodayTraining db={db} now={now} tz={tz} />
      <TodayFuel db={db} now={now} tz={tz} />
      <div className={styles.grid}>
        <RecoveryTile t={t} />
        <SleepTile t={t} />
        <HrvTile t={t} />
        <StrainTile t={t} />
        <WeightTile t={t} />
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
  extra?: React.ReactNode;
  sub?: React.ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <h2 className={styles.tileLabel}>{props.label}</h2>
      <p className={`${styles.tileNum} ${props.valueClass ?? ""}`}>
        {props.value}
        {props.unit ? <span className={styles.unit}>{props.unit}</span> : null}
        {props.extra}
      </p>
      {props.sub === undefined ? null : <p className={styles.small}>{props.sub}</p>}
    </>
  );
  if (props.href) {
    return (
      <Link href={props.href} className={`${styles.tile} ${styles.tileLink}`}>
        {body}
      </Link>
    );
  }
  return <section className={styles.tile}>{body}</section>;
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

function WeightTile({ t }: { t: TodaySummary }) {
  const w = t.weight;
  if (!w.latest) {
    return <Tile label="Weight" value="Log weight" valueClass={styles.pending} href="/log#weight" />;
  }
  // The trend line needs both weeks; otherwise it is left out.
  let sub: string | undefined;
  if (w.avg7 !== null && w.avg7Prev !== null) {
    const d = Math.round((w.avg7 - w.avg7Prev) * 10) / 10;
    const sign = d > 0 ? "+" : d < 0 ? "-" : "±";
    sub = `7-day avg ${w.avg7.toFixed(1)} (${sign}${Math.abs(d).toFixed(1)} vs prior week)`;
  }
  return (
    <Tile
      label="Weight"
      value={w.latest.lb.toFixed(1)}
      unit="lb"
      extra={<span className={styles.tileDate}>{formatShortDate(w.latest.date)}</span>}
      sub={sub}
      href="/log#weight"
    />
  );
}

function TodaySkeleton() {
  return (
    <>
      <p className={styles.meta}>&nbsp;</p>
      <div className={styles.grid} aria-busy="true">
        {["Recovery", "Sleep", "HRV", "Day strain", "Weight"].map((l) => (
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

/** "2026-10-20" → "Oct 20". The string is already a local date, so format it as UTC. */
function formatShortDate(dateStr: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" }).format(
    new Date(`${dateStr}T00:00:00Z`),
  );
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
