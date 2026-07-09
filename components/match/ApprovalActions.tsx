"use client";

import { useState, useTransition } from "react";
import { approveMatch, queryMatch, rejectMatch, type MatchActionResult } from "@/lib/match/actions";

const base =
  "rounded-[8px] border-2 border-ink px-3 py-2 font-heading text-[12px] font-bold " +
  "tracking-[1px] shadow-[2px_2px_0_var(--color-ink)] active:translate-x-[2px] " +
  "active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Admin approve / query / reject controls for a `pending_approval` match
 * (Phase 3c-part-2). Each calls the matching admin server action.
 */
export function ApprovalActions({ matchId }: { matchId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: (id: string) => Promise<MatchActionResult>) => {
    setError(null);
    startTransition(async () => {
      const result = await action(matchId);
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(approveMatch)}
          className={`${base} bg-green text-cream`}
        >
          Approve
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(queryMatch)}
          className={`${base} bg-surface text-crust`}
        >
          Query
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => run(rejectMatch)}
          className={`${base} bg-surface text-rust`}
        >
          Reject
        </button>
      </div>
      {error && <p className="mt-1 font-mono text-[11px] text-rust">{error}</p>}
    </div>
  );
}
