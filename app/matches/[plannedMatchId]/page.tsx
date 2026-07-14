import { notFound, redirect } from "next/navigation";
import { ApproveResultButton } from "@/components/planned/ApproveResultButton";
import { PlannedActions } from "@/components/planned/PlannedActions";
import { PlannedResultForm } from "@/components/planned/PlannedResultForm";
import { WorkflowZeusInboxAction } from "@/components/notifications/ZeusInboxButton";
import { BackLink } from "@/components/ui/BackLink";
import { getSessionPlayer } from "@/lib/auth/session";
import { loadCourtOptions } from "@/lib/courts/read";
import { dateKeyInZone } from "@/lib/profile/streak";
import { createClient } from "@/lib/supabase/server";
import { hasScheduledTimePassed } from "@/lib/planned/workflow";

type Person = { first_name?: string; last_name?: string } | null;
const personName=(value:unknown)=>{const row=(Array.isArray(value)?value[0]:value) as Person;return [row?.first_name,row?.last_name].filter(Boolean).join(" ")||"Player";};

export default async function PlannedMatchPage({params}:{params:Promise<{plannedMatchId:string}>}) {
  const player=await getSessionPlayer(); if(!player)redirect("/sign-in"); const db=await createClient(); const id=(await params).plannedMatchId;
  const [{data:plan},{data:proposal},courts]=await Promise.all([
    db.from("planned_matches").select("*, creator:created_by(first_name,last_name), opponent:opponent_player_id(first_name,last_name), external:opponent_external_id(display_name)").eq("id",id).single(),
    db.from("planned_match_results").select("*").eq("planned_match_id",id).in("status",["pending","queried","approved"]).order("created_at",{ascending:false}).limit(1).maybeSingle(),
    loadCourtOptions(),
  ]);
  if(!plan)notFound();
  const participant=player.id===plan.created_by||player.id===plan.opponent_player_id;if(!participant&&player.role!=="admin")notFound();
  const invited=plan.opponent_player_id===player.id; const external=Boolean(plan.opponent_external_id);
  const externalRow=(Array.isArray(plan.external)?plan.external[0]:plan.external) as {display_name?:string}|null;
  const otherId=player.id===plan.created_by?plan.opponent_player_id:plan.created_by;
  const name=externalRow?.display_name??(player.id===plan.created_by?personName(plan.opponent):personName(plan.creator));
  const scheduledPassed=hasScheduledTimePassed(plan.scheduled_at);
  const canReport=plan.status==="locked_in"&&scheduledPassed&&participant;
  const canApprove=plan.status==="awaiting_result_approval"&&proposal?.status==="pending"&&proposal.submitted_by!==player.id&&participant;
  const score=(proposal?.score as Array<{selfGames:number;opponentGames:number}>|undefined)?.map(set=>`${set.selfGames}-${set.opponentGames}`).join(", ");
  return <main className="mx-auto w-full max-w-md flex-1 p-6"><WorkflowZeusInboxAction/><BackLink href="/matches">Your matches</BackLink><section className="mt-4 border-2 border-ink bg-surface p-6 shadow-[3px_3px_0_var(--color-ink)]"><p className="font-mono text-[10px] uppercase tracking-[2px] text-green">{plan.status.replaceAll("_"," ")}</p><h1 className="mt-2 font-heading text-3xl font-bold">vs {name}</h1><dl className="mt-6 grid gap-4 font-body"><div><dt className="font-mono text-[10px] uppercase text-muted">When</dt><dd>{new Intl.DateTimeFormat("en-AU",{dateStyle:"full",timeStyle:"short",timeZone:"Australia/Melbourne"}).format(new Date(plan.scheduled_at))}</dd></div><div><dt className="font-mono text-[10px] uppercase text-muted">Where</dt><dd>{plan.location||"To be decided"}</dd></div><div><dt className="font-mono text-[10px] uppercase text-muted">Stakes</dt><dd className="border-2 border-dashed border-ink p-2 font-mono text-xs">Undecided — settle it after you play</dd></div>{score&&<div><dt className="font-mono text-[10px] uppercase text-muted">Submitted score</dt><dd className="font-mono font-bold">{score}</dd></div>}</dl><div className="mt-6"><PlannedActions id={plan.id} invited={invited} status={plan.status}/></div>{plan.status==="locked_in"&&!scheduledPassed&&<p className="mt-5 border-2 border-hairline bg-row p-3 font-mono text-[10px] uppercase text-muted">Score entry opens after the scheduled match time. This match will stay in Your matches.</p>}{plan.status==="awaiting_result_correction"&&<p className="mt-5 border-2 border-rust bg-row p-3 font-mono text-[10px] uppercase text-rust">The score was queried and is waiting for organiser correction.</p>}{plan.status==="awaiting_admin_approval"&&<p className="mt-5 border-2 border-crust bg-row p-3 font-mono text-[10px] uppercase text-crust">Both players agreed. An organiser now needs to approve the ranked result.</p>}</section>{canReport&&<PlannedResultForm id={plan.id} opponentId={otherId??undefined} opponentName={name} external={external} scheduledDate={dateKeyInZone(new Date(plan.scheduled_at))} location={plan.location} initialCourtId={plan.court_id??""} courts={courts}/>} {canApprove&&<section className="mt-6 border-2 border-ink bg-surface p-5"><p className="font-mono text-[10px] uppercase text-crust">Awaiting your approval</p><p className="mt-2 font-body text-sm">If this is how it went, confirm it. Ranked results still go to the organiser.</p><div className="mt-4"><ApproveResultButton id={plan.id}/></div></section>}</main>;
}
