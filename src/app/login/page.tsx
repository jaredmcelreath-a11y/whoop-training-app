import { Card, Page } from "@/components/ui/ui";
import { LoginForm } from "./form";
import styles from "./login.module.css";

// Static shell; the login itself is a server action, so nothing here is cached
// per-user. (A blocking connection() call would fail the cacheComponents build.)
export default function LoginPage() {
  return (
    <Page>
      <div className={styles.wrap}>
        <div className={styles.brand}>
          {/* The Seventy3 mark: "73" in a ring of the three legs (public/icons/logo.svg). */}
          {/* eslint-disable-next-line @next/next/no-img-element -- a fixed, tiny SVG; no optimization needed */}
          <img src="/icons/logo.svg" alt="" width={96} height={96} className={styles.logo} />
          <h1 className={styles.name}>Seventy3</h1>
          <p className={styles.tagline}>Sign In to Continue</p>
        </div>
        <Card>
          <LoginForm />
        </Card>
      </div>
    </Page>
  );
}
