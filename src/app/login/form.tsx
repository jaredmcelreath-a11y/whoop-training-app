"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    login,
    {},
  );
  return (
    <form action={action} style={{ display: "grid", gap: 12, maxWidth: 320 }}>
      <label htmlFor="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
      />
      <button type="submit" disabled={pending}>
        {pending ? "Checking..." : "Sign in"}
      </button>
      {state.error ? <p role="alert">{state.error}</p> : null}
    </form>
  );
}
