import Link from "next/link";
import styles from "./plan.module.css";

const LINKS = [
  { key: "week", href: "/plan", label: "Week" },
  { key: "season", href: "/plan/season", label: "Season" },
  { key: "settings", href: "/plan/settings", label: "Settings" },
  { key: "library", href: "/plan/library", label: "Library" },
] as const;

/** Header and sub-navigation shared by the Plan pages. */
export function PlanHeader({ active, title }: { active: (typeof LINKS)[number]["key"]; title: string }) {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      <nav className={styles.subnav} aria-label="Plan sections">
        {LINKS.map((l) => (
          <Link
            key={l.key}
            href={l.href}
            className={l.key === active ? styles.subActive : styles.subLink}
            aria-current={l.key === active ? "page" : undefined}
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
