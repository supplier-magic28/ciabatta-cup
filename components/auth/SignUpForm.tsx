"use client";

import { useActionState } from "react";
import { signUp } from "@/lib/auth/actions";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export function SignUpForm() {
  const [state, formAction, pending] = useActionState(signUp, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex gap-3">
        <div className="flex-1">
          <Field
            label="First name"
            name="firstName"
            autoComplete="given-name"
            required
          />
        </div>
        <div className="flex-1">
          <Field
            label="Last name"
            name="lastName"
            autoComplete="family-name"
            required
          />
        </div>
      </div>
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
        autoComplete="new-password"
        minLength={8}
        required
      />
      {state?.error && (
        <p className="font-mono text-[12px] text-rust">{state.error}</p>
      )}
      <Button type="submit" disabled={pending} className="mt-1.5">
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
