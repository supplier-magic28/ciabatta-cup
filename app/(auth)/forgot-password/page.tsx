import Link from "next/link";
import { PasswordResetRequestForm } from "@/components/auth/PasswordResetRequestForm";

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-bold tracking-[1px] text-ink">
          Reset password
        </h1>
        <p className="font-body text-sm leading-6 text-muted">
          Enter your email and we will send a secure link to choose a new password.
        </p>
      </div>
      <PasswordResetRequestForm />
      <p className="text-center font-mono text-[11px] text-muted">
        <Link href="/sign-in" className="font-bold text-green">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
