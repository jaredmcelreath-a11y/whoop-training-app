import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { TabBar } from "@/components/tab-bar";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { ML_PER_FL_OZ } from "@/lib/engine/nutrients";
import { RULES } from "@/lib/engine/rules/catalog";
import { getEnv } from "@/lib/env";
import { localDate } from "@/lib/log/dates";
import { latestSweatRates } from "@/lib/nutrition/water";
import base from "../strength/strength.module.css";
import styles from "./sweat.module.css";
import { SweatForm } from "./sweat-form";

const SPORTS = [
  ["run", "Run"],
  ["bike", "Bike"],
  ["swim", "Swim"],
] as const;

/** Static shell; the latest rates and the form stream in. */
export default function SweatPage() {
  return (
    <>
      <main className={base.page}>
        <header className={base.header}>
          <Link href="/log" className={base.back}>
            ‹ Log
          </Link>
          <h1 className={base.title}>Sweat-rate test</h1>
        </header>
        <Suspense fallback={<p className={base.sub}>Loading…</p>}>
          <SweatContent />
        </Suspense>
      </main>
      <TabBar active="log" />
    </>
  );
}

async function SweatContent() {
  if (!(await requireSession())) redirect("/login");
  const rates = await latestSweatRates(getDb());
  const today = localDate(new Date(), getEnv().OWNER_TZ);
  const rule = RULES["hydration.sweatTest"];

  return (
    <>
      <section className={base.card}>
        <h2 className={base.cardTitle}>Latest rate</h2>
        {SPORTS.map(([kind, label]) => {
          const lph = rates[kind];
          return (
            <p key={kind}>
              {label}: {lph === undefined ? "no test yet" : `${Math.round((lph * 1000) / ML_PER_FL_OZ)} oz/h`}
            </p>
          );
        })}
      </section>
      <section className={base.card}>
        <h2 className={base.cardTitle}>New test</h2>
        <p className={base.sub}>
          {rule.statement}{" "}
          <a href="/plan/library#hydration.sweatTest" className={styles.whyLink}>
            Why
          </a>
        </p>
        <SweatForm today={today} />
      </section>
    </>
  );
}
