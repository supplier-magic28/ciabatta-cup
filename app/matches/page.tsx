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

  const [{ data: matches }, { data: players }, { data: myConfirmations }, { data: externalDetails }] = await Promise.all([
    supabase
      .from("matches")
      .select("id, type, format, format_note, status, played_at, location, player1_id, player2_id, winner_id, external_won, match_sets(set_number, p1_games, p2_games, tiebreak_p1, tiebreak_p2)")
      .or(`player1_id.eq.${player.id},player2_id.eq.${player.id}`)
      .order("played_at", { ascending: false }),
    supabase.from("players").select("id, first_name, last_name, email, nickname, use_nickname"),
    supabase.from("match_confirmations").select("match_id").eq("player_id", player.id),
    supabase.from("external_match_details").select("match_id, opponent_name"),
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
      <header className="mb-6 flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-ink">Your matches</h1>
        <Link href="/matches/new" className="font-mono text-[12px] uppercase tracking-[1.5px] text-green">
          + Log match
        </Link>
      </header>

      {rows.length === 0 ? (
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
                <p className="mt-1 font-mono text-[10px] text-muted">{new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(m.played_at))}{m.location ? ` · ${m.location}` : ""}</p>
                <p className="mt-2 font-mono text-[11px] uppercase tracking-[1.5px] text-crust">
                  {needsMyConfirmation ? "Needs your confirmation" : STATUS_LABEL[m.status] ?? m.status}
                </p>
                {needsMyConfirmation && <ConfirmMatchButton matchId={m.id} />}
                {isExternal && <DeleteExternalMatchButton matchId={m.id} />}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
