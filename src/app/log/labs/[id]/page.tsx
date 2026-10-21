import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { TabBar } from "@/components/tab-bar";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getLabPanel, markerHistory } from "@/lib/log/records";
import styles from "../../records.module.css";
import base from "../../strength/strength.module.css";

export default function LabPanelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <>
      <main className={base.page}>
        <header className={base.header}>
          <Link href="/log/labs" className={base.back}>
            ‹ Labs
          </Link>
          <h1 className={base.title}>Lab panel</h1>
        </header>
        <Suspense fallback={<p className={base.sub}>Loading…</p>}>
          <PanelContent params={params} />
        </Suspense>
      </main>
      <TabBar active="log" />
    </>
  );
}

async function PanelContent({ params }: { params: Promise<{ id: string }> }) {
  if (!(await requireSession())) redirect("/login");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = getDb();
  const panel = await getLabPanel(db, id);
  if (!panel) notFound();
  const histories = await Promise.all(
    panel.results.map((r) => markerHistory(db, r.marker)),
  );
  return (
    <section className={base.card}>
      <h2 className={base.cardTitle}>
        {panel.drawnOn} · {panel.source}
      </h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Marker</th>
            <th>Value</th>
            <th>Unit</th>
            <th>Flag</th>
          </tr>
        </thead>
        <tbody>
          {panel.results.map((r, i) => {
            const h = histories[i];
            return (
              <tr key={r.marker}>
                <td>
                  {r.marker}
                  {h.length > 1 ? (
                    <div className={styles.itemSub}>
                      {h.map((p) => p.value).join(" → ")}
                    </div>
                  ) : null}
                </td>
                <td>{r.value}</td>
                <td>{r.unit}</td>
                <td>{r.flag ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
