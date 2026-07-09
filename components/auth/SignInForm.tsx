"use client";

import { useActionState } from "react";
import { signIn } from "@/lib/auth/actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export function SignInForm() {
  const [state, formAction, pending] = useActionState(signIn, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      <Field
        label="Password"
        name="password"
        reveal
        autoComplete="current-password"
        required
      />
      {state?.error && (
        <p className="font-mono text-[12px] text-rust">{state.error}</p>
      )}
      <Button type="submit" disabled={pending} className="mt-1.5">
        {pending ? "Stepping on court…" : "Step on court"}
      </Button>
    </form>
  );
}
