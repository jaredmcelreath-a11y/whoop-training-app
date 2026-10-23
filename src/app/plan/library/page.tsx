import Link from "next/link";
import { redirect } from "next/navigation";
import { ScrollToHash } from "@/components/scroll-to-hash";
import { AppPage } from "@/components/ui/app-page";
import { Suspense } from "react";
import { TabBar } from "@/components/tab-bar";
import { requireSession } from "@/lib/auth/session";
import { getDb } from "@/db/client";
import { listUserSources, type UserSource } from "@/lib/library/user-sources";
import { AddSourceForm } from "./add-source-form";
import { deleteSourceAction } from "./source-actions";
import { RULES } from "@/lib/engine/rules/catalog";
import { EVIDENCE_ORDER, type Citation, type Evidence } from "@/lib/engine/rules/types";
import { AREA_LABEL, EVIDENCE_LABEL, EVIDENCE_TEXT, filterRules, humanizeParams, type ParamItem } from "@/lib/plan/view";
import { PlanHeader } from "../plan-nav";
import styles from "../plan.module.css";

const EVIDENCE_CLASS: Record<Evidence, string> = {
  consensus: styles.evConsensus,
  "meta-analysis": styles.evMeta,
  trial: styles.evTrial,
  expert: styles.evExpert,
  "n-of-1": styles.evN1,
  practice: styles.evPractice,
};

type AnyRule = {
  id: string;
  area: string;
  statement: string;
  why: string;
  params: unknown;
  evidence: Evidence;
  citations: readonly Citation[];
  caveat?: string;
};

/** Static shell; the content streams in once the session is checked. */
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default function LibraryPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <AppPage>
        <PlanHeader active="library" title="Library" />
        <Suspense fallback={<p className={styles.sub}>Loading…</p>}>
          <LibraryContent searchParams={searchParams} />
        </Suspense>
      </AppPage>
      <TabBar active="plan" />
    </>
  );
}

function EvidenceBadge({ level }: { level: Evidence }) {
  return <span className={EVIDENCE_CLASS[level]}>{EVIDENCE_LABEL[level]}</span>;
}

