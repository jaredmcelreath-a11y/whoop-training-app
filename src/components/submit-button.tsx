"use client";

import type { ComponentProps, ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * A submit button for plain server-action forms: disabled while the form is pending, so a
 * double tap sends one request. Shows `pendingLabel` (if given) while it waits.
 */
export function SubmitButton({
  children,
  pendingLabel,
  disabled,
  ...rest
}: Omit<ComponentProps<"button">, "type"> & { pendingLabel?: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button {...rest} type="submit" disabled={pending || disabled} aria-busy={pending || undefined}>
      {pending && pendingLabel !== undefined ? pendingLabel : children}
    </button>
  );
}
