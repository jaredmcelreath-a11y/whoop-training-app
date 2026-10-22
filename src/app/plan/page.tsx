import Link from "next/link";
import { ICON_FOR_KIND, Icon } from "@/components/icon";
import { BigNum, Cap, Card } from "@/components/ui/ui";
import { AppPage } from "@/components/ui/app-page";
import type { SessionKind } from "@/db/schema";
import { getPlanSettings } from "@/lib/plan/settings";
import { titleCase } from "@/lib/ui/title-case";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { TabBar } from "@/components/tab-bar";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { RULES } from "@/lib/engine/rules/catalog";
import { getEnv } from "@/lib/env";
import { addDays, localDate, weekStart } from "@/lib/log/dates";
import { getDayPlan, getWeekPlan, holdDayView, type WeekMeta } from "@/lib/plan/service";
import {
  dayHeading,
  detailNotes,
  INTENSITY_LABEL,
  intervalsLine,
  KIND_LABEL,
  PHASE_LABEL,
  parseWeekParam,
  prescriptionLine,
  shortDay,
  structureLine,
  weekStrip,
  weeksToRace,
  WEEKDAYS,
  type RxLine,
} from "@/lib/plan/view";
import { PlanHeader } from "./plan-nav";
import { StripBox } from "./strip-box";
import styles from "./plan.module.css";

const DAYS_PER_WEEK = 7;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type ViewSession = {
  key: string;
  kind: string;
  title: string;
  durationMin: number;
  intensity: string;
  details: Record<string, unknown>;
  ruleIds: string[];
  status: "planned" | "done" | "skipped";
  reasons: { ruleId: string; text: string }[];
  adjusted: boolean;
  adjustedLabel?: string;
};

const STRIP_LABEL = { done: "Done", today: "Today", future: "Planned", missed: "Missed", rest: "Rest" } as const;

const RULE_WHY = RULES as Record<string, { why: string } | undefined>;

const INTENSITY_CLASS: Record<string, string> = {
  z1: styles.intEasy,
  z2: styles.intEasy,
  easy: styles.intEasy,
  tempo: styles.intHard,
  threshold: styles.intMax,
  intervals: styles.intMax,
  strength: styles.intStrength,
};

/** Static shell; the week (session + DB reads) streams in. */
export default function PlanPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <AppPage>
        <PlanHeader active="week" title="Plan" />
        <Suspense fallback={<p className={styles.sub}>Loading…</p>}>
          <WeekContent searchParams={searchParams} />
        </Suspense>
      </AppPage>
      <TabBar active="plan" />
    </>
  );
}

