import { eq } from "drizzle-orm";
import { Page } from "@/components/ui/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getDb } from "@/db/client";
import { whoopConnection } from "@/db/schema";
import { ThemePicker } from "@/components/theme-picker";
import { requireSession } from "@/lib/auth/session";
import { DisconnectButton } from "./disconnect-button";
import styles from "./settings.module.css";

export default function SettingsPage() {
  return (
    <Page>
      <Link href="/" className={styles.back}>
        ← Today
      </Link>
      <h1 className={styles.title}>Settings</h1>
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>Theme</h2>
        <ThemePicker />
      </section>
      <Suspense fallback={<p className={styles.sub}>Loading…</p>}>
        <WhoopSection />
      </Suspense>
      <Link href="/settings/nutrition" className={styles.primary}>
        Nutrition Settings
      </Link>
    </Page>
  );
}

async function WhoopSection() {
  if (!(await requireSession())) redirect("/login");
  const [row] = await getDb()
    .select({ status: whoopConnection.status })
    .from(whoopConnection)
    .where(eq(whoopConnection.id, 1));

  const status = !row ? "Not connected" : row.status === "connected" ? "Connected" : "Needs reconnect";
  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>WHOOP</h2>
      <p className={styles.sub}>Status: {status}</p>
      {row ? (
        <>
          {row.status === "needs_reconnect" ? (
            <a href="/api/whoop/connect" className={styles.primary}>
              Reconnect WHOOP
            </a>
          ) : null}
          <DisconnectButton />
        </>
      ) : (
        <a href="/api/whoop/connect" className={styles.primary}>
          Connect WHOOP
        </a>
      )}
    </section>
  );
}
