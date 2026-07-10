"use client";

import { useActionState } from "react";
import { inviteUser } from "@/lib/players/actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

/**
 * Admin invite form (design screen 08): first/last name + email, submitted to
 * the `inviteUser` server action. Follows the auth-form pattern (`useActionState`
 * over a FormData action) for progressive enhancement.
 */
export function InvitePlayerForm() {
  const [state, action, pending] = useActionState(inviteUser, undefined);

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="flex gap-3">
        <div className="flex-1">
          <Field label="First name" name="firstName" autoComplete="off" required />
        </div>
        <div className="flex-1">
          <Field label="Last name" name="lastName" autoComplete="off" required />
        </div>
      </div>
      <Field label="Email" name="email" type="email" autoComplete="off" required />
      {state && "error" in state && (
        <p className="font-mono text-[12px] text-rust" aria-live="polite">{state.error}</p>
      )}
      {state && "sent" in state && (
        <p className="font-mono text-[12px] text-green" aria-live="polite">Invite sent to {state.sent}.</p>
      )}
      <Button type="submit" loading={pending} loadingLabel="Sending invite..." className="mt-1.5">Send invite</Button>
    </form>
  );
}
