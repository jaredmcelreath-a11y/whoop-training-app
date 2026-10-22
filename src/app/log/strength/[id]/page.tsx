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
import { getSession, lastTime, listExercises } from "@/lib/log/strength";
import {
  formatLastTime,
  nextSetDefaults,
  parseExList,
  shortDate,
} from "@/lib/log/strength-view";
import { deleteWorkout, finishWorkout, removeSetAction } from "../actions";
import styles from "../strength.module.css";
import { AddExerciseForm, DeleteWorkoutButton, SetRow } from "./set-row";

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

  // Exercises in the session, in order (always shown), then the ones picked via ?ex= that have
  // no sets yet, in pick order.
  const blocks: { exerciseId: string; name: string }[] = [];
  for (const s of sets) {
    if (!blocks.some((b) => b.exerciseId === s.exerciseId)) {
      blocks.push({ exerciseId: s.exerciseId, name: s.exerciseName });
    }
  }
  const all = await listExercises(db);
  const exList = parseExList((await searchParams).ex);
  if (!finished) {
    for (const exId of exList) {
      const picked = all.find((e) => e.id === exId);
      if (picked && !blocks.some((b) => b.exerciseId === picked.id)) {
        blocks.push({ exerciseId: picked.id, name: picked.name });
      }
    }
  }
  const exParam = exList.join(",");
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
        return (
          <section key={b.exerciseId} className={styles.card}>
            <h2 className={styles.exName}>{b.name}</h2>
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
            {finished ? null : (
              <SetRow
                sessionId={id}
                exerciseId={b.exerciseId}
                setIndex={next.setIndex}
                reps={next.reps}
                weightLb={next.weightLb}
                initialClientId={crypto.randomUUID()}
              />
            )}
          </section>
        );
      })}

      {finished ? null : (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Add Exercise</h2>
          <form method="get" className={styles.inline}>
            {/* Sent alongside the pick (?ex=<list>&ex=<new>) so earlier picks stay on screen. */}
            {exParam ? <input type="hidden" name="ex" value={exParam} /> : null}
            <select name="ex" aria-label="Exercise" className={styles.select} required defaultValue="">
              <option value="" disabled>
                Pick an exercise
              </option>
              {pickable.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
            <button type="submit" className={styles.secondary}>
              Add
            </button>
          </form>
          <AddExerciseForm sessionId={id} exList={exParam} />
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
