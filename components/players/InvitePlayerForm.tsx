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
        <p className="font-mono text-[12px] text-rust">{state.error}</p>
      )}
      {state && "sent" in state && (
        <p className="font-mono text-[12px] text-green">Invite sent to {state.sent}.</p>
      )}
      <Button type="submit" disabled={pending} className="mt-1.5">
        {pending ? "Sending invite…" : "Send invite"}
      </Button>
    </form>
  );
}
