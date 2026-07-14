"use client";

import {useActionState,useState} from "react";
import {configureTournamentCompetition,replaceTournamentRoster,setTournamentScheduleLock,updateTournamentSchedule} from "@/lib/tournament/actions";
import type {TournamentChampionshipPath,TournamentRuleset} from "@/lib/tournament/types";
import {Button} from "@/components/ui/Button";

type Player={id:string;name:string;avatarUrl:string|null};
const rules:Array<{value:TournamentRuleset;label:string}>=[
  {value:"short_first_to_3",label:"First to 3 games"},{value:"standard_set_tiebreak_6_all",label:"One standard set"},
  {value:"pro_set_8",label:"Pro set to 8"},{value:"best_of_3_standard",label:"Best of 3 standard sets"},
];
const paths:Array<{value:TournamentChampionshipPath;label:string;hint:string}>=[
  {value:"standings",label:"Round-robin standings",hint:"First place after all group matches; a tied 1/2 boundary goes on court."},
  {value:"top_two_final",label:"Top-two final",hint:"Top two qualify; fields of four or more also play for third."},
  {value:"top_four_finals",label:"Top-four semifinals",hint:"1 v 4 and 2 v 3, then final and third-place match. Requires four seats."},
];
function melbourneInput(iso:string){const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Australia/Melbourne",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(iso));const get=(type:Intl.DateTimeFormatPartTypes)=>parts.find((part)=>part.type===type)?.value??"";return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`}

function Feedback({state}:{state:Awaited<ReturnType<typeof updateTournamentSchedule>>|undefined}){return state?<p aria-live="polite" className={`mt-2 font-mono text-[10px] ${state.ok?"text-green":"text-rust"}`}>{state.ok?state.message:state.error}</p>:null}

export function TournamentLeadupConsole({tournament,participants,players}:{tournament:{id:string;starts_at:string;location_name:string;courts:number;default_surface:string|null;seat_count:number;schedule_locked_at:string|null;group_ruleset:TournamentRuleset;playoff_ruleset:TournamentRuleset;championship_path:TournamentChampionshipPath;cover_image_url:string|null};participants:Array<{id:string;seed:number}>;players:Player[]}){
  const [scheduleState,scheduleAction,schedulePending]=useActionState(updateTournamentSchedule,undefined);
  const [lockState,lockAction,lockPending]=useActionState(setTournamentScheduleLock,undefined);
  const [formatState,formatAction,formatPending]=useActionState(configureTournamentCompetition,undefined);
  const [rosterState,rosterAction,rosterPending]=useActionState(replaceTournamentRoster,undefined);
  const [seats,setSeats]=useState(tournament.seat_count);const [roster,setRoster]=useState<string[]>(Array.from({length:tournament.seat_count},(_,index)=>participants[index]?.id??""));
  const locked=Boolean(tournament.schedule_locked_at);const select="w-full border-2 border-ink bg-surface px-3 py-2 font-body text-sm";
  const move=(index:number,next:number)=>setRoster((current)=>{const copy=[...current];[copy[index],copy[next]]=[copy[next],copy[index]];return copy});
  return <div className="mb-8 grid gap-5 lg:grid-cols-2">
    <section className="border-2 border-ink bg-row p-4"><p className="font-mono text-[9px] uppercase tracking-[2px] text-crust">1 · Schedule</p><h2 className="font-heading text-xl font-bold">Set the day</h2>
      <form action={(data)=>{data.set("timezoneOffset",String(new Date().getTimezoneOffset()));scheduleAction(data)}} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="tournamentId" value={tournament.id}/><label className="font-mono text-[9px] uppercase">Melbourne start<input className={select} disabled={locked} type="datetime-local" name="startsAtLocal" defaultValue={melbourneInput(tournament.starts_at)} required/></label>
        <label className="font-mono text-[9px] uppercase">Courts<input className={select} disabled={locked} type="number" name="courts" min="1" max="20" defaultValue={tournament.courts}/></label>
        <label className="font-mono text-[9px] uppercase sm:col-span-2">Venue<input className={select} disabled={locked} name="locationName" defaultValue={tournament.location_name}/></label>
        <label className="font-mono text-[9px] uppercase sm:col-span-2">Surface<select className={select} disabled={locked} name="defaultSurface" defaultValue={tournament.default_surface??""}><option value="">Not recorded</option><option value="hard">Hard</option><option value="clay">Clay</option><option value="grass">Grass</option><option value="synthetic">Synthetic</option></select></label>
        {!locked&&<Button loading={schedulePending} loadingLabel="Saving…" className="sm:col-span-2">Save schedule</Button>}<Feedback state={scheduleState}/>
      </form>
      <form action={lockAction} className="mt-3"><input type="hidden" name="tournamentId" value={tournament.id}/><input type="hidden" name="locked" value={locked?"false":"true"}/><Button loading={lockPending} loadingLabel="Updating…" className={locked?"bg-crust":"bg-ink"}>{locked?"Unlock schedule":"Lock schedule"}</Button><Feedback state={lockState}/></form>
    </section>

    <section className={`border-2 border-ink p-4 ${locked?"bg-row":"bg-hairline opacity-60"}`}><p className="font-mono text-[9px] uppercase tracking-[2px] text-crust">2 · Competition</p><h2 className="font-heading text-xl font-bold">Choose the path</h2>
      <form action={formatAction} className="mt-4 space-y-3"><input type="hidden" name="tournamentId" value={tournament.id}/>
        <label className="font-mono text-[9px] uppercase">Group format<select disabled={!locked} name="groupRuleset" defaultValue={tournament.group_ruleset} className={select}>{rules.map((rule)=><option value={rule.value} key={rule.value}>{rule.label}</option>)}</select></label>
        <label className="font-mono text-[9px] uppercase">Downstream format<select disabled={!locked} name="playoffRuleset" defaultValue={tournament.playoff_ruleset} className={select}>{rules.map((rule)=><option value={rule.value} key={rule.value}>{rule.label}</option>)}</select></label>
        <fieldset><legend className="font-mono text-[9px] uppercase">Championship path</legend>{paths.map((path)=><label key={path.value} className={`mt-2 block border-2 p-3 ${path.value==="top_four_finals"&&seats<4?"opacity-40":"border-ink bg-surface"}`}><input disabled={!locked||(path.value==="top_four_finals"&&seats<4)} type="radio" name="championshipPath" value={path.value} defaultChecked={tournament.championship_path===path.value}/><b className="ml-2 font-heading">{path.label}</b><span className="mt-1 block font-mono text-[9px] text-muted">{path.hint}</span></label>)}</fieldset>
        <Button loading={formatPending} loadingLabel="Saving…" disabled={!locked}>Save competition</Button><Feedback state={formatState}/>
      </form>
    </section>

    <section className="border-2 border-ink bg-row p-4 lg:col-span-2"><div className="flex items-end justify-between"><div><p className="font-mono text-[9px] uppercase tracking-[2px] text-crust">3 · Ordered roster</p><h2 className="font-heading text-xl font-bold">Fill every seat</h2></div><div className="flex items-center gap-2"><button type="button" onClick={()=>{setSeats(Math.max(2,seats-1));setRoster((row)=>row.slice(0,Math.max(2,seats-1)))}} className="h-9 w-9 border-2 border-ink">−</button><b>{seats}</b><button type="button" onClick={()=>{const next=Math.min(8,seats+1);setSeats(next);setRoster((row)=>[...row,...Array(next-row.length).fill("")])}} className="h-9 w-9 border-2 border-ink bg-green">+</button></div></div>
      <form action={rosterAction} className="mt-4"><input type="hidden" name="tournamentId" value={tournament.id}/><input type="hidden" name="seatCount" value={seats}/><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{Array.from({length:seats},(_,index)=><div key={index} draggable onDragStart={(event)=>event.dataTransfer.setData("text/seat",String(index))} onDragOver={(event)=>event.preventDefault()} onDrop={(event)=>{event.preventDefault();const from=Number(event.dataTransfer.getData("text/seat"));if(Number.isInteger(from)&&from!==index)move(from,index)}} className={`cursor-grab border-2 p-3 ${roster[index]?"border-ink bg-surface":"border-dashed border-muted"}`}><span className="font-mono text-[9px] uppercase">Seed {index+1} · drag to reorder</span><select name="playerIds" className={`${select} mt-1`} value={roster[index]??""} onChange={(event)=>setRoster((current)=>current.map((id,i)=>i===index?event.target.value:id))}><option value="">Empty seat</option>{players.map((player)=><option key={player.id} value={player.id}>{player.name}</option>)}</select><div className="mt-2 flex gap-1"><button aria-label={`Move seed ${index+1} up`} disabled={index===0} type="button" onClick={()=>move(index,index-1)} className="border border-ink px-2 disabled:opacity-30">↑</button><button aria-label={`Move seed ${index+1} down`} disabled={index===seats-1} type="button" onClick={()=>move(index,index+1)} className="border border-ink px-2 disabled:opacity-30">↓</button></div></div>)}</div><Button loading={rosterPending} loadingLabel="Saving…" className="mt-4">Save roster order</Button><Feedback state={rosterState}/></form>
    </section>
    <section className="border-2 border-ink bg-ink p-4 text-cream lg:col-span-2"><p className="font-mono text-[9px] uppercase tracking-[2px] text-lime">Permanent draw-lock checklist</p><div className="mt-3 grid gap-2 sm:grid-cols-4">{[["Schedule locked",locked],["Cover photo",Boolean(tournament.cover_image_url)],["Every seat filled",roster.filter(Boolean).length===seats],["Competition chosen",locked]].map(([label,done])=><div key={String(label)} className={`border p-2 font-mono text-[10px] ${done?"border-lime text-lime":"border-crust text-crust"}`}>{done?"✓":"○"} {label}</div>)}</div></section>
  </div>;
}
