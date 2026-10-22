import Link from "next/link";
import styles from "./tab-bar.module.css";

type TabKey = "today" | "day" | "plan" | "log" | "progress";

const TABS: { key: TabKey; label: string; href?: string }[] = [
  { key: "today", label: "Today", href: "/" },
  { key: "day", label: "Day", href: "/day" },
  { key: "plan", label: "Plan", href: "/plan" },
  { key: "log", label: "Log", href: "/log" },
  { key: "progress", label: "Progress", href: "/progress" },
];

/** Bottom navigation. Tabs without an href are disabled placeholders. */
export function TabBar({ active }: { active: TabKey }) {
  return (
    <nav className={styles.tabs} aria-label="Main">
      <div className={styles.tabsInner}>
        {TABS.map((t) => {
          if (!t.href) {
            return (
              <span key={t.key} className={styles.tab} aria-disabled="true" title="Coming soon">
                {t.label}
              </span>
            );
          }
          const isActive = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              className={isActive ? styles.tabActive : styles.tabLink}
              aria-current={isActive ? "page" : undefined}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
