"use client";

import { useActionState } from "react";
import { advanceTournament, generateTournamentFixtures } from "@/lib/tournament/actions";
import { Button } from "@/components/ui/Button";

export function TournamentAdminActions({ tournamentId, canGenerate }: { tournamentId: string; canGenerate: boolean }) {
  const action = canGenerate ? generateTournamentFixtures : advanceTournament;
  const [state, submit, pending] = useActionState(action, undefined);
  return (
    <form action={submit} className="mt-4">
      <input type="hidden" name="tournamentId" value={tournamentId} />
      {state && !state.ok && <p className="mb-2 font-mono text-[11px] text-rust">{state.error}</p>}
      {state?.ok && <p className="mb-2 font-mono text-[11px] text-green">{state.message}</p>}
      <Button type="submit" disabled={pending} className={canGenerate ? "bg-crust" : ""}>
        {pending ? "Working..." : canGenerate ? "Generate fixtures" : "Advance tournament"}
      </Button>
    </form>
  );
}
