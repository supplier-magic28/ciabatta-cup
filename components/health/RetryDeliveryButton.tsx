"use client";

import { useState, useTransition } from "react";
import { retryLifecycleDelivery } from "@/lib/health/actions";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export function RetryDeliveryButton({ idempotencyKey }: { idempotencyKey: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => startTransition(async () => {
          setMessage(null);
          const result = await retryLifecycleDelivery(idempotencyKey);
          setMessage(result.ok ? "Delivery sent." : result.error);
        })}
        className="inline-flex min-w-36 items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-chartreuse px-3 py-2 font-heading text-xs font-bold text-ink shadow-[2px_2px_0_var(--color-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:opacity-60"
      >
        {pending && <LoadingSpinner size={13} />}
        {pending ? "Retrying..." : "Retry email"}
      </button>
      {message && <p className="mt-2 font-mono text-[10px] text-muted" aria-live="polite">{message}</p>}
    </div>
  );
}
