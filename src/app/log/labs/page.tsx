import Link from "next/link";
import { AppPage } from "@/components/ui/app-page";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { TabBar } from "@/components/tab-bar";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { localDate } from "@/lib/log/dates";
import { listLabPanels, listMarkers } from "@/lib/log/records";
import { deleteLabPanelAction } from "../records-actions";
import styles from "../records.module.css";
import { DeleteButton } from "../scans/scan-form";
import base from "../strength/strength.module.css";
import { LabForm } from "./lab-form";

const RETEST_AFTER_DAYS = 182;

export default function LabsPage() {
  return (
    <>
      <AppPage>
        <header className={base.header}>
          <Link href="/log" className={base.back}>
            ‹ Log
          </Link>
          <h1 className={base.title}>Labs</h1>
        </header>
        <Suspense fallback={<p className={base.sub}>Loading…</p>}>
          <LabsContent />
        </Suspense>
      </AppPage>
      <TabBar active="log" />
    </>
  );
}

function ago(days: number): string {
  if (days < 30)
    return days <= 0 ? "today" : `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30.44);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

async function LabsContent() {
  if (!(await requireSession())) redirect("/login");
  const tz = getEnv().OWNER_TZ;
  const now = new Date();
  const panels = await listLabPanels(getDb(), now, tz);
  const known = (await listMarkers(getDb())).map((m) => m.marker);
  const stale = panels.length > 0 && panels[0].ageDays > RETEST_AFTER_DAYS;
  return (
    <>
      {stale ? (
        <p className={styles.nudge} role="status">
          Labs are over 6 months old — consider a retest
        </p>
      ) : null}
      <section className={base.card}>
        <h2 className={base.cardTitle}>New Panel</h2>
        <LabForm today={localDate(now, tz)} known={known} />
      </section>
      <section className={base.card}>
        <h2 className={base.cardTitle}>Panels</h2>
        {panels.length ? (
          <ul className={styles.list}>
            {panels.map((p) => (
              <li key={p.id} className={styles.item}>
                <Link href={`/log/labs/${p.id}`} className={styles.itemMain}>
                  <span className={styles.itemTitle}>{p.drawnOn}</span>
                  <span className={styles.itemSub}>
                    {ago(p.ageDays)} · {p.markerCount} marker
                    {p.markerCount === 1 ? "" : "s"}
                  </span>
                </Link>
                <form action={deleteLabPanelAction.bind(null, p.id)}>
                  <DeleteButton label={`panel ${p.drawnOn}`} />
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className={base.sub}>No panels yet.</p>
        )}
      </section>
    </>
  );
}
