"use client";

import { useActionState } from "react";
import { replaceTournamentParticipant } from "@/lib/tournament/actions";
import { Button } from "@/components/ui/Button";

type Participant = { id: string; seed: number; name: string };
type PlayerOption = { id: string; name: string };

export function TournamentParticipantEditor({
  tournamentId,
  participants,
  activePlayers,
}: {
  tournamentId: string;
  participants: Participant[];
  activePlayers: PlayerOption[];
}) {
  const [state, submit, pending] = useActionState(replaceTournamentParticipant, undefined);
  const availablePlayers = activePlayers.filter((player) => !participants.some((participant) => participant.id === player.id));

  return (
    <section className="mb-7 border-2 border-ink bg-row p-4">
      <p className="font-mono text-[10px] uppercase tracking-[2px] text-crust">Pre-play field change</p>
      <p className="mt-2 max-w-2xl font-body text-sm text-muted">
        Replace a player before the first result. Their seed is preserved and the complete round-robin draw is regenerated.
      </p>
      <form action={submit} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <label className="grid gap-1 font-mono text-[10px] uppercase tracking-[1px] text-muted">
          Player leaving
          <select name="outgoingPlayerId" defaultValue="" className="min-h-11 border-2 border-ink bg-surface px-3 font-body text-sm text-ink">
            <option value="" disabled>Select player</option>
            {participants.map((participant) => <option key={participant.id} value={participant.id}>{participant.seed}. {participant.name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 font-mono text-[10px] uppercase tracking-[1px] text-muted">
          Replacement
          <select name="replacementPlayerId" defaultValue="" className="min-h-11 border-2 border-ink bg-surface px-3 font-body text-sm text-ink">
            <option value="" disabled>Select active player</option>
            {availablePlayers.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
          </select>
        </label>
        <Button type="submit" loading={pending} loadingLabel="Replacing player..." className="min-h-11 sm:whitespace-nowrap">
          Replace and redraw
        </Button>
      </form>
      {state && !state.ok && <p className="mt-3 font-mono text-xs text-[#a33b2f]" role="alert">{state.error}</p>}
      {state?.ok && <p className="mt-3 font-mono text-xs text-crust" role="status">{state.message}</p>}
    </section>
  );
}
