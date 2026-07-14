"use client";

import { useActionState, type FormEvent } from "react";
import { deleteExternalMatch } from "@/lib/match/actions";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export function DeleteExternalMatchButton({ matchId }: { matchId: string }) {
  const [state, action, pending] = useActionState(deleteExternalMatch, undefined);
  function confirmDelete(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm("Delete this Non-Ciabatta match? Its +10 points and history will also be removed.")) event.preventDefault();
  }
  return <form action={action} onSubmit={confirmDelete} className="mt-3 border-t border-hairline pt-3">
    <input type="hidden" name="matchId" value={matchId} />
    {state?.error && <p className="mb-2 font-mono text-[11px] text-rust" aria-live="polite">{state.error}</p>}
    {state?.warning && <p className="mb-2 font-mono text-[11px] text-rust" aria-live="polite">{state.warning}</p>}
    <button type="submit" disabled={pending} aria-busy={pending || undefined} className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[1.5px] text-rust underline decoration-2 underline-offset-4 disabled:opacity-60">
      {pending && <LoadingSpinner size={12} />}{pending ? "Deleting..." : "Delete test match"}
    </button>
  </form>;
}
