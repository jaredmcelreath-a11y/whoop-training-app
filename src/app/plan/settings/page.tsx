import { redirect } from "next/navigation";
import { AppPage } from "@/components/ui/app-page";
import { Suspense } from "react";
import { TabBar } from "@/components/tab-bar";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { getPlanSettings } from "@/lib/plan/settings";
import { longDate } from "@/lib/plan/view";
import { PlanHeader } from "../plan-nav";
import styles from "../plan.module.css";
import { PlanSettingsForm } from "./settings-form";

/** Static shell; the settings (session + DB read) stream in. */
export default function PlanSettingsPage() {
  return (
    <>
      <AppPage>
        <PlanHeader active="settings" title="Plan settings" />
        <Suspense fallback={<p className={styles.sub}>Loading…</p>}>
          <SettingsContent />
        </Suspense>
      </AppPage>
      <TabBar active="plan" />
    </>
  );
}

async function SettingsContent() {
  if (!(await requireSession())) redirect("/login");
  const settings = await getPlanSettings(getDb(), new Date(), getEnv().OWNER_TZ);
  return (
    <section className={styles.card}>
      <p className={styles.spaced}>
        Season start: {longDate(settings.seasonStart)}. Saving re-plans every week from today on; past and completed
        sessions stay as they are.
      </p>
      <PlanSettingsForm settings={settings} />
    </section>
  );
}
