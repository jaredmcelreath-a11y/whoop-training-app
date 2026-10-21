import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { TabBar } from "@/components/tab-bar";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { formatCardio, recentCardio } from "@/lib/log/cardio";
import { toZonedLocal } from "@/lib/log/dates";
import { formatWhoop } from "@/lib/log/link-whoop";
import { shortDate } from "@/lib/log/strength-view";
import base from "../strength/strength.module.css";
import { deleteCardioAction } from "./actions";
import { CardioForm, DeleteCardioButton } from "./cardio-form";
import styles from "./cardio.module.css";

/** Static shell; the form's default time and the recent list stream in. */
export default function CardioPage() {
  return (
    <>
      <main className={base.page}>
        <header className={base.header}>
          <Link href="/log" className={base.back}>
            ‹ Log
          </Link>
          <h1 className={base.title}>Cardio</h1>
        </header>
        <Suspense fallback={<p className={base.sub}>Loading…</p>}>
          <CardioContent />
        </Suspense>
      </main>
      <TabBar active="log" />
    </>
  );
}

async function CardioContent() {
  if (!(await requireSession())) redirect("/login");
  const entries = await recentCardio(getDb(), 10);

  return (
    <>
      <section className={base.card}>
        <h2 className={base.cardTitle}>Log cardio</h2>
        <CardioForm defaultStart={toZonedLocal(new Date(), getEnv().OWNER_TZ)} />
      </section>
      <section className={base.card}>
        <h2 className={base.cardTitle}>Recent</h2>
        {entries.length ? (
          <ul className={base.recent}>
            {entries.map((e) => {
              const text = formatCardio(e);
              return (
                <li key={e.id} className={styles.item}>
                  <span className={styles.itemText}>
                    <span className={base.recentDate}>{shortDate(e.localDate)}</span> {text}
                    {e.whoop ? <span className={base.sub}> · {formatWhoop(e.whoop)}</span> : null}
                  </span>
                  <form action={deleteCardioAction.bind(null, e.id)} className={styles.itemForm}>
                    <DeleteCardioButton label={`${shortDate(e.localDate)} ${text}`} />
                  </form>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={base.sub}>No cardio yet.</p>
        )}
      </section>
    </>
  );
}
