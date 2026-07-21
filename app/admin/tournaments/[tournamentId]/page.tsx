import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TournamentAdminActions } from "@/components/tournament/TournamentAdminActions";
import { TournamentBoard } from "@/components/tournament/TournamentBoard";
import { TournamentLifecycleActions } from "@/components/tournament/TournamentLifecycleActions";
import {TournamentLeadupConsole} from "@/components/tournament/TournamentLeadupConsole";
import {TournamentPhotoControl} from "@/components/tournament/TournamentPhotoControl";
import { getSessionPlayer } from "@/lib/auth/session";
import { boundaryDecider, canOfferDirectorFinalOverride, finalStageAdvanceControl } from "@/lib/tournament/logic";
import { loadActiveTournamentPlayers, loadTournamentBoard } from "@/lib/tournament/read";
import { BackLink } from "@/components/ui/BackLink";
import { PARENT_ROUTES } from "@/lib/navigation/parents";
import { WorkflowZeusInboxAction } from "@/components/notifications/ZeusInboxButton";
import { CupInviteConsole } from "@/components/tournament/CupInviteConsole";
import { createClient } from "@/lib/supabase/server";
import { getRegisteredTrophyAsset } from "@/lib/trophies/assets";

export default async function ManageTournamentPage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const admin = await getSessionPlayer();
  if (!admin) redirect("/sign-in");
  if (admin.role !== "admin") redirect("/");
  const { tournamentId } = await params;
  const db=await createClient();
  const [board, activePlayers,{data:invites}] = await Promise.all([
    loadTournamentBoard(tournamentId),
    loadActiveTournamentPlayers(),
    db.from("tournament_invites").select("player_id,status,hold_until").eq("tournament_id",tournamentId),
  ]);
  if (!board) notFound();
  const trophyAsset = board.tournament.trophy_key
    ? getRegisteredTrophyAsset(board.tournament.trophy_key)
    : null;
  const canGenerate = board.fixtures.length === 0;
  const groupFixtures = board.fixtures.filter((fixture) => fixture.stage === "group");
  const groupComplete = groupFixtures.length > 0 && groupFixtures.every((fixture) => board.matchByFixture.has(fixture.id));
  const neededDecider = groupComplete ? boundaryDecider(board.standings,board.tournament.championship_path) : null;
  const deciderFixture = board.fixtures.find((fixture) => fixture.stage === "tiebreak");
  const deciderComplete = Boolean(deciderFixture && board.matchByFixture.has(deciderFixture.id));
  const finalFixtures = board.fixtures.filter((fixture) => fixture.stage === "final" || fixture.stage === "playoff");
  const semifinalFixtures=board.fixtures.filter((fixture)=>fixture.stage==="semifinal");
  const finalResultCount = finalFixtures.filter((fixture) => board.matchByFixture.has(fixture.id)).length;
  const canCompleteFromStandings = board.tournament.championship_path==="standings"&&groupComplete
    && (!neededDecider || deciderComplete)
    && finalResultCount === 0;
  let advanceLabel = "Complete group matches first";
  let advanceDisabled = true;
  const finalStageControl = finalStageAdvanceControl(finalFixtures.length, finalResultCount);
  if (finalStageControl) {
    advanceLabel = finalStageControl.label;
    advanceDisabled = finalStageControl.disabled;
  } else if (groupComplete && neededDecider && !deciderFixture) {
    advanceLabel = "Create qualification decider";
    advanceDisabled = false;
  } else if (groupComplete && neededDecider && !deciderComplete) {
    advanceLabel = "Complete decider first";
  } else if(groupComplete&&board.tournament.championship_path==="standings"){
    advanceLabel="Complete from standings";advanceDisabled=false;
  } else if(groupComplete&&board.tournament.championship_path==="top_four_finals"&&semifinalFixtures.length===0){
    advanceLabel="Create semifinals";advanceDisabled=false;
  } else if(semifinalFixtures.length>0&&semifinalFixtures.some((fixture)=>!board.matchByFixture.has(fixture.id))){
    advanceLabel="Complete semifinals first";
  } else if (groupComplete && finalFixtures.length === 0) {
    advanceLabel = "Create championship matches";
    advanceDisabled = false;
  }
  const participants = board.participants.map((participant) => ({
    id: participant.player_id,
    seed: participant.seed,
    name: board.playerById.get(participant.player_id)?.name ?? "Player",
  }));
  const canOverrideQualification = canOfferDirectorFinalOverride({
    groupComplete,
    championshipPath: board.tournament.championship_path,
    participantCount: board.participants.length,
    finalFixtureCount: finalFixtures.length,
    semifinalFixtureCount: semifinalFixtures.length,
    deciderComplete,
  });

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <WorkflowZeusInboxAction />
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b-2 border-ink pb-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[2px] text-crust">Director console · {board.tournament.status}</p>
          <h1 className="font-heading text-3xl font-bold">{board.tournament.name}</h1>
          <p className="mt-1 font-mono text-[10px] uppercase text-muted">Scores are approved immediately and cannot be edited.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-4 font-mono text-[10px] uppercase text-muted">
          {trophyAsset && (
            <Link href={`/admin/tournaments/${tournamentId}/trophy-preview`}>
              Preview trophy in 3D/AR
            </Link>
          )}
          <Link href={`/tournaments/${tournamentId}`}>Player view</Link>
          <BackLink href={PARENT_ROUTES.cups}>All cups</BackLink>
        </div>
      </header>

      <TournamentPhotoControl tournamentId={tournamentId} photoUrl={board.tournament.cover_image_url} canEdit frameShape={board.tournament.cover_frame_shape} cropZoom={Number(board.tournament.cover_zoom)} cropOffsetX={Number(board.tournament.cover_offset_x)} cropOffsetY={Number(board.tournament.cover_offset_y)}/>

      {!board.tournament.draw_locked_at&&<TournamentLeadupConsole
        key={`${board.tournament.seat_count}:${participants.map((participant)=>`${participant.seed}-${participant.id}`).join(":")}`}
        tournament={board.tournament}
        participants={participants}
        players={activePlayers}
      />}
      {!board.tournament.draw_locked_at && <CupInviteConsole
        tournamentId={tournamentId}
        players={activePlayers}
        participantIds={participants.map((participant) => participant.id)}
        invites={invites ?? []}
      />}

      <section className="mb-7 grid gap-4 border-2 border-ink bg-row p-4 sm:grid-cols-[1fr_280px] sm:items-center">
        <div>
          <p className="font-heading text-lg font-bold">{board.participants.length} players · {board.tournament.courts} courts</p>
          <p className="mt-1 font-mono text-[10px] uppercase leading-5 text-muted">
            {board.participants.map((participant) => `${participant.seed}. ${board.playerById.get(participant.player_id)?.name ?? "Player"}`).join(" · ")}
          </p>
        </div>
        {board.tournament.status !== "completed" && board.tournament.draw_locked_at && (
          <TournamentAdminActions
            tournamentId={tournamentId}
            canGenerate={canGenerate}
            canCompleteFromStandings={canCompleteFromStandings}
            advanceLabel={advanceLabel}
            advanceDisabled={advanceDisabled}
            qualificationOverridePlayers={canOverrideQualification ? board.standings.map((standing) => ({
              id: standing.playerId,
              name: board.playerById.get(standing.playerId)?.name ?? "Player",
            })) : undefined}
          />
        )}
      </section>

      <TournamentLifecycleActions
          tournamentId={tournamentId}
          drawLocked={Boolean(board.tournament.draw_locked_at)}
          canUnlock={Boolean(board.tournament.draw_locked_at) && !board.hasTournamentMatches && board.tournament.status === "scheduled"}
          tournamentCompleted={board.tournament.status === "completed"}
        />

      {canGenerate ? (
        <div className="border-2 border-dashed border-muted bg-surface p-10 text-center">
          <p className="font-heading text-lg font-bold">Draw preview waits for the permanent lock</p>
          <p className="mt-2 font-body text-sm text-muted">Complete the checklist above. Locking atomically generates every round-robin pairing.</p>
        </div>
      ) : <TournamentBoard board={board} admin />}
    </main>
  );
}
