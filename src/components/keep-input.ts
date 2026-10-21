import { startTransition, type FormEvent } from "react";

/**
 * onSubmit handler for a `useActionState` form that must keep what was typed when the action
 * returns an error. React resets uncontrolled fields after a form *action* completes, so this
 * cancels the native submit and dispatches the FormData in a transition instead (React then
 * skips the action prop and its auto-reset; `pending` still updates). Forms clear themselves on
 * success by remounting on a key from the returned state (`savedAt`, or a set row's clientId).
 * The form's `action` prop stays as the no-JavaScript fallback.
 */
export function keepInputOnSubmit(dispatch: (formData: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => dispatch(formData));
  };
}
