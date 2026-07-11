"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createTournament } from "@/lib/tournament/actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";

interface PlayerOption { id: string; name: string }

function preferredPlayer(players: PlayerOption[], term: string, fallback: number): string {
  return players.find((player) => player.name.toLowerCase().includes(term))?.id ?? players[fallback]?.id ?? "";
}

export function NewTournamentForm({ players }: { players: PlayerOption[] }) {
  const [state, action, pending] = useActionState(createTournament, undefined);
  const defaults = ["ben", "string", "michael", "ringo"].map((term, index) => preferredPlayer(players, term, index));
  const selectClass = "w-full rounded-[8px] border-2 border-ink bg-surface px-4 py-3 font-body text-[15px] text-ink outline-none focus:ring-2 focus:ring-green";

  return (
    <form
      action={(formData) => {
        formData.set("timezoneOffset", String(new Date().getTimezoneOffset()));
        action(formData);
      }}
      className="flex flex-col gap-4"
    >
      <Field label="Tournament name" name="name" defaultValue="Ciabatta Qualifier" required />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start" name="startsAtLocal" type="datetime-local" defaultValue="2026-07-11T10:30" required />
        <Field label="Courts" name="courts" type="number" min={1} max={20} defaultValue={2} required />
      </div>
      <Field label="Venue" name="locationName" defaultValue="Northcote Tennis Club" required />

      <fieldset className="border-t-2 border-hairline pt-4">
        <legend className="mb-3 font-mono text-[10px] uppercase tracking-[2px] text-muted">Seed order</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <label key={index} className="block">
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[2px] text-muted">Seed {index + 1}</span>
              <select name="participantIds" defaultValue={defaults[index]} className={selectClass} required>
                <option value="">Select player</option>
                {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
              </select>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="border-2 border-hairline bg-row p-4 font-mono text-[11px] leading-5 text-muted">
        Round robin: first to 3 games. The director can finish from the standings or continue to a full-set final and third-place match. Every played result is ranked Elo.
      </div>
      {state && !state.ok && <p className="font-mono text-[12px] text-rust" aria-live="polite">{state.error}</p>}
      {state?.ok && state.tournamentId ? (
        <Link href={`/admin/tournaments/${state.tournamentId}`} className="rounded-[8px] border-2 border-ink bg-green px-5 py-4 text-center font-heading font-bold tracking-[1px] text-cream shadow-[3px_3px_0_var(--color-ink)]">
          Review tournament
        </Link>
      ) : (
        <Button type="submit" loading={pending} loadingLabel="Creating tournament...">Create tournament</Button>
      )}
    </form>
  );
}
