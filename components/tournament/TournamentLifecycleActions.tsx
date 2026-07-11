"use client";

import { useActionState } from "react";
import { lockTournamentDraw, sendGameDayEmail, sendLockedInEmail, sendTournamentResultEmails } from "@/lib/tournament/actions";
import { Button } from "@/components/ui/Button";

function LifecycleForm({
  tournamentId,
  action,
  label,
  loadingLabel,
  className = "",
  disabled = false,
}: {
  tournamentId: string;
  action: typeof lockTournamentDraw;
  label: string;
  loadingLabel: string;
  className?: string;
  disabled?: boolean;
}) {
  const [state, submit, pending] = useActionState(action, undefined);
  return (
    <form action={submit}>
      <input type="hidden" name="tournamentId" value={tournamentId} />
      {state && !state.ok && <p className="mb-2 font-mono text-[11px] leading-4 text-rust" aria-live="polite">{state.error}</p>}
      {state?.ok && <p className="mb-2 font-mono text-[11px] leading-4 text-green" aria-live="polite">{state.message}</p>}
      <Button type="submit" disabled={disabled} loading={pending} loadingLabel={loadingLabel} className={className}>{label}</Button>
    </form>
  );
}

export function TournamentLifecycleActions({ tournamentId, drawLocked, tournamentCompleted }: { tournamentId: string; drawLocked: boolean; tournamentCompleted: boolean }) {
  return (
    <section className="mb-7 border-2 border-ink bg-surface p-4">
      <p className="font-mono text-[10px] uppercase tracking-[2px] text-crust">Tournament messages</p>
      <h2 className="mt-1 font-heading text-xl font-bold">{drawLocked ? "Draw locked in" : "Lock the final draw"}</h2>
      <p className="mt-1 font-body text-sm leading-5 text-muted">
        {drawLocked
          ? "The field and round-robin draw can no longer be changed. Email actions only send to players who have not received that message."
          : "Review the field and fixtures first. Locking is permanent and immediately sends each player their locked-in email."}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {drawLocked ? (
          <LifecycleForm tournamentId={tournamentId} action={sendLockedInEmail} label="Send pending locked-in emails" loadingLabel="Checking deliveries..." className="bg-crust" />
        ) : (
          <LifecycleForm tournamentId={tournamentId} action={lockTournamentDraw} label="Lock draw & send emails" loadingLabel="Locking and sending..." className="bg-crust" />
        )}
        <LifecycleForm tournamentId={tournamentId} action={sendGameDayEmail} label="Send game-day email" loadingLabel="Sending game-day emails..." disabled={!drawLocked} />
        <LifecycleForm tournamentId={tournamentId} action={sendTournamentResultEmails} label="Send result emails" loadingLabel="Preparing placements and sending..." disabled={!tournamentCompleted} className="sm:col-span-2" />
      </div>
    </section>
  );
}
