import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { requireSession } from "@/lib/auth/session";
import { inlineParts, parseGuide } from "@/lib/nutrition/guide-render";
import { GUIDE_MD } from "@/lib/nutrition/shortcut-guide";
import styles from "../nutrition.module.css";

export default function ShortcutGuidePage() {
  return (
    <main className={styles.page}>
      <Link href="/settings/nutrition" className={styles.back}>
        ← Nutrition
      </Link>
      <Suspense fallback={<p className={styles.sub}>Loading…</p>}>
        <Guide />
      </Suspense>
    </main>
  );
}

function Inline({ text }: { text: string }): ReactNode {
  return inlineParts(text).map((p, i) =>
    p.kind === "code" ? (
      <code key={i} className={styles.inlineCode}>{p.text}</code>
    ) : p.kind === "bold" ? (
      <strong key={i}>{p.text}</strong>
    ) : (
      <span key={i}>{p.text}</span>
    ),
  );
}

async function Guide() {
  if (!(await requireSession())) redirect("/login");
  const blocks = parseGuide(GUIDE_MD);
  return (
    <article className={styles.guideDoc}>
      {blocks.map((b, i) => {
        switch (b.type) {
          case "heading":
            return b.level === 1 ? (
              <h1 key={i} className={styles.title}><Inline text={b.text} /></h1>
            ) : (
              <h2 key={i} className={styles.guideH}><Inline text={b.text} /></h2>
            );
          case "para":
            return <p key={i} className={styles.guideP}><Inline text={b.text} /></p>;
          case "ul":
            return (
              <ul key={i} className={styles.guideList}>
                {b.items.map((t, j) => <li key={j}><Inline text={t} /></li>)}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} start={b.start} className={styles.guideList}>
                {b.items.map((t, j) => <li key={j}><Inline text={t} /></li>)}
              </ol>
            );
          case "code":
            return <pre key={i} className={styles.guide}>{b.text}</pre>;
          case "table":
            return (
              <div key={i} className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead><tr>{b.head.map((h, j) => <th key={j}><Inline text={h} /></th>)}</tr></thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>{r.map((c, k) => <td key={k}><Inline text={c} /></td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </article>
  );
}
