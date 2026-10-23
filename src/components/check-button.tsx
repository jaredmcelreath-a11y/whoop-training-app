"use client";

import { useTransition } from "react";
import { toggleDoneAction } from "@/app/plan-actions";
import { Icon } from "@/components/icon";
import styles from "./check-button.module.css";

/**
 * A round check-off toggle for one planned session. `locked` means it was completed by a log
 * or a WHOOP workout, which a tap can't undo.
 */
export function CheckButton({ sessionId, done, locked }: { sessionId: string; done: boolean; locked: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={styles.check}
      data-done={done}
      aria-pressed={done}
      aria-label={done ? "Mark Not Done" : "Mark Done"}
      disabled={locked || pending}
      onClick={() => start(() => toggleDoneAction(sessionId, !done))}
    >
      {done ? <Icon name="check" size={20} /> : null}
    </button>
  );
}
