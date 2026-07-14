"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createTournament } from "@/lib/tournament/actions";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { CourtPicker } from "@/components/courts/CourtPicker";
import { SurfaceChips } from "@/components/courts/SurfaceChips";
import type { CourtOption, Surface } from "@/lib/courts/types";
import {TournamentCoverComposer} from "./TournamentCoverComposer";

interface PlayerOption { id: string; name: string }

export function NewTournamentForm({ players, courts: courtOptions }: { players: PlayerOption[]; courts: CourtOption[] }) {
  const [state, action, pending] = useActionState(createTournament, undefined);
  const [location, setLocation] = useState("Northcote Tennis Club");
  const [courtId, setCourtId] = useState("");
  const [surface, setSurface] = useState<Surface | "">("");
  const [seatCount,setSeatCount]=useState(4);
  const selectClass = "w-full rounded-[8px] border-2 border-ink bg-surface px-4 py-3 font-body text-[15px] text-ink outline-none focus:ring-2 focus:ring-green";

  return (
    <form
      action={(formData) => {
        formData.set("timezoneOffset", String(new Date().getTimezoneOffset()));
        action(formData);
      }}
      className="flex flex-col gap-4"
    >
      <TournamentCoverComposer/>
      <Field label="Tournament name" name="name" placeholder="Name this cup" required />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start" name="startsAtLocal" type="datetime-local" defaultValue="2026-07-11T10:30" required />
        <Field label="Courts" name="courts" type="number" min={1} max={20} defaultValue={2} required />
      </div>
      <input type="hidden" name="locationName" value={location} />
      <input type="hidden" name="courtId" value={courtId} />
      <input type="hidden" name="defaultSurface" value={surface} />
      <CourtPicker courts={courtOptions} value={location} courtId={courtId} onChange={(name,id)=>{setLocation(name);setCourtId(id)}} label="Venue" optional={false}/>
      <SurfaceChips value={surface} onChange={setSurface} preferred={courtOptions.find((court)=>court.id===courtId)?.surfaces??[]}/>

      <fieldset className="border-t-2 border-hairline pt-4">
        <legend className="mb-3 font-mono text-[10px] uppercase tracking-[2px] text-muted">Seats and seed order</legend>
        <div className="mb-4 flex items-center justify-between border-2 border-ink bg-row p-3"><span className="font-heading font-bold">{seatCount} seats</span><div className="flex gap-1"><button type="button" aria-label="Remove seat" onClick={()=>setSeatCount((value)=>Math.max(2,value-1))} className="h-9 w-9 border-2 border-ink bg-surface">−</button><button type="button" aria-label="Add seat" onClick={()=>setSeatCount((value)=>Math.min(8,value+1))} className="h-9 w-9 border-2 border-ink bg-green">+</button></div></div>
        <input type="hidden" name="seatCount" value={seatCount}/>
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({length:seatCount},(_,index) => (
            <label key={index} className="block">
              <span className="mb-1.5 block font-mono text-[10px] uppercase tracking-[2px] text-muted">Seed {index + 1}</span>
              <select name="participantIds" defaultValue="" className={`${selectClass} border-dashed`}>
                <option value="">Add later</option>
                {players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
              </select>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="border-2 border-hairline bg-row p-4 font-mono text-[11px] leading-5 text-muted">
        You can create an empty cup. Lock the schedule, choose formats and a championship path, fill every seat, then add a cover before the permanent draw lock.
      </div>
      {state && !state.ok && <p className="font-mono text-[12px] text-rust" aria-live="polite">{state.error}</p>}
      {state?.ok && state.tournamentId ? (
        <><div>{state.warnings?.map((warning)=><p key={warning} className="font-mono text-[11px] text-crust">{warning}</p>)}</div><Link href={`/admin/tournaments/${state.tournamentId}`} className="rounded-[8px] border-2 border-ink bg-green px-5 py-4 text-center font-heading font-bold tracking-[1px] text-cream shadow-[3px_3px_0_var(--color-ink)]">
          Review tournament
        </Link></>
      ) : (
        <Button type="submit" loading={pending} loadingLabel="Creating tournament...">Create tournament</Button>
      )}
    </form>
  );
}