async function LibraryContent({ searchParams }: { searchParams: SearchParams }) {
  if (!(await requireSession())) redirect("/login");
  const sp = await searchParams;
  const all = Object.values(RULES) as readonly AnyRule[];
  const area = one(sp.area);
  const evidence = one(sp.evidence);
  const rules = filterRules(all, area, evidence);
  const href = (a: string | undefined, e: string | undefined) => {
    const q = new URLSearchParams();
    if (a) q.set("area", a);
    if (e) q.set("evidence", e);
    const s = q.toString();
    return s ? `/plan/library?${s}` : "/plan/library";
  };
  const allAreas = Object.keys(AREA_LABEL).filter((a) => all.some((r) => r.area === a));
  const areas = Object.keys(AREA_LABEL).filter((a) => rules.some((r) => r.area === a));
  const other = [...new Set(rules.map((r) => r.area))].filter((a) => !(a in AREA_LABEL));
  const mine = await listUserSources(getDb());
  const proposals = mine.filter((m) => m.proposal === "open");

  return (
    <>
      <section className={styles.card}>
        <h2 className={styles.cardTitle}>How to Read This</h2>
        <p className={styles.spaced}>
          Every rule the plan follows is listed here with its sources. Each rule&apos;s badge is the strongest kind of
          evidence that directly supports it, from strongest to weakest:
        </p>
        <ul className={styles.levels}>
          {EVIDENCE_ORDER.map((e) => (
            <li key={e}>
              <span>
                <EvidenceBadge level={e} />
              </span>
              <span>{EVIDENCE_TEXT[e]}</span>
            </li>
          ))}
        </ul>
        <p className={styles.spaced}>
          Sources marked <span className={styles.context}>context</span> are background: a different group of people,
          a mechanism, a critique or a self-experiment. They help explain a rule but do not count toward its badge.
        </p>
      </section>

      {proposals.length ? (
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Proposed Changes</h2>
          <p className={styles.spaced}>
            Sources you flagged as changing a rule. Each is checked against the rule&apos;s other evidence in a
            Claude Code session before anything changes.
          </p>
          <ul className={styles.citations}>
            {proposals.map((p) => (
              <li key={p.id} className={styles.citation}>
                <a href={`#${p.ruleId}`} className={styles.citeLink}>
                  {p.ruleId}
                </a>
                : {p.title}
                {p.note ? <span className={styles.sub}> · {p.note}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ScrollToHash />
      <nav className={styles.filters} aria-label="Filter by group">
        <Link href={href(undefined, evidence)} className={!area ? styles.filterOn : styles.filter}>
          All Groups
        </Link>
        {allAreas.map((a) => (
          <Link key={a} href={href(a, evidence)} className={area === a ? styles.filterOn : styles.filter}>
            {AREA_LABEL[a]}
          </Link>
        ))}
      </nav>
      <nav className={styles.filters} aria-label="Filter by evidence">
        <Link href={href(area, undefined)} className={!evidence ? styles.filterOn : styles.filter}>
          All Evidence
        </Link>
        {EVIDENCE_ORDER.map((e) => (
          <Link key={e} href={href(area, e)} className={evidence === e ? styles.filterOn : styles.filter}>
            {EVIDENCE_LABEL[e]}
          </Link>
        ))}
      </nav>
      {rules.length === 0 ? <p className={styles.sub}>No rules match these filters.</p> : null}

      {[...areas, ...other].filter((a) => rules.some((r) => r.area === a)).map((area) => (
        <section key={area} className={styles.card} aria-labelledby={`area-${area}`}>
          <h2 id={`area-${area}`} className={styles.cardTitle}>
            {AREA_LABEL[area] ?? area}
          </h2>
          {rules
            .filter((r) => r.area === area)
            .map((r) => (
              <RuleEntry key={r.id} r={r} mine={mine.filter((m) => m.ruleId === r.id)} />
            ))}
        </section>
      ))}
    </>
  );
}

function RuleEntry({ r, mine }: { r: AnyRule; mine: UserSource[] }) {
  const params = humanizeParams(r.params);
  return (
    <article id={r.id} className={styles.rule}>
      <div className={styles.ruleHead}>
        <EvidenceBadge level={r.evidence} />
        <span className={styles.ruleId}>{r.id}</span>
      </div>
      <p className={styles.statement}>{r.statement}</p>
      <p className={styles.ruleWhy}>{r.why}</p>
      {params.length ? (
        <>
          <p className={styles.subhead}>Numbers Used</p>
          <Params items={params} />
        </>
      ) : null}
      {r.caveat ? (
        <>
          <p className={styles.subhead}>Caveat</p>
          <p className={styles.caveat}>{r.caveat}</p>
        </>
      ) : null}
      {r.citations.length ? (
        <>
          <p className={styles.subhead}>Sources</p>
          <ul className={styles.citations}>
            {r.citations.map((c) => (
              <li key={c.url + c.title} className={styles.citation}>
                <a href={c.url} target="_blank" rel="noopener noreferrer" className={styles.citeLink}>
                  {c.authors} ({c.year}). {c.title}.
                </a>{" "}
                <span className={styles.sub}>{c.venue}</span>
                <span className={styles.citeTags}>
                  {c.evidence ? <EvidenceBadge level={c.evidence} /> : null}
                  {c.role === "context" ? <span className={styles.context}>context</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className={styles.spaced}>No direct study: this is common coaching practice.</p>
      )}
      {mine.length ? <MySources items={mine} /> : null}
      <AddSourceForm ruleId={r.id} />
    </article>
  );
}

/** Sources the owner added; shown with the rule but never counted toward its badge. */
function MySources({ items }: { items: UserSource[] }) {
  return (
    <>
      <p className={styles.subhead}>Your Sources</p>
      <ul className={styles.citations}>
        {items.map((m) => (
          <li key={m.id} className={styles.citation}>
            {m.url ? (
              <a href={m.url} target="_blank" rel="noopener noreferrer" className={styles.citeLink}>
                {m.authors ? `${m.authors} (${m.year ?? "n.d."}). ` : ""}
                {m.title}.
              </a>
            ) : (
              <span>{m.title}</span>
            )}{" "}
            {m.venue ? <span className={styles.sub}>{m.venue}</span> : null}
            <span className={styles.citeTags}>
              <span className={styles.mine}>Added by You</span>
              {m.evidence !== "context" ? <EvidenceBadge level={m.evidence as Evidence} /> : <span className={styles.context}>context</span>}
              {m.stance === "contradicts" ? <span className={styles.contradicts}>Contradicts</span> : null}
              {!m.verified ? <span className={styles.context}>Unverified</span> : null}
              {m.proposal === "open" ? <span className={styles.mine}>Change Proposed</span> : null}
            </span>
            {m.proposal === "resolved" && m.resolution ? <p className={styles.caveat}>Decision: {m.resolution}</p> : null}
            <form action={deleteSourceAction.bind(null, m.id)}>
              <button type="submit" className={styles.removeSource}>
                Remove
              </button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}

function Params({ items }: { items: ParamItem[] }) {
  return (
    <ul className={styles.params}>
      {items.map((p) => (
        <li key={p.label}>
          {"value" in p ? (
            <>
              {p.label}: <span className={styles.paramValue}>{p.value}</span>
            </>
          ) : (
            <>
              {p.label}:
              <Params items={p.children} />
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