async function WeekContent({ searchParams }: { searchParams: SearchParams }) {
  if (!(await requireSession())) redirect("/login");
  const sp = await searchParams;
  const tz = getEnv().OWNER_TZ;
  const now = new Date();
  const today = localDate(now, tz);
  const ws = parseWeekParam(sp.week, today);
  const isCurrent = ws === weekStart(today);
  const db = getDb();

  // Today's sessions are adapted (with reasons); every other day shows the stored plan.
  const todayPlan = isCurrent ? await getDayPlan(db, today, now, tz) : null;
  const days = await getWeekPlan(db, ws, now, tz);

  // An active pain hold or restricted joint status also changes this week's later days, for
  // display only (stored rows are untouched; each day is adapted in full when it comes).
  const hold = todayPlan && (todayPlan.readiness.painHold || todayPlan.readiness.jointRestricted) ? todayPlan.readiness : null;

  const meta = days.flatMap((d) => d.sessions).map((s) => (s.details as { week?: WeekMeta }).week).find(Boolean);
  const settings = await getPlanSettings(db, now, tz);
  const left = weeksToRace(weekStart(today), settings.raceDate);
  const strip = weekStrip(days, today);
  const phaseName = meta ? (PHASE_LABEL[meta.phase as keyof typeof PHASE_LABEL] ?? titleCase(meta.phase)) : null;

  return (
    <>
      <Card hot>
        <Cap>{phaseName && isCurrent && meta ? `${phaseName} · Week ${meta.index + 1}` : "Race Day"}</Cap>
        <BigNum unit={left === 1 ? "Week to Race Day" : "Weeks to Race Day"}>{left}</BigNum>
        <p className={styles.countdownDate}>{dayHeading(settings.raceDate)}</p>
      </Card>

      <nav className={styles.weekNav} aria-label="Week">
        <Link href={`/plan?week=${addDays(ws, -DAYS_PER_WEEK)}`} className={styles.weekArrow} aria-label="Previous week">
          <Icon name="chevron-left" size={20} />
        </Link>
        <div className={styles.weekLabel}>
          <div className={styles.weekRange}>
            {shortDay(ws)} – {shortDay(addDays(ws, DAYS_PER_WEEK - 1))}
          </div>
          {meta ? (
            <div className={styles.weekMeta}>
              Week {meta.index + 1} · {PHASE_LABEL[meta.phase as keyof typeof PHASE_LABEL] ?? meta.phase}
              {meta.recovery ? " · Recovery Week" : ""}
              {meta.gainPhase ? " · Gain Phase" : ""}
            </div>
          ) : null}
          {!isCurrent ? (
            <Link href="/plan" className={styles.thisWeek}>
              Back to This Week
            </Link>
          ) : null}
        </div>
        <Link href={`/plan?week=${addDays(ws, DAYS_PER_WEEK)}`} className={styles.weekArrow} aria-label="Next week">
          <Icon name="chevron-right" size={20} />
        </Link>
      </nav>

      <ol className={styles.strip} aria-label="This week at a glance">
        {days.map((d, i) => (
          <li
            key={d.date}
            className={styles.stripDay}
            data-state={strip[i]}
            aria-label={`${WEEKDAYS[i]}: ${STRIP_LABEL[strip[i]]}`}
          >
            <StripBox state={strip[i]} />
            <span className={styles.stripInitial} aria-hidden="true">
              {WEEKDAYS[i][0]}
            </span>
          </li>
        ))}
      </ol>

      {hold?.painHold ? (
        <p className={styles.banner} role="status">
          Pain hold active: runs and jumps are swapped. Log your pain daily to clear it.
        </p>
      ) : hold ? (
        <p className={styles.banner} role="status">
          Joint status restricted: runs and jumps are swapped. Change it in{" "}
          <Link href="/plan/settings" className={styles.whyLink}>
            Plan Settings
          </Link>
          .
        </p>
      ) : null}

      {days.every((d) => d.sessions.length === 0) ? (
        <p className={styles.emptyWeek}>No sessions planned this week. It may be outside the season, or in the past.</p>
      ) : null}

      {days.map((d) => {
        const isToday = d.date === today;
        const sessions: ViewSession[] =
          isToday && todayPlan
            ? todayPlan.sessions.map((s) => ({ ...s, key: s.id }))
            : hold && d.date > today
              ? holdDayView(d.sessions, hold).map((s) => ({ ...s, key: s.id, adjustedLabel: "Changed for the Hold" }))
              : d.sessions.map((s) => ({
                key: s.id,
                kind: s.kind,
                title: s.title,
                durationMin: s.durationMin,
                intensity: s.intensity,
                details: s.details as Record<string, unknown>,
                ruleIds: s.ruleIds,
                status: s.status,
                reasons: [],
                adjusted: false,
              }));
        return (
          <Card key={d.date} className={isToday ? styles.dayToday : undefined}>
            <div className={styles.dayHead}>
              <h2 className={styles.dayName}>{dayHeading(d.date)}</h2>
              {isToday ? <span className={styles.todayBadge}>Today</span> : null}
              {isToday && todayPlan && todayPlan.readiness.color !== "unknown" ? (
                <span className={styles.colorBadge}>Recovery: {titleCase(todayPlan.readiness.color)}</span>
              ) : null}
            </div>
            {sessions.length ? (
              <ul className={styles.sessions}>
                {sessions.map((s) => (
                  <Session key={s.key} s={s} />
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>Nothing Planned</p>
            )}
          </Card>
        );
      })}
    </>
  );
}

function Session({ s }: { s: ViewSession }) {
  const rx = s.details.prescription as RxLine[] | undefined;
  const iv = s.details.intervals as { runMin: number; walkMin: number; reps: number } | undefined;
  const st = s.details.structure as { warmUpMin: number; hardMin: number; coolDownMin: number } | undefined;
  const notes = detailNotes(s.details);
  const why = [...new Set([...s.ruleIds, ...s.reasons.map((r) => r.ruleId)])];

  return (
    <li className={styles.session}>
      <details>
        <summary className={styles.summary}>
          <span className={styles.sessionTop}>
            <span className={styles.kind}>
              <Icon name={ICON_FOR_KIND[s.kind as SessionKind] ?? "flag"} size={14} />
              {KIND_LABEL[s.kind] ?? titleCase(s.kind)}
            </span>
            <span className={styles.sessionTitle}>{titleCase(s.title)}</span>
          </span>
          <span className={styles.sessionMeta}>
            {s.durationMin > 0 ? <span>{s.durationMin} min</span> : null}
            {s.kind !== "rest" ? (
              <span className={INTENSITY_CLASS[s.intensity] ?? styles.badge}>{INTENSITY_LABEL[s.intensity] ?? s.intensity}</span>
            ) : null}
            {s.status === "done" ? <span className={styles.done}><Icon name="check" /> Done</span> : null}
            {s.status === "skipped" ? <span className={styles.skipped}>Skipped</span> : null}
            {s.adjusted ? <span className={styles.adjusted}>{s.adjustedLabel ?? "Adjusted Today"}</span> : null}
          </span>
        </summary>
        <div className={styles.sessionBody}>
          {s.reasons.length ? (
            <ul className={styles.reasons}>
              {s.reasons.map((r, i) => (
                <li key={i}>{r.text}</li>
              ))}
            </ul>
          ) : null}
          {rx?.length ? (
            <ul className={styles.lines}>
              {rx.map((p, i) => (
                <li key={i} className={styles.line}>
                  {prescriptionLine(p)}
                  {p.note ? <span className={styles.lineNote}>{p.note}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {iv ? <p className={styles.line}>{intervalsLine(iv)}</p> : null}
          {st ? <p className={styles.line}>{structureLine(st, INTENSITY_LABEL[s.intensity]?.toLowerCase() ?? s.intensity)}</p> : null}
          {notes.length ? (
            <ul className={styles.lines}>
              {notes.map((n, i) => (
                <li key={i} className={styles.lineNote}>
                  {n}
                </li>
              ))}
            </ul>
          ) : null}
          {why.length ? (
            <div>
              <p className={styles.whyTitle}>Why</p>
              <ul className={styles.whyList}>
                {why.map((id) => (
                  <li key={id}>
                    <a href={`/plan/library#${id}`} className={styles.whyLink}>
                      {RULE_WHY[id]?.why ?? id}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </details>
    </li>
  );
}
