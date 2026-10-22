import type { ReactNode } from "react";
import type { SessionKind } from "@/db/schema";

export type IconName =
  | "moon"
  | "pulse"
  | "scale"
  | "bike"
  | "run"
  | "swim"
  | "lift"
  | "core"
  | "mobility"
  | "rest"
  | "bolt"
  | "drop"
  | "check"
  | "close"
  | "alert"
  | "chevron-right"
  | "chevron-left"
  | "plus"
  | "sun"
  | "pill"
  | "meal"
  | "clock"
  | "flag"
  | "chart"
  | "settings";

/** Line drawings on a 24-unit grid; stroke and fill come from the Icon wrapper. */
const PATHS: Record<IconName, ReactNode> = {
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  pulse: <path d="M3 12h4l2-5 4 10 2-5h6" />,
  scale: (
    <>
      <rect x="3.5" y="4" width="17" height="16" rx="4" />
      <path d="M9 9.5a3 3 0 0 1 6 0M12 9.5l1.2-1.6" />
    </>
  ),
  bike: (
    <>
      <circle cx="6" cy="16" r="3.5" />
      <circle cx="18" cy="16" r="3.5" />
      <path d="M6 16l3.5-7h5L18 16M9.5 9l2.5 7M13 6h2.5" />
    </>
  ),
  run: (
    <>
      <circle cx="14.5" cy="4.5" r="1.8" />
      <path d="M8 21l3-6 3 2v4M6 12l3-3.5 4 1 2.5 3.5h3M11 15l-1.5-4.5" />
    </>
  ),
  swim: (
    <>
      <circle cx="16.5" cy="7" r="1.8" />
      <path d="M3 18c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0M6 14l4-4 3 2.5 3-2" />
    </>
  ),
  lift: <path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12" />,
  core: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  mobility: <path d="M12 4a2 2 0 1 0 0 .01M5 9h14M12 9v5l-4 6M12 14l4 6" />,
  rest: <path d="M4 18h16M6 18v-5a3 3 0 0 1 3-3h6a3 3 0 0 1 3 3v5M8 10V7h8v3" />,
  bolt: <path d="M13 3L5 14h6l-1 7 8-11h-6z" />,
  drop: <path d="M12 3.5c3 4 6 7 6 10.5a6 6 0 0 1-12 0c0-3.5 3-6.5 6-10.5z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  alert: (
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4M12 17v.01" />
    </>
  ),
  "chevron-right": <path d="M9 5l7 7-7 7" />,
  "chevron-left": <path d="M15 5l-7 7 7 7" />,
  plus: <path d="M12 5v14M5 12h14" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  pill: (
    <>
      <rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-35 12 12)" />
      <path d="M9.6 8.6l4.8 6.8" />
    </>
  ),
  meal: <path d="M7 3v8a2 2 0 0 0 2 2v8M7 3v5M10.5 3v6.5a2 2 0 0 1-1.5 1.9M16.5 21V3c-2 1.5-3 4-3 7v3h3" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
    </>
  ),
};

export const ICON_FOR_KIND: Record<SessionKind, IconName> = {
  swim: "swim",
  bike: "bike",
  run: "run",
  strength: "lift",
  lower_leg: "lift",
  core: "core",
  mobility: "mobility",
  rest: "rest",
};

/** A single-color line icon. Decorative unless given a `label`. */
export function Icon({ name, size = 16, label, className }: { name: IconName; size?: number; label?: string; className?: string }) {
  const a11y = label ? { role: "img", "aria-label": label } : { "aria-hidden": true as const };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      focusable="false"
      {...a11y}
    >
      {PATHS[name]}
    </svg>
  );
}
