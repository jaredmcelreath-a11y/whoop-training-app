import Link from "next/link";
import { BigNum, Cap, Card, Meter } from "@/components/ui/ui";
import { AppPage } from "@/components/ui/app-page";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { LineChart } from "@/components/line-chart";
import { TabBar } from "@/components/tab-bar";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { getEnv } from "@/lib/env";
import { listMarkers, type MarkerSummary } from "@/lib/log/records";
import { getBodyProgress, type BodyProgress } from "@/lib/progress/body";
import { splitAtGaps, type LiftSeries, type Point, type Range } from "@/lib/progress/series";
import { getTrainingProgress, type TrainingProgress } from "@/lib/progress/training";
import { gainLine, paceLabel, parseRange, RANGE_LABEL, RANGES, scanSplitText, shortDate, signed1 } from "@/lib/progress/view";
import styles from "./progress.module.css";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const ADHERENCE_WEEKS = 8;
const MIN_LIFT_WEEKS = 2;
const FAILED = "Couldn't load this section";

/** Static shell; the progress (session + DB reads) streams in. */
export default function ProgressPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <AppPage>
        <h1 className={styles.title}>Progress</h1>
        <Suspense fallback={<p className={styles.sub}>Loading…</p>}>
          <ProgressContent searchParams={searchParams} />
        </Suspense>
      </AppPage>
      <TabBar active="progress" />
    </>
  );
}

/** Runs a loader; a failure becomes null so its sections fail soft. */
async function safe<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (err) {
    console.error("progress section failed", err);
    return null;
  }
}

async function ProgressContent({ searchParams }: { searchParams: SearchParams }) {
  if (!(await requireSession())) redirect("/login");
  const sp = await searchParams;
  const range = parseRange(sp.range);
  const tz = getEnv().OWNER_TZ;
  const now = new Date();
  const db = getDb();

  const body = await safe(() => getBodyProgress(db, now, tz, range));
  const markers = await safe(() => listMarkers(db));
  const training = await safe(() => getTrainingProgress(db, now, tz, range));

  return (
    <>
      <nav className={styles.ranges} aria-label="Range">
        {RANGES.map((r) => (
          <Link
            key={r}
            href={`/progress?range=${r}`}
            className={r === range ? styles.rangeActive : styles.range}
            aria-current={r === range ? "page" : undefined}
          >
            {RANGE_LABEL[r]}
          </Link>
        ))}
      </nav>
      {body ? <GainCard body={body} /> : null}
      <Section title="Weight" data={body}>
        {(b) => <WeightSection body={b} />}
      </Section>
      <Section title="Body Scans" data={body}>
        {(b) => <ScansSection body={b} />}
      </Section>
      <Section title="Labs" data={markers}>
        {(m) => <LabsSection markers={m} />}
      </Section>
      <Section title="Lifts" data={training}>
        {(t) => <LiftsSection lifts={t.lifts} range={range} />}
      </Section>
      <Section title="Endurance" data={training}>
        {(t) => <EnduranceSection training={t} />}
      </Section>
      <Section title="Adherence" data={training}>
        {(t) => <AdherenceSection training={t} />}
      </Section>
    </>
  );
}

function Section<T>({ title, data, children }: { title: string; data: T | null; children: (d: T) => ReactNode }) {
  // Loader failures arrive here as null (see safe); the views below are pure.
  return (
    <Card>
      <h2 className={styles.cardTitle}>{title}</h2>
      {data === null ? <p className={styles.error}>{FAILED}</p> : children(data)}
    </Card>
  );
}

const lb1 = (x: number | null) => (x === null ? "–" : (Math.round(x * 10) / 10).toFixed(1));

function GainCard({ body }: { body: BodyProgress }) {
  const { gain } = body;
  return (
    <Card hot>
      <Cap>Gain Goal</Cap>
      {gain.gainedLb === null ? (
        <p className={styles.text}>{gainLine(gain)}</p>
      ) : (
        <>
          <BigNum unit={`/ ${gain.goalLb} lb`}>{signed1(gain.gainedLb)}</BigNum>
          <Meter value={Math.max(gain.gainedLb, 0)} max={gain.goalLb} tone="accent" label="Gain toward goal" />
          <p className={styles.text}>
            {body.rateLbPerWeek === null
              ? "Not enough weigh-ins for a rate yet."
              : `${signed1(body.rateLbPerWeek)} lb/wk` +
                (body.targetRateLbPerWeek === null ? "" : ` · target ${signed1(body.targetRateLbPerWeek)} lb/wk`)}
          </p>
        </>
      )}
    </Card>
  );
}

function WeightSection({ body }: { body: BodyProgress }) {
  const { gain } = body;
  const goal = gain.startLb !== null ? gain.startLb + gain.goalLb : undefined;
  const rate =
    body.rateLbPerWeek === null
      ? "Not enough weigh-ins for a rate yet."
      : `Rate ${signed1(body.rateLbPerWeek)} lb/wk` +
        (body.targetRateLbPerWeek === null ? "." : ` (target ${signed1(body.targetRateLbPerWeek)} lb/wk).`);
  return (
    <>
      <LineChart
        segments={splitAtGaps(body.weights)}
        secondary={splitAtGaps(body.avg7)}
        goal={goal}
        unit="lb (7-day avg)"
        label="Body weight with 7-day average and goal line"
        emptyText="Log your weight to see a chart"
        emptyHref="/log#weight"
      />
      <p className={styles.text}>{rate}</p>
      <p className={styles.text}>{gainLine(gain)}</p>
    </>
  );
}

