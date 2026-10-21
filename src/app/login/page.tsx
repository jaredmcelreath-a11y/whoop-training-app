import { LoginForm } from "./form";

// Static shell; the login itself is a server action, so nothing here is cached
// per-user. (A blocking connection() call would fail the cacheComponents build.)
export default function LoginPage() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Sign in</h1>
      <LoginForm />
    </main>
  );
}
