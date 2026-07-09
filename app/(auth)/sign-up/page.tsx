import Link from "next/link";
import { SignUpForm } from "@/components/auth/SignUpForm";

export default function SignUpPage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-heading text-3xl font-bold tracking-[1px] text-ink">
        Create account
      </h1>
      <SignUpForm />
      <p className="text-center font-mono text-[11px] text-muted">
        Already have an account?{" "}
        <Link href="/sign-in" className="font-bold text-green">
          Sign in
        </Link>
      </p>
    </div>
  );
}
