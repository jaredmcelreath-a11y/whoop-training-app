import { Suspense, type ReactNode } from "react";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getTodayBand } from "@/lib/ui/today-band";
import { Page, PageGlow } from "./ui";

/** A signed-in page: the shared Page wrapper with today's recovery glow streamed in. */
export function AppPage({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <Page glow="none" title={title}>
      <Suspense fallback={null}>
        <RecoveryGlow />
      </Suspense>
      {children}
    </Page>
  );
}

async function RecoveryGlow() {
  if (!(await requireSession())) return null;
  let band = null;
  try {
    band = await getTodayBand(getDb(), new Date());
  } catch (err) {
    // The glow is decoration; a failed read must never break the page.
    console.error("getTodayBand failed:", err);
  }
  return <PageGlow glow={band ?? "accent"} />;
}
