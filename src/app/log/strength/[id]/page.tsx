import Link from "next/link";
import { AppPage } from "@/components/ui/app-page";
import { Icon } from "@/components/icon";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { SubmitButton } from "@/components/submit-button";
import { TabBar } from "@/components/tab-bar";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/auth/session";
import { formatWhoop } from "@/lib/log/link-whoop";
import { ensureExercisesByName, getSession, lastTime, listExercises } from "@/lib/log/strength";
import { getEnv } from "@/lib/env";
import { todayPrescription } from "@/lib/plan/service";
import {
  formatLastTime,
  nextSetDefaults,
  parseExList,
  plannedRowCount,
  setRowKey,
  shortDate,
  tagLine,
  targetLine,
  workoutBlocks,
} from "@/lib/log/strength-view";
import { deleteWorkout, finishWorkout, removeSetAction } from "../actions";
import styles from "../strength.module.css";
import { DeleteWorkoutButton, SetRow } from "./set-row";
import { ExercisePicker } from "./exercise-picker";

/** Static shell; the session, params and search params are runtime data and stream in. */
export default function WorkoutPage({ params, searchParams }: PageProps<"/log/strength/[id]">) {
  return (
    <>
      <AppPage>
        <header className={styles.header}>
          <Link href="/log/strength" className={styles.back}>
            ‹ Strength
          </Link>
        </header>
        <Suspense fallback={<p className={styles.sub}>Loading…</p>}>
          <Workout params={params} searchParams={searchParams} />
        </Suspense>
      </AppPage>
      <TabBar active="log" />
    </>
  );
}

async function Workout({
  params,
  searchParams,
}: Pick<PageProps<"/log/strength/[id]">, "params" | "searchParams">) {
  if (!(await requireSession())) redirect("/login");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const db = getDb();
  const data = await getSession(db, id);
  if (!data) notFound();
  const { session, sets, whoop } = data;
  const finished = session.endedAt !== null;

  // Today's planned lifts first (only for a workout logged today), then exercises logged
  // without a plan, then the ones picked via ?ex= that have no sets yet.
  const prescription = finished ? [] : await todayPrescription(db, session.localDate, new Date(), getEnv().OWNER_TZ, id);
  const byName = await ensureExercisesByName(db, prescription.map((p) => p.exercise));
  const all = await listExercises(db);
  const exList = parseExList((await searchParams).ex);
  const picks = finished ? [] : exList.flatMap((exId) => all.filter((e) => e.id === exId));
  const blocks = workoutBlocks(
    prescription.map((p) => ({ ...p, exerciseId: byName.get(p.exercise)!.id })),
    sets,
    picks,
  );
  const info = new Map(all.map((e) => [e.id, e]));
  const pickable = all.filter((e) => !blocks.some((b) => b.exerciseId === e.id));
  const histories = await Promise.all(blocks.map((b) => lastTime(db, b.exerciseId, id)));

  return (
    <>
      <h1 className={styles.title}>Workout · {shortDate(session.localDate)}</h1>
      <p className={styles.sub}>{finished ? "Finished" : "In progress"}</p>
      {whoop ? <p className={styles.sub}>{formatWhoop(whoop)}</p> : null}

      {blocks.map((b, i) => {
        const mine = sets.filter((s) => s.exerciseId === b.exerciseId);
        const next = nextSetDefaults(mine, histories[i]);
        // A first set with a planned weight starts there; later rows carry the same values.
        const weightLb = mine.length === 0 && b.planned?.targetWeightLb != null ? b.planned.targetWeightLb : next.weightLb;
        const rows = finished ? 0 : plannedRowCount(b.planned, mine.length);
        const ex = info.get(b.exerciseId);
        return (
          <section key={b.exerciseId} className={styles.card}>
            <div className={styles.exHead}>
              <h2 className={styles.exName}>{b.name}</h2>
              {ex ? <span className={styles.exTag}>{tagLine(ex.category, ex.pattern)}</span> : null}
            </div>
            {b.planned ? <p className={styles.target}>{targetLine(b.planned)}</p> : null}
            {b.planned?.note ? <p className={styles.sub}>{b.planned.note}</p> : null}
            <p className={styles.last}>{formatLastTime(histories[i])}</p>
            {mine.length ? (
              <ol className={styles.sets}>
                {mine.map((s) => (
                  <li key={s.id} className={styles.setLine}>
                    <span className={styles.setNum}>{s.setIndex + 1}</span>
                    <span className={styles.setVal}>{s.reps} reps</span>
                    <span className={styles.setVal}>
                      {s.weightLb === null ? "BW" : `${s.weightLb} lb`}
                    </span>
                    <form action={removeSetAction.bind(null, id, s.id)}>
                      <SubmitButton className={styles.remove} aria-label={`Remove set ${s.setIndex + 1}`}>
                        <Icon name="close" />
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ol>
            ) : null}
            {Array.from({ length: rows }, (_, r) => {
              const reps = next.reps ?? b.planned?.repRange[0] ?? null;
              return (
                <SetRow
                  key={setRowKey(b.exerciseId, next.setIndex + r, reps, weightLb)}
                  sessionId={id}
                  exerciseId={b.exerciseId}
                  setIndex={next.setIndex + r}
                  reps={reps}
                  weightLb={weightLb}
                  initialClientId={crypto.randomUUID()}
                />
              );
            })}
          </section>
        );
      })}

      {finished ? null : (
        <section className={styles.card}>
          <ExercisePicker
            sessionId={id}
            exList={exList}
            exercises={pickable.map((e) => ({ id: e.id, name: e.name }))}
          />
        </section>
      )}

      <div className={styles.footer}>
        {finished ? null : (
          <form action={finishWorkout.bind(null, id)}>
            <SubmitButton className={styles.primary} pendingLabel="Finishing…">
              Finish workout
            </SubmitButton>
          </form>
        )}
        <form action={deleteWorkout.bind(null, id)}>
          <DeleteWorkoutButton />
        </form>
      </div>
    </>
  );
}
