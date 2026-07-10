"use client";

import { useActionState } from "react";
import { completeInvite } from "@/lib/auth/invite-actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

export function AcceptInviteForm() {
  const [state, formAction, pending] = useActionState(completeInvite, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field
        label="Password"
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
      <Button type="submit" disabled={pending} className="mt-1.5">
        {pending ? "Joining the cup..." : "Join the cup"}
      </Button>
    </form>
  );
}
