"use client";

import { useActionState, type FormEvent } from "react";
import { deletePlayer } from "@/lib/players/actions";

export function DeletePlayerButton({
  playerId,
  playerName,
}: {
  playerId: string;
  playerName: string;
}) {
  const [state, action, pending] = useActionState(deletePlayer, undefined);

  function confirmDelete(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`Permanently delete ${playerName}?`)) event.preventDefault();
  }

  return (
    <form action={action} onSubmit={confirmDelete} className="mt-3 border-t-2 border-hairline pt-3">
      <input type="hidden" name="playerId" value={playerId} />
      {state && "error" in state && (
        <p className="mb-2 font-mono text-[11px] text-rust" aria-live="polite">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="font-mono text-[10px] uppercase tracking-[1.5px] text-rust underline decoration-2 underline-offset-4 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Deleting..." : "Delete player"}
      </button>
    </form>
  );
}
