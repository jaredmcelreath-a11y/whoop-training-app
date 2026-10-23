"use client";

import Link from "next/link";
import { useState } from "react";
import { appendEx, filterExercises } from "@/lib/log/strength-view";
import styles from "../strength.module.css";
import { AddExerciseForm } from "./set-row";

/**
 * "Add Exercise": a searchable list of exercises not on the page yet (each a link that adds it),
 * with "Create New" at the bottom for one that isn't in the list.
 */
export function ExercisePicker({
  sessionId,
  exList,
  exercises,
}: {
  sessionId: string;
  exList: string[];
  exercises: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const shown = filterExercises(exercises, query);
  return (
    <details className={styles.picker}>
      <summary className={styles.pickerSummary}>Add Exercise</summary>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search exercises"
        aria-label="Search exercises"
        autoComplete="off"
        className={styles.input}
      />
      <ul className={styles.pickList}>
        {shown.map((e) => (
          <li key={e.id}>
            <Link href={`/log/strength/${sessionId}?ex=${appendEx(exList, e.id)}`} className={styles.pickLink}>
              {e.name}
            </Link>
          </li>
        ))}
        {shown.length === 0 ? <li className={styles.sub}>No match. Create it below.</li> : null}
      </ul>
      <p className={styles.subhead}>Create New</p>
      <AddExerciseForm sessionId={sessionId} exList={exList.join(",")} />
    </details>
  );
}
