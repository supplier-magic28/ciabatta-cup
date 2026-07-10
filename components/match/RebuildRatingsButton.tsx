"use client";

import { useState, useTransition } from "react";
import { rebuildRatings } from "@/lib/match/actions";

/** Admin recovery control for recomputing every rebuildable scoring cache. */
export function RebuildRatingsButton() {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await rebuildRatings();
            setMessage(result.ok ? "Ratings rebuilt." : result.error);
          });
        }}
        className="rounded-[8px] border-2 border-ink bg-surface px-3 py-2 font-heading text-[12px] font-bold tracking-[1px] text-ink shadow-[2px_2px_0_var(--color-ink)] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        Rebuild ratings
      </button>
      {message && <p className="font-mono text-[10px] text-muted">{message}</p>}
    </div>
  );
}
