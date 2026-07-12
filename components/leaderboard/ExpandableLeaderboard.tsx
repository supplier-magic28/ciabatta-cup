"use client";

import Link from "next/link";
import { useState } from "react";
import { LoafBadge } from "@/components/brand/LoafBadge";
import { TrophyBadge } from "@/components/brand/TrophyBadge";
import { PlayerAvatar } from "@/components/players/PlayerAvatar";
import type { LeaderboardHistory } from "@/lib/leaderboard/history";
import { setAllExpanded, toggleExpanded } from "@/lib/leaderboard/expansion";

export type LeaderboardPlayer = {
  playerId: string;
  name: string;
  avatarUrl: string | null;
  rank: number;
  rating: number;
  isHolder: boolean;
  history: LeaderboardHistory;
};

function record(record: { won: number; lost: number }) {
  return `${record.won}-${record.lost}`;
}

export function ExpandableLeaderboard({ players }: { players: LeaderboardPlayer[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const allExpanded = players.length > 0 && players.every((player) => expanded.has(player.playerId));

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setExpanded(setAllExpanded(players.map((player) => player.playerId), !allExpanded))}
          className="border-b-2 border-green font-mono text-[10px] uppercase tracking-[1.4px] text-green"
        >
          {allExpanded ? "Hide all player history" : "Show all player history"}
        </button>
      </div>
      <ol className="flex flex-col gap-3">
        {players.map((player) => {
          const isExpanded = expanded.has(player.playerId);
          const panelId = `player-history-${player.playerId}`;
          const displayRank = player.rating > 0 ? player.rank : "--";
          return (
            <li
              key={player.playerId}
              className={player.isHolder
                ? "border-2 border-ink bg-ink shadow-[4px_4px_0_var(--color-green)]"
                : "border-2 border-ink bg-surface shadow-[3px_3px_0_var(--color-ink)]"}
            >
              <div className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 p-4 sm:grid-cols-[3rem_1fr_auto] sm:gap-5">
                <span className={`font-heading text-2xl font-bold ${player.isHolder ? "text-chartreuse" : "text-ink"}`}>
                  {displayRank}
                </span>
                <div className="min-w-0">
                  <Link href={`/players/${player.playerId}`} className="flex min-w-0 items-center gap-3">
                    <PlayerAvatar
                      name={player.name}
                      avatarUrl={player.avatarUrl}
                      size={40}
                      className={player.isHolder ? "bg-crust text-crumb" : undefined}
                    />
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className={`truncate font-heading text-base font-bold ${player.isHolder ? "text-cream" : "text-ink"}`}>
                          {player.name}
                        </p>
                        {player.isHolder && <LoafBadge size={24} />}
                        {Array.from({ length: player.history.trophies }, (_, index) => (
                          <TrophyBadge key={index} size={21} className={player.isHolder ? "text-chartreuse" : "text-ink"} />
                        ))}
                      </div>
                    </div>
                  </Link>
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={panelId}
                    onClick={() => setExpanded((current) => toggleExpanded(current, player.playerId))}
                    className={`mt-2 font-mono text-[9px] uppercase tracking-[1.2px] underline decoration-2 underline-offset-4 ${player.isHolder ? "text-green-muted decoration-chartreuse" : "text-muted decoration-green"}`}
                  >
                    {isExpanded ? "Hide history" : "View history"} <span aria-hidden="true">{isExpanded ? "↑" : "↓"}</span>
                  </button>
                </div>
                <div className="text-right">
                  <p className={`font-mono text-xl font-semibold ${player.isHolder ? "text-chartreuse" : "text-ink"}`}>
                    {player.rating}
                  </p>
                  <p className={`font-mono text-[9px] uppercase tracking-[1.5px] ${player.isHolder ? "text-green-muted" : "text-muted"}`}>
                    points
                  </p>
                </div>
              </div>
              {isExpanded && (
                <div id={panelId} className={`grid gap-3 border-t-2 p-4 sm:grid-cols-2 ${player.isHolder ? "border-muted-dark" : "border-hairline"}`}>
                  {[
                    `${player.history.trophies} ranked ${player.history.trophies === 1 ? "trophy" : "trophies"}`,
                    `${record(player.history.rankedMatches)} all-time ranked matches`,
                    `${record(player.history.rankedSets)} all-time ranked sets`,
                    `${record(player.history.tournamentMatches)} ranked tournament matches`,
                    `${record(player.history.externalMatches)} non-Ciabatta match history`,
                  ].map((label) => (
                    <p key={label} className={`font-mono text-[10px] uppercase tracking-[1px] ${player.isHolder ? "text-green-muted" : "text-muted"}`}>
                      {label}
                    </p>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
