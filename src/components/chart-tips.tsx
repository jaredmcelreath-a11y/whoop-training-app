"use client";

import { useRef, useState, type ReactNode } from "react";
import { tipAfter, tipPlacement, type TipAction } from "@/lib/ui/chart-tips";
import styles from "./chart-tips.module.css";

/** A dot in the chart's viewBox and what its popup says. */
export type Tip = { x: number; y: number; text: string };

/**
 * Lays tappable targets over a chart's dots (the `children` svg). Hovering a dot with a mouse
 * shows its popup; tapping a dot toggles it; tapping the popup, or Escape, closes it.
 */
export function ChartTips({
  tips,
  width,
  height,
  children,
}: {
  tips: Tip[];
  width: number;
  height: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const mouse = useRef(false);
  const act = (a: TipAction) => setOpen((o) => tipAfter(o, a));
  const shown = open === null ? null : tips[open];
  const at = shown ? tipPlacement(shown.x, shown.y, width, height) : null;

  return (
    <div className={styles.wrap} onKeyDown={(e) => e.key === "Escape" && act({ type: "close" })}>
      {children}
      {tips.map((t, i) => {
        const p = tipPlacement(t.x, t.y, width, height);
        return (
          <button
            key={i}
            type="button"
            className={styles.hit}
            style={{ left: `${p.leftPct}%`, top: `${p.topPct}%` }}
            aria-label={t.text}
            aria-expanded={open === i}
            onPointerDown={(e) => (mouse.current = e.pointerType === "mouse")}
            onPointerEnter={(e) => e.pointerType === "mouse" && act({ type: "enter", i })}
            onPointerLeave={(e) => e.pointerType === "mouse" && act({ type: "leave" })}
            onClick={() => act({ type: "tap", i, mouse: mouse.current })}
          />
        );
      })}
      {shown && at ? (
        <button
          type="button"
          className={styles.tip}
          data-align={at.align}
          data-below={at.below}
          style={{ left: `${at.leftPct}%`, top: `${at.topPct}%` }}
          onClick={() => act({ type: "close" })}
          aria-label={`${shown.text}. Close`}
        >
          {shown.text}
        </button>
      ) : null}
    </div>
  );
}
