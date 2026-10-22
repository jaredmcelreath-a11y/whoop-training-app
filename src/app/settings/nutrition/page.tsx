import { headers } from "next/headers";
import { Page } from "@/components/ui/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { TabBar } from "@/components/tab-bar";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { ingestUrl, maskToken } from "@/lib/nutrition/form";
import { getNutritionSettings } from "@/lib/nutrition/settings";
import { NutritionSettingsForm } from "./form";
import { IngestSection } from "./ingest-section";
import styles from "./nutrition.module.css";

/** Static shell; the settings (session + DB read) stream in. */
export default function NutritionSettingsPage() {
  return (
    <>
      <Page>
        <Link href="/settings" className={styles.back}>
          ← Settings
        </Link>
        <h1 className={styles.title}>Nutrition</h1>
        <Suspense fallback={<p className={styles.sub}>Loading…</p>}>
          <Content />
        </Suspense>
      </Page>
      <TabBar active="log" />
    </>
  );
}

async function Content() {
  if (!(await requireSession())) redirect("/login");
  const settings = await getNutritionSettings(getDb());
  // Only the masked form is rendered; the full token is fetched by a server action on tap.
  const masked = maskToken(getEnv().INGEST_TOKEN);
  const url = ingestUrl(await headers());
  return (
    <>
      <NutritionSettingsForm settings={settings} />
      <IngestSection masked={masked} url={url} />
      <p className={styles.disclaimer}>
        Not medical advice. Reference intakes are published population figures. For supplements, lab results or any
        health condition, talk to your doctor or a registered dietitian.
      </p>
    </>
  );
}
