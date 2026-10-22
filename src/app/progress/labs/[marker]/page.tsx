import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LineChart } from "@/components/line-chart";
import { TabBar } from "@/components/tab-bar";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { markerResults } from "@/lib/log/records";
import { unitSplit } from "@/lib/progress/labs";
import { splitAtGaps } from "@/lib/progress/series";
import { shortDate } from "@/lib/progress/view";
import styles from "../../progress.module.css";

type Params = Promise<{ marker: string }>;

/** Lab draws are months apart: never break the line. */
const NO_GAP_BREAK = Number.POSITIVE_INFINITY;

export default function LabMarkerPage({ params }: { params: Params }) {
  return (
    <>
      <main className={styles.page}>
        <header className={styles.header}>
          <Link href="/progress" className={styles.back}>
            ‹ Progress
          </Link>
        </header>
        <Suspense fallback={<p className={styles.sub}>Loading…</p>}>
          <MarkerContent params={params} />
        </Suspense>
      </main>
      <TabBar active="progress" />
    </>
  );
}

/**
 * Next already decodes the segment; decoding again covers a still-encoded value. A value that
 * will not decode (e.g. a marker name with a literal "%") is used as-is: if it matches nothing,
 * the page shows the no-results state.
 */
function decodeMarker(raw: string): string | null {
  let v = raw;
  try {
    v = decodeURIComponent(raw);
  } catch {
    // keep raw
  }
  v = v.trim();
  return v === "" ? null : v;
}

async function MarkerContent({ params }: { params: Params }) {
  if (!(await requireSession())) redirect("/login");
  const { marker: raw } = await params;
  const marker = decodeMarker(raw);
  const history = marker === null ? [] : await markerResults(getDb(), marker);

  if (marker === null || history.length === 0) {
    return (
      <section className={styles.card}>
        <h1 className={styles.title}>No results for this marker</h1>
        <Link href="/progress" className={styles.link}>
          Back to Progress
        </Link>
      </section>
    );
  }

  const name = history[history.length - 1].marker.trim();
  const split = unitSplit(history);
  return (
    <>
      <h1 className={styles.title}>{name}</h1>
      <section className={styles.card} aria-label="Trend">
        <h2 className={styles.cardTitle}>Trend ({split.unit})</h2>
        <LineChart
          segments={splitAtGaps(split.points, NO_GAP_BREAK)}
          unit={split.unit}
          label={`${name} over time`}
          emptyText="One result so far. Log another panel to see a trend."
          emptyHref="/log/labs"
        />
        {split.otherUnits.length ? (
          <p className={styles.small}>
            Other units: {split.otherUnits.map((o) => `${o.unit} (${o.count})`).join(", ")}
          </p>
        ) : null}
      </section>
      <section className={styles.card} aria-label="Results">
        <h2 className={styles.cardTitle}>Results</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Value</th>
                <th>Unit</th>
                <th>Flag</th>
              </tr>
            </thead>
            <tbody>
              {[...history].reverse().map((r, i) => (
                <tr key={`${r.drawnOn}-${i}`}>
                  <td>{shortDate(r.drawnOn)}, {r.drawnOn.slice(0, 4)}</td>
                  <td>{r.value}</td>
                  <td>{r.unit}</td>
                  <td>{r.flag ? <span className={styles.flag}>{r.flag}</span> : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className={styles.small}>Lab values are for tracking only. Talk to your doctor about what they mean.</p>
    </>
  );
}
