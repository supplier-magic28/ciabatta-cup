"use client";

import { useActionState } from "react";
import { advanceTournament, completeTournamentFromStandings, generateTournamentFixtures } from "@/lib/tournament/actions";
import { Button } from "@/components/ui/Button";

type TournamentAction = typeof advanceTournament;

function ActionForm({
  tournamentId,
  action,
  label,
  loadingLabel,
  disabled = false,
  className = "",
  confirmation,
}: {
  tournamentId: string;
  action: TournamentAction;
  label: string;
  loadingLabel: string;
  disabled?: boolean;
  className?: string;
  confirmation?: string;
}) {
  const [state, submit, pending] = useActionState(action, undefined);
  return (
    <form action={submit} onSubmit={(event) => {
      if (confirmation && !window.confirm(confirmation)) event.preventDefault();
    }}>
      <input type="hidden" name="tournamentId" value={tournamentId} />
      {state && !state.ok && <p className="mb-2 font-mono text-[11px] text-rust" aria-live="polite">{state.error}</p>}
      {state?.ok && <p className="mb-2 font-mono text-[11px] text-green" aria-live="polite">{state.message}</p>}
      <Button type="submit" disabled={disabled} loading={pending} loadingLabel={loadingLabel} className={className}>
        {label}
      </Button>
    </form>
  );
}

export function TournamentAdminActions({
  tournamentId,
  canGenerate,
  canCompleteFromStandings,
  advanceLabel,
  advanceDisabled,
}: {
  tournamentId: string;
  canGenerate: boolean;
  canCompleteFromStandings: boolean;
  advanceLabel: string;
  advanceDisabled: boolean;
}) {
  if (canGenerate) {
    return (
      <div className="mt-4">
        <ActionForm
          tournamentId={tournamentId}
          action={generateTournamentFixtures}
          label="Generate fixtures"
          loadingLabel="Generating fixtures..."
          className="bg-crust"
        />
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-3">
      {canCompleteFromStandings && (
        <ActionForm
          tournamentId={tournamentId}
          action={completeTournamentFromStandings}
          label="Complete from standings"
          loadingLabel="Completing tournament..."
          className="bg-crust"
          confirmation="End the tournament now? The current round-robin standings will become the official final placements, and any unplayed final-stage fixtures will be skipped."
        />
      )}
      <ActionForm
        tournamentId={tournamentId}
        action={advanceTournament}
        label={advanceLabel}
        loadingLabel="Updating tournament..."
        disabled={advanceDisabled}
        confirmation={advanceLabel === "Continue to finals" ? "Continue to a full-set final and third-place match? Those results will determine the final placements." : undefined}
      />
    </div>
  );
}
