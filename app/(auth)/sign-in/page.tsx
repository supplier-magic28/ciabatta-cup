import Link from "next/link";
import { SignInForm } from "@/components/auth/SignInForm";

export default function SignInPage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-heading text-3xl font-bold tracking-[1px] text-ink">
        Sign in
      </h1>
      <SignInForm />
      <p className="text-center font-mono text-[11px] text-muted">
        <Link href="/forgot-password" className="font-bold text-green">
          Forgot password?
        </Link>
      </p>
      <p className="text-center font-mono text-[11px] text-muted">
        <Link href="/forgot-password" className="font-bold text-green">
          Forgot password?
        </Link>
      </p>
      <p className="text-center font-mono text-[11px] text-muted">
        New player?{" "}
        <Link href="/sign-up" className="font-bold text-green">
          Create account
        </Link>
      </p>
    </div>
  );
}
