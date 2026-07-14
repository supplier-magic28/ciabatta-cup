import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/auth/displayName";
import { formatScore } from "@/lib/match/score";
import { indexEmbeddedScoreSets } from "@/lib/match/embeddedSets";
import { Button } from "@/components/ui/Button";
import { ConfirmMatchButton } from "@/components/match/ConfirmMatchButton";
import { DeleteExternalMatchButton } from "@/components/match/DeleteExternalMatchButton";
import { BackLink } from "@/components/ui/BackLink";
import { PARENT_ROUTES } from "@/lib/navigation/parents";
import { WorkflowZeusInboxAction } from "@/components/notifications/ZeusInboxButton";
import { QueriedMatchResubmitForm } from "@/components/match/QueriedMatchResubmitForm";
import { hasScheduledTimePassed } from "@/lib/planned/workflow";

const STATUS_LABEL: Record<string, string> = {
  pending_confirmation: "Waiting for opponent",
  pending_approval: "Awaiting admin approval",
  approved: "Approved",
  queried: "Queried by admin",
  rejected: "Rejected",
};

const FORMAT_LABEL: Record<string, string> = {
  one_set: "One set",
  best_of_3: "Best of 3",
  pro_set_8: "Pro set (8)",
  custom: "Custom",
};

const eyebrow = "font-mono text-[10px] uppercase tracking-[2px] text-muted";

/**
 * "Your matches" — the current player's matches with their lifecycle status, the
 * score, and (Phase 3c-part-2) a Confirm button on matches awaiting *their*
 * confirmation. Not the leaderboard: no ratings, no scoring.
 */
