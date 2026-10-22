import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icon";
import styles from "./ui.module.css";

export type Glow = "accent" | "good" | "caution" | "low" | "none";
export type Tone = "good" | "caution" | "low" | "info" | "accent";

/** A glow layer for streamed content that only learns its band after the shell renders (Page glow="none"). */
export function PageGlow({ glow }: { glow: Glow }) {
  return <div className={styles.glowLayer} data-glow={glow} aria-hidden="true" />;
}

/** Page wrapper: top glow, safe-area padding, width cap, optional page title. */
export function Page({ glow = "accent", title, children }: { glow?: Glow; title?: string; children: ReactNode }) {
  return (
    <main className={styles.page} data-glow={glow}>
      {title ? <h1 className={styles.pageTitle}>{title}</h1> : null}
      {children}
    </main>
  );
}

type CardProps = { hot?: boolean; as?: "section" | "div"; href?: string; className?: string; children: ReactNode };

/** A dark card; `hot` marks the one card that matters most on a screen. */
export function Card({ hot, as = "section", href, className, children }: CardProps) {
  const props = { className: [styles.card, className].filter(Boolean).join(" "), ...(hot ? { "data-hot": "true" } : {}) };
  if (href) {
    return (
      <Link href={href} {...props} data-link="true">
        {children}
      </Link>
    );
  }
  const Tag = as;
  return <Tag {...props}>{children}</Tag>;
}

/** Small uppercase letter-spaced label. */
export function Cap({ children }: { children: ReactNode }) {
  return <p className={styles.cap}>{children}</p>;
}

/** Heavy numerals with an optional small unit. */
export function BigNum({ unit, children }: { unit?: string; children: ReactNode }) {
  return (
    <p className={styles.bigNum}>
      {children}
      {unit ? <span className={styles.unit}> {unit}</span> : null}
    </p>
  );
}

/** A compact stat: label, value, and a hint. A missing value shows a dash. */
export function StatChip({
  label,
  value,
  icon,
  hint,
  href,
}: {
  label: string;
  value: string | null;
  icon?: IconName;
  hint?: string;
  href?: string;
}) {
  const body = (
    <>
      <p className={styles.chipValue}>{value ?? "—"}</p>
      <p className={styles.chipLabel}>
        {icon ? <Icon name={icon} size={12} /> : null}
        {label}
      </p>
      {hint ? <p className={styles.chipHint}>{hint}</p> : null}
    </>
  );
  return href ? (
    <Link href={href} className={styles.chip} data-link="true">
      {body}
    </Link>
  ) : (
    <div className={styles.chip}>{body}</div>
  );
}

/** A progress bar against a target; values are clamped to 0–max. */
export function Meter({ value, max, tone = "good", label }: { value: number; max: number; tone?: Tone; label: string }) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 0;
  const now = safeMax === 0 || !Number.isFinite(value) ? 0 : Math.min(Math.max(value, 0), safeMax);
  const pct = safeMax === 0 ? 0 : (now / safeMax) * 100;
  return (
    <div
      className={styles.meter}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.round(safeMax)}
      aria-valuenow={Math.round(now)}
    >
      <span className={styles.meterFill} data-tone={tone} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** A section heading; callers pass Title Case text. */
export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className={styles.sectionTitle}>{children}</h2>;
}