function ScansSection({ body }: { body: BodyProgress }) {
  if (body.scans.length === 0) {
    return (
      <Link href="/log/scans" className={styles.link}>
        Log a Body Scan
      </Link>
    );
  }
  return (
    <>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Date</th>
              <th>Weight</th>
              <th>Lean</th>
              <th>Fat</th>
            </tr>
          </thead>
          <tbody>
            {[...body.scans].reverse().map((s, i) => (
              <tr key={`${s.scannedOn}-${i}`}>
                <td>{shortDate(s.scannedOn)}</td>
                <td>{lb1(s.weightLb)}</td>
                <td>{lb1(s.leanMassLb)}</td>
                <td>{lb1(s.fatMassLb)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.small}>Pounds. {scanSplitText(body.scanDelta, body.scans.length)}</p>
    </>
  );
}

function LabsSection({ markers }: { markers: MarkerSummary[] }) {
  if (markers.length === 0) {
    return (
      <Link href="/log/labs" className={styles.link}>
        Log a lab panel
      </Link>
    );
  }
  return (
    <ul className={styles.list}>
      {markers.map((m) => (
        <li key={m.marker.toLowerCase()} className={styles.row}>
          <Link href={`/progress/labs/${encodeURIComponent(m.marker)}`} className={styles.rowLink}>
            <span className={styles.rowMain}>
              {m.marker}
              {m.latest.flag ? <span className={styles.flag}>{m.latest.flag}</span> : null}
            </span>
            <span className={styles.rowSide}>
              {m.latest.value} {m.latest.unit}
              <br />
              {shortDate(m.latest.drawnOn)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function liftText(l: LiftSeries): string {
  const last = l.weekly[l.weekly.length - 1];
  if (!last) return `${l.name}: no sets`;
  return last.topWeightLb === null
    ? `${l.name}: top ${last.topReps} reps`
    : `${l.name}: top ${last.topWeightLb} lb × ${last.topReps}`;
}

function LiftsSection({ lifts, range }: { lifts: LiftSeries[]; range: Range }) {
  if (lifts.length === 0) {
    return (
      <Link href="/log/strength" className={styles.link}>
        Log a strength session
      </Link>
    );
  }
  return (
    <>
      <p className={styles.sub}>Top set per week, last {RANGE_LABEL[range]}.</p>
      {lifts.map((l) => {
        const points: Point[] = l.weekly.flatMap((w) =>
          w.topWeightLb === null ? [] : [{ date: w.weekStart, value: w.topWeightLb }],
        );
        if (points.length < MIN_LIFT_WEEKS) {
          return (
            <p key={l.exerciseId} className={styles.text}>
              {liftText(l)}
            </p>
          );
        }
        return (
          <div key={l.exerciseId}>
            <h3 className={styles.subTitle}>{l.name}</h3>
            <LineChart segments={splitAtGaps(points)} unit="lb" label={`${l.name} top weight per week`} emptyText="" />
          </div>
        );
      })}
    </>
  );
}

const latestOf = (points: Point[]) => points[points.length - 1]?.value;

function EnduranceSection({ training }: { training: TrainingProgress }) {
  const swim = latestOf(training.swimPace);
  const run = latestOf(training.runPace);
  return (
    <>
      <h3 className={styles.subTitle}>VO2 Max</h3>
      <LineChart
        segments={splitAtGaps(training.vo2max)}
        unit="ml/kg/min"
        label="VO2 max by week"
        emptyText="Log VO2 max weekly to see a trend"
        emptyHref="/log#weekly"
      />
      <h3 className={styles.subTitle}>WHOOP Age</h3>
      <LineChart
        segments={splitAtGaps(training.whoopAge)}
        unit="yr"
        label="WHOOP Age by week"
        emptyText="Log WHOOP Age weekly to see a trend"
        emptyHref="/log#weekly"
      />
      <h3 className={styles.subTitle}>Swim Pace</h3>
      <p className={styles.sub}>Seconds per 100 yd; lower is faster.{swim !== undefined ? ` Latest ${paceLabel(swim, "100 yd")}.` : ""}</p>
      <LineChart
        segments={splitAtGaps(training.swimPace)}
        unit="s/100 yd"
        label="Swim pace per session"
        emptyText="Log swims with distance to see pace"
        emptyHref="/log/cardio"
      />
      <h3 className={styles.subTitle}>Run Pace</h3>
      <p className={styles.sub}>Seconds per mile; lower is faster.{run !== undefined ? ` Latest ${paceLabel(run, "mi")}.` : ""}</p>
      <LineChart
        segments={splitAtGaps(training.runPace)}
        unit="s/mi"
        label="Run pace per session"
        emptyText="Log runs with distance to see pace"
        emptyHref="/log/cardio"
      />
      <h3 className={styles.subTitle}>Bike Power</h3>
      <LineChart
        segments={splitAtGaps(training.bikeWatts)}
        unit="W"
        label="Bike average watts per session"
        emptyText="Log rides with average watts to see power"
        emptyHref="/log/cardio"
      />
    </>
  );
}

function AdherenceSection({ training }: { training: TrainingProgress }) {
  const weeks = training.adherence.slice(-ADHERENCE_WEEKS).reverse();
  if (weeks.length === 0) return <p className={styles.sub}>No planned sessions in this range yet.</p>;
  return (
    <ul className={styles.list}>
      {weeks.map((w) => (
        <li key={w.weekStart} className={styles.row}>
          <div className={styles.rowStatic}>
            <span className={styles.rowMain}>Week of {shortDate(w.weekStart)}</span>
            <span className={styles.rowSide}>
              {w.pct === null ? (
                "Nothing due yet"
              ) : (
                <>
                  {w.done}/{w.planned} done · {w.pct}%{w.missed ? ` · ${w.missed} missed` : ""}
                </>
              )}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