export default async function MatchesPage() {
  const player = await getSessionPlayer();
  if (!player) redirect("/sign-in");

  const supabase = await createClient();

  const [{ data: matches }, { data: players }, { data: myConfirmations }, { data: externalDetails }, { data: planned }] = await Promise.all([
    supabase
      .from("matches")
      .select("id, type, format, format_note, status, submitted_by, played_at, location, court_id, surface, player1_id, player2_id, winner_id, external_won, match_sets(set_number, p1_games, p2_games, tiebreak_p1, tiebreak_p2)")
      .or(`player1_id.eq.${player.id},player2_id.eq.${player.id}`)
      .order("played_at", { ascending: false }),
    supabase.from("players").select("id, first_name, last_name, email, nickname, use_nickname"),
    supabase.from("match_confirmations").select("match_id").eq("player_id", player.id),
    supabase.from("external_match_details").select("match_id, opponent_name"),
    supabase.from("planned_matches").select("id,created_by,opponent_player_id,opponent_external_id,scheduled_at,location,status,external_opponents(display_name)").or(`created_by.eq.${player.id},opponent_player_id.eq.${player.id}`).in("status",["proposed","locked_in","awaiting_result_approval","awaiting_result_correction","awaiting_admin_approval"]).order("scheduled_at",{ascending:true}),
  ]);
  const rows = matches ?? [];

  const nameOf = new Map(
    (players ?? []).map((p) => [
      p.id,
      displayName({ firstName: p.first_name, lastName: p.last_name, email: p.email, nickname: p.nickname, useNickname: p.use_nickname }),
    ]),
  );

  const setsByMatch = indexEmbeddedScoreSets(rows);

  const confirmedByMe = new Set((myConfirmations ?? []).map((c) => c.match_id));
  const externalNameByMatch = new Map((externalDetails ?? []).map((detail) => [detail.match_id, detail.opponent_name]));

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-6 py-10">
      <WorkflowZeusInboxAction />
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-ink">Your matches</h1>
        <div className="flex flex-wrap items-center justify-end gap-4"><BackLink href={PARENT_ROUTES.ladder}>Ladder</BackLink><Link href="/matches/untagged" className="font-mono text-[12px] uppercase tracking-[1.5px] text-crust">Tag missing</Link><Link href="/matches/plan" className="font-mono text-[12px] uppercase tracking-[1.5px] text-green">+ Plan</Link><Link href="/matches/new" className="font-mono text-[12px] uppercase tracking-[1.5px] text-green">+ Log match</Link></div>
      </header>

      {(planned??[]).length>0&&<section className="mb-8"><p className={`${eyebrow} mb-3`}>Planned and in progress</p><ul className="grid gap-3">{(planned??[]).map(plan=>{const external=Boolean(plan.opponent_external_id);const relation=Array.isArray(plan.external_opponents)?plan.external_opponents[0]:plan.external_opponents;const opponentId=plan.created_by===player.id?plan.opponent_player_id:plan.created_by;const opponent=external?(relation?.display_name??"Non-Ciabatta opponent"):(nameOf.get(opponentId??"")??"Opponent");const action=plan.status==="proposed"?(plan.opponent_player_id===player.id?"Your answer needed":"Waiting for opponent"):plan.status==="locked_in"?(hasScheduledTimePassed(plan.scheduled_at)?"Score can be entered":"Locked in"):plan.status==="awaiting_result_approval"?"Player approval needed":plan.status==="awaiting_result_correction"?"Organiser correction needed":"Organiser approval needed";return <li key={plan.id}><Link href={`/matches/${plan.id}`} className={`block border-2 bg-surface p-4 ${external?"border-dashed border-muted":"border-ink shadow-[3px_3px_0_var(--color-ink)]"}`}><div className="flex items-start justify-between gap-3"><div><p className="font-heading font-bold">vs {opponent}</p><p className="mt-1 font-mono text-[10px] uppercase text-muted">{new Intl.DateTimeFormat("en-AU",{dateStyle:"medium",timeStyle:"short",timeZone:"Australia/Melbourne"}).format(new Date(plan.scheduled_at))}{plan.location?` · ${plan.location}`:""}</p></div><span className="max-w-28 text-right font-mono text-[9px] uppercase text-crust">{action}</span></div></Link></li>;})}</ul></section>}

      {rows.length === 0 && (planned??[]).length===0 ? (
        <div className="rounded-[8px] border-2 border-hairline bg-surface p-6 text-center">
          <p className="font-body text-[15px] text-ink">No matches yet.</p>
          <div className="mx-auto mt-4 w-[200px]">
            <Link href="/matches/new">
              <Button type="button">Log your first match</Button>
            </Link>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((m) => {
            const opponentId = m.player1_id === player.id ? m.player2_id : m.player1_id;
            const isExternal = m.type === "unranked_external";
            const won = isExternal ? !m.external_won : m.winner_id === player.id;
            // I'm the opponent who hasn't confirmed yet (the submitter auto-confirms).
            const needsMyConfirmation =
              m.status === "pending_confirmation" && !confirmedByMe.has(m.id);
            return (
              <li
                key={m.id}
                className="rounded-[8px] border-2 border-ink bg-surface p-4 shadow-[3px_3px_0_var(--color-ink)]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-heading text-base font-bold text-ink">
                    vs {isExternal ? (externalNameByMatch.get(m.id) ?? "Non-Ciabatta opponent") : (nameOf.get(opponentId) ?? "Unknown")}
                  </span>
                  <span
                    className={
                      "font-mono text-[10px] uppercase tracking-[1.5px] " +
                      (won ? "text-green" : "text-rust")
                    }
                  >
                    {won ? "You won" : "You lost"}
                  </span>
                </div>
                <p className="mt-1 font-mono text-[13px] text-ink">
                  {formatScore(setsByMatch.get(m.id) ?? []) || "No sets recorded"}
                </p>
                <p className={`${eyebrow} mt-1`}>
                  {isExternal ? "Non-Ciabatta · Unranked · +10 pts" : (m.type === "ranked" ? "Ranked" : "Exhibition")} ·{" "}
                  {FORMAT_LABEL[m.format] ?? m.format}
                  {m.format === "custom" && m.format_note ? ` (${m.format_note})` : ""}
                </p>
                <p className="mt-1 font-mono text-[10px] text-muted">{new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(m.played_at))}{m.location ? <> · {m.court_id ? <Link href={`/courts/${m.court_id}`} className="underline">{m.location}</Link> : m.location}</> : ""}</p>
                <span className={`mt-2 inline-block border px-2 py-1 font-mono text-[9px] uppercase ${m.surface ? "border-green text-green" : "border-dashed border-crust text-crust"}`}>{m.surface ?? "No surface"}</span>
                <p className="mt-2 font-mono text-[11px] uppercase tracking-[1.5px] text-crust">
                  {needsMyConfirmation ? "Needs your confirmation" : STATUS_LABEL[m.status] ?? m.status}
                </p>
                {needsMyConfirmation && <ConfirmMatchButton matchId={m.id} />}
                {m.status==="queried"&&m.submitted_by===player.id&&m.player2_id&&<QueriedMatchResubmitForm matchId={m.id} opponentId={m.player2_id} opponentName={nameOf.get(m.player2_id)??"Opponent"} type={m.type as "ranked"|"exhibition"} format={m.format as "one_set"|"best_of_3"|"pro_set_8"|"custom"} formatNote={m.format_note} playedDate={String(m.played_at).slice(0,10)} location={m.location??""} surface={(m.surface as import("@/lib/courts/types").Surface|null)??null} initialSets={(m.match_sets??[]).slice().sort((a,b)=>a.set_number-b.set_number).map(set=>({selfGames:set.p1_games,opponentGames:set.p2_games,selfTiebreak:set.tiebreak_p1,opponentTiebreak:set.tiebreak_p2}))}/>}
                {isExternal && <DeleteExternalMatchButton matchId={m.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
