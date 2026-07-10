"use client";

import { useActionState } from "react";
import { updatePassword } from "@/lib/auth/recovery-actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

export function UpdatePasswordForm() {
  const [state, formAction, pending] = useActionState(updatePassword, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field
        label="New password"
        name="password"
        reveal
        autoComplete="new-password"
        minLength={8}
        required
      />
      <Field
        label="Confirm password"
        name="passwordConfirmation"
        reveal
        autoComplete="new-password"
        minLength={8}
        required
      />
      {state?.error && (
        <p className="font-mono text-[12px] text-rust" aria-live="polite">
          {state.error}
        </p>
      )}
      <Button
        type="submit"
        loading={pending}
        loadingLabel="Saving password..."
        className="mt-1.5"
      >
        Save password
      </Button>
    </form>
  );
}
