"use client";

import { useState, useTransition } from "react";
import { refreshBackendHealth } from "@/lib/health/actions";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export function HealthRefreshButton() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => startTransition(async () => {
          setError(null);
          const result = await refreshBackendHealth();
          if (!result.ok) setError(result.error);
        })}
        className="inline-flex min-w-28 items-center justify-center gap-2 border-b-2 border-green py-1 font-mono text-[10px] uppercase tracking-[1px] text-green disabled:opacity-60"
      >
        {pending && <LoadingSpinner size={12} />}
        {pending ? "Checking..." : "Refresh"}
      </button>
      {error && <p className="mt-2 font-mono text-[10px] text-rust" role="alert">{error}</p>}
    </div>
  );
}
