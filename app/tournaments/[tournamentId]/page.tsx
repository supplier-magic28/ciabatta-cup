import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { TournamentBoard } from "@/components/tournament/TournamentBoard";
import { TournamentPhotoControl } from "@/components/tournament/TournamentPhotoControl";
import { getSessionPlayer } from "@/lib/auth/session";
import { loadTournamentBoard } from "@/lib/tournament/read";
import { BackLink } from "@/components/ui/BackLink";
import { PARENT_ROUTES } from "@/lib/navigation/parents";
import { ClaymoreCupIcon } from "@/components/brand/ClaymoreCupIcon";
import { CupInvitePanel } from "@/components/tournament/CupInvitePanel";
import { createClient } from "@/lib/supabase/server";

export default async function TournamentPage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const player = await getSessionPlayer();
  if (!player) redirect("/sign-in");
  const { tournamentId } = await params;
  const board = await loadTournamentBoard(tournamentId);
  if (!board) notFound();
  const { tournament, championId, playerById } = board;
  const {data:invite}=await(await createClient()).from("tournament_invites").select("status,hold_until").eq("tournament_id",tournamentId).eq("player_id",player.id).maybeSingle();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-12 pt-5 sm:px-6">
      <SiteHeader role={player.role} active="tournaments" />
      <BackLink href={PARENT_ROUTES.cups} className="mb-5">All cups</BackLink>
      <section className="mb-8 border-2 border-ink bg-green p-5 text-cream shadow-[4px_4px_0_var(--color-ink)] sm:p-7">
        <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] sm:items-start">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[2px] text-green-muted">{tournament.status} · Ranked Elo</p>
            <h1 className="mt-1 font-heading text-3xl font-bold">{tournament.name}</h1>
            <p className="mt-3 font-mono text-[11px] uppercase leading-5 text-green-muted">
              {new Intl.DateTimeFormat("en-AU", { dateStyle: "full", timeStyle: "short", timeZone: tournament.timezone }).format(new Date(tournament.starts_at))}<br />
              {tournament.location_name} · {tournament.courts} courts
            </p>
            {player.role === "admin" && <Link href={`/admin/tournaments/${tournament.id}`} className="mt-5 inline-block border-2 border-cream px-3 py-2 text-center font-mono text-[10px] uppercase tracking-[1px]">Admin view</Link>}
          </div>
          <TournamentPhotoControl tournamentId={tournament.id} photoUrl={tournament.cover_image_url} canEdit={player.role === "admin"} frameShape={tournament.cover_frame_shape} cropZoom={Number(tournament.cover_zoom)} cropOffsetX={Number(tournament.cover_offset_x)} cropOffsetY={Number(tournament.cover_offset_y)}/>
        </div>
        {championId && <p className="mt-5 border-t border-green-muted pt-4 font-heading text-xl font-bold text-chartreuse">Champion: {playerById.get(championId)?.name ?? "Winner"}</p>}
      </section>
      {tournament.trophy_key==="claymore"&&<><section className="mb-8 border-2 border-ink bg-surface p-5"><p className="font-mono text-[10px] uppercase tracking-[2px] text-crust">The prize</p><div className="mt-3 flex flex-wrap items-center gap-6"><div className="claymore-coin grid h-32 w-32 place-items-center rounded-full border-2 border-ink bg-cream shadow-[5px_5px_0_var(--color-ink)] motion-safe:animate-[claymore-spin_7s_linear_infinite]"><ClaymoreCupIcon size={76}/></div><div><h2 className="font-heading text-3xl font-bold">The Claymore + 100 ladder points</h2><p className="mt-1 text-sm text-muted">Win this cup and wear its badge permanently on the leaderboard.</p></div></div></section><div className="mb-8 border-2 border-ink bg-chartreuse p-4 text-center font-mono text-sm font-bold uppercase">100 points up for grabs · winner takes the Claymore</div></>}
      {tournament.trophy_key === "claymore" && <section className="mb-8 border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_var(--color-ink)]">
        <div className="grid gap-5 sm:grid-cols-4">
          <div><p className="font-mono text-[9px] uppercase text-muted">When</p><p className="mt-1 font-heading font-bold">{new Intl.DateTimeFormat("en-AU", { dateStyle:"medium", timeStyle:"short", timeZone:tournament.timezone }).format(new Date(tournament.starts_at))}</p></div>
          <div><p className="font-mono text-[9px] uppercase text-muted">Where</p><p className="mt-1 font-heading font-bold">{tournament.location_name}</p></div>
          <div><p className="font-mono text-[9px] uppercase text-muted">Format</p><p className="mt-1 font-heading font-bold">{tournament.schedule_locked_at ? tournament.group_ruleset.replaceAll("_", " ") : "To be set by the director"}</p></div>
          <div><p className="font-mono text-[9px] uppercase text-muted">Stakes</p><p className="mt-1 font-heading font-bold">1st · 100 pts + the Claymore</p></div>
        </div>
        <div className="mt-7 flex items-end justify-between gap-4"><div><p className="font-mono text-[9px] uppercase tracking-[2px] text-crust">The field</p><h2 className="font-heading text-2xl font-bold">{board.participants.length} of {tournament.seat_count} selected</h2></div><p className="font-mono text-[9px] uppercase text-muted">Final at draw lock</p></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {board.participants.map((participant) => <div key={participant.player_id} className="border-2 border-ink bg-row p-3"><p className="font-heading font-bold">{playerById.get(participant.player_id)?.name ?? "Player"}</p><p className="mt-1 font-mono text-[9px] uppercase text-green">Director selected</p></div>)}
          {Array.from({length:Math.max(0,tournament.seat_count-board.participants.length)},(_,index)=><div key={`open-${index}`} className="border-2 border-dashed border-hairline p-3"><p className="font-heading font-bold text-muted">Open place</p><p className="mt-1 font-mono text-[9px] uppercase text-muted">Awaiting final field</p></div>)}
        </div>
        <p className="mt-4 font-mono text-[9px] uppercase leading-5 text-muted">Seat count, format, and field can change until the director permanently locks the draw. Your RSVP remains recorded.</p>
      </section>}
      {invite && <CupInvitePanel
        tournamentId={tournamentId}
        status={invite.status}
        deadline={invite.hold_until}
      />}
      <TournamentBoard board={board} />
      <section className="mt-8 border-l-4 border-crust bg-row p-4">
        <p className="font-mono text-[10px] uppercase tracking-[1.5px] text-crust">Format</p>
        <p className="mt-1 font-body text-sm leading-6">Group play uses {tournament.group_ruleset.replaceAll("_"," ")}. Downstream matches use {tournament.playoff_ruleset.replaceAll("_"," ")}. Championship path: {tournament.championship_path.replaceAll("_"," ")}.</p>
      </section>
    </main>
  );
}
