"use client";

import { useActionState, useState } from "react";
import { recordTournamentResult } from "@/lib/tournament/actions";
import type { TournamentRuleset } from "@/lib/tournament/types";
import { Button } from "@/components/ui/Button";

export function TournamentResultForm({
  fixtureId,
  player1Name,
  player2Name,
  ruleset,
}: {
  fixtureId: string;
  player1Name: string;
  player2Name: string;
  ruleset: TournamentRuleset;
}) {
  const [state, action, pending] = useActionState(recordTournamentResult, undefined);
  const [reviewing, setReviewing] = useState(false);
  const inputClass = "h-12 min-w-0 rounded-[6px] border-2 border-ink bg-surface px-2 text-center font-mono text-lg font-semibold outline-none focus:ring-2 focus:ring-green";
  const fullSet = ruleset !== "short_first_to_3";
  const setCount = ruleset === "best_of_3_standard" ? 3 : 1;
  const maxGames = ruleset === "pro_set_8" ? 9 : ruleset === "short_first_to_3" ? 3 : 7;

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!reviewing) {
          event.preventDefault();
          setReviewing(true);
        }
      }}
      onChange={() => setReviewing(false)}
      className="mt-3 border-t-2 border-hairline pt-3"
    >
      <input type="hidden" name="fixtureId" value={fixtureId} />
      <div className="mb-2 grid grid-cols-2 gap-4 font-heading text-xs font-bold">
        <span className="truncate text-center">{player1Name}</span>
        <span className="truncate text-center">{player2Name}</span>
      </div>
      <div className="space-y-3">
        {Array.from({length:setCount},(_,index)=><div key={index} className="border-b border-hairline pb-3 last:border-0">
          {setCount>1&&<p className="mb-1 text-center font-mono text-[9px] uppercase text-muted">Set {index+1}{index===2?" · if needed":""}</p>}
          <div className="mx-auto grid w-fit grid-cols-[48px_18px_48px] items-center gap-2">
            <input aria-label={`${player1Name} set ${index+1} games`} className={inputClass} name={`p1Games${index+1}`} type="number" min="0" max={maxGames} required={index<2||setCount===1} />
            <span className="text-center font-mono text-muted">-</span>
            <input aria-label={`${player2Name} set ${index+1} games`} className={inputClass} name={`p2Games${index+1}`} type="number" min="0" max={maxGames} required={index<2||setCount===1} />
          </div>
          {fullSet&&<div className="mx-auto mt-2 grid w-fit grid-cols-[48px_18px_48px] items-center gap-2">
            <input aria-label={`${player1Name} set ${index+1} tie-break`} className={inputClass} name={`tiebreakP1${index+1}`} type="number" min="0" max="99" />
            <span className="text-center font-mono text-[8px] uppercase text-muted">TB</span>
            <input aria-label={`${player2Name} set ${index+1} tie-break`} className={inputClass} name={`tiebreakP2${index+1}`} type="number" min="0" max="99" />
          </div>}
        </div>)}
      </div>
      {state && !state.ok && <p className="mt-2 font-mono text-[11px] text-rust" aria-live="polite">{state.error}</p>}
      {state?.ok && <p className="mt-2 font-mono text-[11px] text-green" aria-live="polite">{state.message}</p>}
      {reviewing && <p className="mt-2 font-mono text-[10px] text-crust">Check the score. Approval makes this result immutable.</p>}
      <Button
        type="submit"
        loading={pending}
        loadingLabel="Recording result..."
        disabled={state?.ok}
        className={`mt-3 py-2.5 text-sm ${reviewing ? "bg-crust" : "bg-green"}`}
      >
        {reviewing ? "Confirm final score" : "Review score"}
      </Button>
    </form>
  );
}
