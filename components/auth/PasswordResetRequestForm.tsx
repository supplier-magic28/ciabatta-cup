"use client";

import { useActionState } from "react";
import { requestPasswordReset } from "@/lib/auth/recovery-actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

export function PasswordResetRequestForm() {
  const [state, formAction, pending] = useActionState(
    requestPasswordReset,
    undefined,
  );

  if (state && "sent" in state) {
    return (
      <p className="font-body text-sm leading-6 text-muted" aria-live="polite">
        If an account exists for that email, a reset link is on its way. Check
        the inbox and spam folder.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field label="Email" name="email" type="email" autoComplete="email" required />
      {state && "error" in state && (
        <p className="font-mono text-[12px] text-rust" aria-live="polite">
          {state.error}
        </p>
      )}
      <Button
        type="submit"
        loading={pending}
        loadingLabel="Sending reset link..."
        className="mt-1.5"
      >
        Send reset link
      </Button>
    </form>
  );
}
