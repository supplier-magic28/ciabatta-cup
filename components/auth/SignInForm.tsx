"use client";

import { useActionState } from "react";
import { signIn } from "@/lib/auth/actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export function SignInForm({ nextPath = "/" }: { nextPath?: string }) {
  const [state, formAction, pending] = useActionState(signIn, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={nextPath} />
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
        <p className="font-mono text-[12px] text-rust" aria-live="polite">{state.error}</p>
      )}
      <Button type="submit" loading={pending} loadingLabel="Stepping on court..." className="mt-1.5">Step on court</Button>
    </form>
  );
}
