"use client";

import { Button } from "@/components/ui/Button";

export default function RouteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-[60vh] w-full max-w-lg items-center px-6 py-12">
      <section className="w-full border-2 border-ink bg-surface p-6 shadow-[4px_4px_0_var(--color-ink)]">
        <p className="font-mono text-[10px] uppercase tracking-[2px] text-rust">Something went wrong</p>
        <h1 className="mt-2 font-heading text-2xl font-bold text-ink">That page did not load.</h1>
        <p className="mt-3 font-body text-sm leading-6 text-muted">
          Your data has not been changed. Try the request again.
        </p>
        <Button type="button" onClick={reset} className="mt-5">Try again</Button>
      </section>
    </main>
  );
}
