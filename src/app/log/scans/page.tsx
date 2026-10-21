import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { TabBar } from "@/components/tab-bar";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { localDate } from "@/lib/log/dates";
import { listScans } from "@/lib/log/records";
import { deleteScanAction } from "../records-actions";
import styles from "../records.module.css";
import base from "../strength/strength.module.css";
import { DeleteButton, ScanForm } from "./scan-form";

export default function ScansPage() {
  return (
    <>
      <main className={base.page}>
        <header className={base.header}>
          <Link href="/log" className={base.back}>
            ‹ Log
          </Link>
          <h1 className={base.title}>Body scans</h1>
        </header>
        <Suspense fallback={<p className={base.sub}>Loading…</p>}>
          <ScansContent />
        </Suspense>
      </main>
      <TabBar active="log" />
    </>
  );
}

const fmt = (n: number | null, suffix: string) =>
  n == null ? null : `${n}${suffix}`;

async function ScansContent() {
  if (!(await requireSession())) redirect("/login");
  const scans = await listScans(getDb());
  const today = localDate(new Date(), getEnv().OWNER_TZ);
  return (
    <>
      <section className={base.card}>
        <h2 className={base.cardTitle}>New scan</h2>
        <ScanForm today={today} />
      </section>
      <section className={base.card}>
        <h2 className={base.cardTitle}>History</h2>
        {scans.length ? (
          <ul className={styles.list}>
            {scans.map((s) => {
              const bits = [
                fmt(s.weightLb, " lb"),
                fmt(s.leanMassLb, " lb lean"),
                fmt(s.bodyFatPct, "% fat"),
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={s.id} className={styles.item}>
                  <div className={styles.itemMain}>
                    <span className={styles.itemTitle}>{s.scannedOn}</span>
                    <span className={styles.itemSub}>
                      {bits || "no headline values"}
                    </span>
                  </div>
                  <form action={deleteScanAction.bind(null, s.id)}>
                    <DeleteButton label={`scan ${s.scannedOn}`} />
                  </form>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={base.sub}>No scans yet.</p>
        )}
      </section>
    </>
  );
}
