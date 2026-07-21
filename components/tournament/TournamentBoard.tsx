import Link from "next/link";
import { formatScore } from "@/lib/match/score";
import type { TournamentRuleset } from "@/lib/tournament/types";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import { TournamentResultForm } from "./TournamentResultForm";

type Board = NonNullable<Awaited<ReturnType<typeof import("@/lib/tournament/read").loadTournamentBoard>>>;

const STAGE_LABEL: Record<string, string> = {
  group: "Round robin",
  tiebreak: "Qualification decider",
  final: "The final",
  playoff: "Third-place match",
};

export function TournamentBoard({ board, admin = false }: { board: Board; admin?: boolean }) {
  const { fixtures, standings, playerById, matchByFixture, setsByMatch } = board;
  const groupTotal = fixtures.filter((fixture) => fixture.stage === "group").length;
  const groupComplete = fixtures.filter((fixture) => fixture.stage === "group" && matchByFixture.has(fixture.id)).length;
  const groups = new Map<string, typeof fixtures>();
  for (const fixture of fixtures) {
    const key = `${fixture.stage}:${fixture.round_number}:${fixture.slot_number}`;
    const current = groups.get(key) ?? [];
    current.push(fixture);
    groups.set(key, current);
  }

  return (
    <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[2px] text-muted">Live table</p>
            <h2 className="font-heading text-2xl font-bold">Standings</h2>
          </div>
          <span className="font-mono text-[10px] uppercase text-muted">{groupComplete}/{groupTotal} group matches</span>
        </div>
        <div className="overflow-hidden border-2 border-ink bg-surface shadow-[3px_3px_0_var(--color-ink)]">
          <div className="grid grid-cols-[28px_minmax(0,1fr)_38px_42px] gap-1 bg-ink px-3 py-2 font-mono text-[8px] uppercase tracking-[1px] text-muted-dark sm:grid-cols-[38px_minmax(0,1fr)_44px_48px_52px]">
            <span>#</span><span>Player</span><span>W-L</span><span className="hidden sm:block">Games</span><span>Diff</span>
          </div>
          {standings.map((standing, index) => {
            const player = playerById.get(standing.playerId);
            return (
              <div key={standing.playerId} className={`grid grid-cols-[28px_minmax(0,1fr)_38px_42px] items-center gap-1 border-t border-hairline px-3 py-3 sm:grid-cols-[38px_minmax(0,1fr)_44px_48px_52px] ${index < 2 ? "bg-row" : ""}`}>
                <span className="font-heading text-lg font-bold">{index + 1}</span>
                <Link href={`/players/${standing.playerId}`} className="flex min-w-0 overflow-hidden items-center gap-2 font-heading text-sm font-bold">
                  <PlayerAvatar name={player?.name ?? "Player"} avatarUrl={player?.avatar_url ?? null} size={30} />
                  <span className="truncate">{player?.name ?? "Player"}</span>
                </Link>
                <span className="font-mono text-[11px]">{standing.won}-{standing.lost}</span>
                <span className="hidden font-mono text-[10px] text-muted sm:block">{standing.gamesWon}-{standing.gamesLost}</span>
                <span className={`font-mono text-[11px] ${standing.gameDifference > 0 ? "text-green" : standing.gameDifference < 0 ? "text-rust" : "text-muted"}`}>
                  {standing.gameDifference > 0 ? "+" : ""}{standing.gameDifference}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-4">
          <p className="font-mono text-[10px] uppercase tracking-[2px] text-muted">Two courts</p>
          <h2 className="font-heading text-2xl font-bold">Schedule</h2>
        </div>
        <div className="flex flex-col gap-4">
          {[...groups.entries()].map(([key, rows]) => {
            const first = rows[0];
            const title = first.stage === "group" ? `Round ${first.round_number}` : STAGE_LABEL[first.stage] ?? first.stage;
            return (
              <div key={key} className="border-2 border-ink bg-surface p-3 shadow-[3px_3px_0_var(--color-ink)]">
                <div className="mb-2 flex justify-between font-mono text-[10px] uppercase tracking-[1.5px] text-crust">
                  <span>{title}</span><span>{first.ruleset === "short_first_to_3" ? "First to 3" : "Full set"}</span>
                </div>
                {rows.map((fixture) => {
                  const player1 = playerById.get(fixture.player1_id);
                  const player2 = playerById.get(fixture.player2_id);
                  const match = matchByFixture.get(fixture.id);
                  const sets = match ? setsByMatch.get(match.id) ?? [] : [];
                  const skipped = Boolean(fixture.skipped_at);
                  return (
                    <div key={fixture.id} className="border-t border-hairline py-3 first:border-0 first:pt-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-heading text-sm font-bold">{player1?.name ?? "Player"} <span className="text-muted">vs</span> {player2?.name ?? "Player"}</p>
                          <p className="mt-1 font-mono text-[9px] uppercase tracking-[1px] text-muted">Court {fixture.court_number}</p>
                        </div>
                        <span className={`text-right font-mono text-[11px] ${match ? "text-green" : "text-muted"}`}>
                          {match
                            ? formatScore(sets.map((set) => ({ p1Games: set.p1_games, p2Games: set.p2_games, tiebreakP1: set.tiebreak_p1, tiebreakP2: set.tiebreak_p2 })))
                            : skipped ? fixture.stage === "tiebreak" ? "Skipped — director final" : "Skipped — completed from standings" : "Pending"}
                        </span>
                      </div>
                      {admin && !match && !skipped && (
                        <TournamentResultForm
                          fixtureId={fixture.id}
                          player1Name={player1?.name ?? "Player 1"}
                          player2Name={player2?.name ?? "Player 2"}
                          ruleset={fixture.ruleset as TournamentRuleset}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
