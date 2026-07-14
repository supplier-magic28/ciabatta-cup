"use client";

import { useState, useTransition } from "react";
import { approveMatch, queryMatch, rejectMatch, type MatchActionResult } from "@/lib/match/actions";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

const base =
  "inline-flex min-w-[108px] items-center justify-center gap-2 rounded-[8px] border-2 border-ink px-3 py-2 font-heading text-[12px] font-bold " +
  "tracking-[1px] shadow-[2px_2px_0_var(--color-ink)] active:translate-x-[2px] " +
  "active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Admin approve / query / reject controls for a `pending_approval` match
 * (Phase 3c-part-2). Each calls the matching admin server action.
 */
export function ApprovalActions({ matchId }: { matchId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<"approve" | "query" | "reject" | null>(null);

  const run = (kind: "approve" | "query" | "reject", action: (id: string) => Promise<MatchActionResult>) => {
    setError(null);
    setPendingAction(kind);
    startTransition(async () => {
      try {
        const result = await action(matchId);
        if (!result.ok) setError(result.error);
        else if (result.warning) setError(result.warning);
      } finally {
        setPendingAction(null);
      }
    });
  };

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          aria-busy={pendingAction === "approve" || undefined}
          onClick={() => run("approve", approveMatch)}
          className={`${base} bg-green text-cream`}
        >
          {pendingAction === "approve" && <LoadingSpinner size={13} />}
          {pendingAction === "approve" ? "Approving..." : "Approve"}
        </button>
        <button
          type="button"
          disabled={pending}
          aria-busy={pendingAction === "query" || undefined}
          onClick={() => run("query", queryMatch)}
          className={`${base} bg-surface text-crust`}
        >
          {pendingAction === "query" && <LoadingSpinner size={13} />}
          {pendingAction === "query" ? "Querying..." : "Query"}
        </button>
        <button
          type="button"
          disabled={pending}
          aria-busy={pendingAction === "reject" || undefined}
          onClick={() => run("reject", rejectMatch)}
          className={`${base} bg-surface text-rust`}
        >
          {pendingAction === "reject" && <LoadingSpinner size={13} />}
          {pendingAction === "reject" ? "Rejecting..." : "Reject"}
        </button>
      </div>
      {error && <p className="mt-1 font-mono text-[11px] text-rust" aria-live="polite">{error}</p>}
    </div>
  );
}
