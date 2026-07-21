"use client";

import { useActionState } from "react";
import { advanceTournament, completeTournamentFromStandings, generateTournamentFixtures, overrideTournamentFinal } from "@/lib/tournament/actions";
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
  qualificationOverridePlayers,
}: {
  tournamentId: string;
  canGenerate: boolean;
  canCompleteFromStandings: boolean;
  advanceLabel: string;
  advanceDisabled: boolean;
  qualificationOverridePlayers?: Array<{ id: string; name: string }>;
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
      {qualificationOverridePlayers && (
        <DirectorFinalOverride tournamentId={tournamentId} players={qualificationOverridePlayers} />
      )}
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

function DirectorFinalOverride({
  tournamentId,
  players,
}: {
  tournamentId: string;
  players: Array<{ id: string; name: string }>;
}) {
  const [state, submit, pending] = useActionState(overrideTournamentFinal, undefined);
  return (
    <form
      action={submit}
      className="border-2 border-rust bg-surface p-3"
      onSubmit={(event) => {
        if (!window.confirm("Replace the unplayed qualification decider with this best-of-three final? The other two players will finish third and fourth in their current table order.")) event.preventDefault();
      }}
    >
      <input type="hidden" name="tournamentId" value={tournamentId} />
      <p className="font-mono text-[10px] uppercase tracking-[1px] text-rust">Director final override</p>
      <p className="mt-1 font-body text-xs text-muted">Keeps every group score. The remaining players finish third and fourth in current table order.</p>
      <div className="mt-3 grid gap-2">
        <label className="font-mono text-[9px] uppercase text-muted">
          Finalist one
          <select name="finalistOneId" defaultValue={players[0]?.id} className="mt-1 w-full border-2 border-ink bg-cream p-2 font-body text-xs">
            {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
          </select>
        </label>
        <label className="font-mono text-[9px] uppercase text-muted">
          Finalist two
          <select name="finalistTwoId" defaultValue={players[1]?.id} className="mt-1 w-full border-2 border-ink bg-cream p-2 font-body text-xs">
            {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
          </select>
        </label>
        <label className="font-mono text-[9px] uppercase text-muted">
          Reason
          <textarea name="reason" required minLength={10} maxLength={500} rows={2} placeholder="Why the director is bypassing qualification" className="mt-1 w-full resize-y border-2 border-ink bg-cream p-2 font-body text-xs" />
        </label>
      </div>
      {state && !state.ok && <p className="mt-2 font-mono text-[10px] text-rust" aria-live="polite">{state.error}</p>}
      {state?.ok && <p className="mt-2 font-mono text-[10px] text-green" aria-live="polite">{state.message}</p>}
      <Button type="submit" loading={pending} loadingLabel="Creating final..." className="mt-3 bg-rust text-cream">
        Seed best-of-three final
      </Button>
    </form>
  );
}
