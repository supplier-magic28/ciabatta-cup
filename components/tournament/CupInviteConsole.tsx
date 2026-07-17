"use client";

import { useActionState } from "react";
import { sendCupInvites } from "@/lib/tournament/invites";
import { Button } from "@/components/ui/Button";

type Player = { id: string; name: string };
type Invite = { player_id: string; status: string; hold_until: string };

export function CupInviteConsole({
  tournamentId,
  players,
  participantIds,
  invites,
}: {
  tournamentId: string;
  players: Player[];
  participantIds: string[];
  invites: Invite[];
}) {
  const [state, action, pending] = useActionState(sendCupInvites, undefined);
  const invited = new Map(invites.map((invite) => [invite.player_id, invite]));
  const bench = players.filter((player) => !participantIds.includes(player.id));

  return (
    <section className="mb-8 border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_var(--color-crust)]">
      <p className="font-mono text-[9px] uppercase tracking-[2px] text-crust">Cup invitations · RSVP</p>
      <h2 className="font-heading text-2xl font-bold">Invite the bench to chase the trophy</h2>
      <p className="mt-2 text-sm text-muted">Responses show intent. You still choose and confirm the final roster at draw lock.</p>
      <form
        action={(data) => {
          const selectedDeadline = new Date(String(data.get("deadline") ?? ""));
          data.set("timezoneOffset", String(selectedDeadline.getTimezoneOffset()));
          action(data);
        }}
        className="mt-5 grid gap-4"
      >
        <input type="hidden" name="tournamentId" value={tournamentId} />
        <fieldset className="grid gap-2 sm:grid-cols-2">
          <legend className="mb-2 font-mono text-[9px] uppercase">From the bench · over-inviting is allowed</legend>
          {bench.map((player) => (
            <label key={player.id} className="flex min-h-11 items-center gap-3 border-2 border-dashed border-hairline p-3">
              <input type="checkbox" name="playerIds" value={player.id} />
              <b>{player.name}</b>
              {invited.has(player.id) && <span className="ml-auto font-mono text-[9px] uppercase text-green">{invited.get(player.id)!.status}</span>}
            </label>
          ))}
        </fieldset>
        <label className="font-mono text-[9px] uppercase">
          Respond by
          <input required type="datetime-local" name="deadline" className="mt-1 min-h-11 w-full border-2 border-ink bg-cream px-3" />
        </label>
        <div className="border-2 border-ink bg-row p-3 font-mono text-[10px]">Email + Zeus notification · Claymore artwork · saved cup-photo frame preserved</div>
        <Button loading={pending} loadingLabel="Sending invitations…">Send invitations</Button>
        {state && <p aria-live="polite" className={`font-mono text-[10px] ${state.ok ? "text-green" : "text-rust"}`}>{state.ok ? state.message : state.error}</p>}
      </form>
    </section>
  );
}
