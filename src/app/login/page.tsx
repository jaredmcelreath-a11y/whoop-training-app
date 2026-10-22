import { Icon } from "@/components/icon";
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
          <span className={styles.mark}>
            <Icon name="pulse" size={30} />
          </span>
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
