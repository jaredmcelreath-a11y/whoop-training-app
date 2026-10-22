import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";
import styles from "./tab-bar.module.css";

type TabKey = "today" | "day" | "plan" | "log" | "progress";

const TABS: { key: TabKey; label: string; href?: string; icon: IconName }[] = [
  { key: "today", label: "Today", href: "/", icon: "sun" },
  { key: "day", label: "Day", href: "/day", icon: "clock" },
  { key: "plan", label: "Plan", href: "/plan", icon: "flag" },
  { key: "log", label: "Log", href: "/log", icon: "plus" },
  { key: "progress", label: "Progress", href: "/progress", icon: "chart" },
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
                <Icon name={t.icon} size={20} />
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
              <Icon name={t.icon} size={20} />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
