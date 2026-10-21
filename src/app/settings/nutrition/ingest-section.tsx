"use client";

import Link from "next/link";
import { useState } from "react";
import { revealIngestToken } from "./actions";
import styles from "./nutrition.module.css";

const INGEST_PATH = "/api/ingest/health";

export function IngestSection({ masked }: { masked: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy — select the token and copy it by hand.");
    }
  }

  async function toggle() {
    if (token) {
      setToken(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await revealIngestToken();
      if (res.token) setToken(res.token);
      else setError("Could not reveal the token.");
    } catch {
      setError("Could not reveal the token.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>Apple Health ingest</h2>
      <p className={styles.text}>
        Your iPhone Shortcut posts Cronometer&apos;s Apple Health totals to this endpoint on the app&apos;s address:
      </p>
      <code className={styles.code}>POST {INGEST_PATH}</code>
      <p className={styles.label}>Token (sent as Authorization: Bearer)</p>
      <div className={styles.tokenRow}>
        <code className={styles.token} data-testid="token">
          {token ?? masked}
        </code>
        <button type="button" className={styles.secondary} onClick={toggle} disabled={busy}>
          {token ? "Hide" : "Reveal"}
        </button>
      </div>
      {token ? (
        <button type="button" className={styles.secondary} onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <Link href="/settings/nutrition/shortcut" className={styles.linkBtn}>
        Shortcut setup guide
      </Link>
    </section>
  );
}
