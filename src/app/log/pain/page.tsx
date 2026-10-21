import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { TabBar } from "@/components/tab-bar";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { PAIN_AREAS, painTrend } from "@/lib/log/pain";
import { shortDate } from "@/lib/log/strength-view";
import base from "../strength/strength.module.css";
import { PainForm } from "./pain-form";

/** Static shell; the form and the 14-day lists stream in. */
export default function PainPage() {
  return (
    <>
      <main className={base.page}>
        <header className={base.header}>
          <Link href="/log" className={base.back}>
            ‹ Log
          </Link>
          <h1 className={base.title}>Pain</h1>
        </header>
        <Suspense fallback={<p className={base.sub}>Loading…</p>}>
          <PainContent />
        </Suspense>
      </main>
      <TabBar active="log" />
    </>
  );
}

async function PainContent() {
  if (!(await requireSession())) redirect("/login");
  const db = getDb();
  const now = new Date();
  const tz = getEnv().OWNER_TZ;
  const trends: Record<string, string> = {};
  for (const area of PAIN_AREAS) {
    const points = await painTrend(db, area, now, tz, 14);
    // "Oct 18: 5 · Oct 19: 3"
    trends[area] = points.length
      ? points.map((p) => `${shortDate(p.date)}: ${p.max}`).join(" · ")
      : "no entries";
  }

  return (
    <section className={base.card}>
      <h2 className={base.cardTitle}>How does it feel? (0–10)</h2>
      <PainForm trends={trends} />
    </section>
  );
}
