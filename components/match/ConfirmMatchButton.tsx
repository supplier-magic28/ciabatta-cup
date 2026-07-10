"use client";

import { useState, useTransition } from "react";
import { confirmMatch } from "@/lib/match/actions";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

/**
 * Opponent-side confirm button (Phase 3c-part-2). Confirms a pending match the
 * current user is a participant in; the DB trigger advances the status once both
 * players have confirmed.
 */
export function ConfirmMatchButton({ matchId }: { matchId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending || undefined}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await confirmMatch(matchId);
            if (!result.ok) setError(result.error);
          });
        }}
        className={
          "inline-flex min-w-[156px] items-center justify-center gap-2 rounded-[8px] border-2 border-ink bg-green px-4 py-2 font-heading text-[13px] " +
          "font-bold tracking-[1px] text-cream shadow-[2px_2px_0_var(--color-ink)] " +
          "active:translate-x-[2px] active:translate-y-[2px] active:shadow-none " +
          "disabled:cursor-not-allowed disabled:opacity-60"
        }
      >
        {pending && <LoadingSpinner size={14} />}
        {pending ? "Confirming..." : "Confirm result"}
      </button>
      {error && <p className="mt-1 font-mono text-[11px] text-rust" aria-live="polite">{error}</p>}
    </div>
  );
}
