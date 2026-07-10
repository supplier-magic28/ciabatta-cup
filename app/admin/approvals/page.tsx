import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { displayName } from "@/lib/auth/displayName";
import { formatScore } from "@/lib/match/score";
import { indexEmbeddedScoreSets } from "@/lib/match/embeddedSets";
import { ApprovalActions } from "@/components/match/ApprovalActions";
import { RebuildRatingsButton } from "@/components/match/RebuildRatingsButton";

const eyebrow = "font-mono text-[10px] uppercase tracking-[2px] text-muted";

/**
 * Admin approvals (design screen 06's pending-submissions area). Both-confirmed
 * ranked matches awaiting approval, oldest-first (per docs/SCHEMA.md), each with
 * Approve / Query / Reject. Admin-only: route guard + is_admin() RLS. No scoring
 * here — approving only advances the lifecycle (ADR-0010).
 */
export default async function ApprovalsPage() {
  const player = await getSessionPlayer();
  if (!player) redirect("/sign-in");
  if (player.role !== "admin") redirect("/");

  const supabase = await createClient();

  const [{ data: matches }, { data: players }] = await Promise.all([
    supabase
      .from("matches")
      .select("id, format, format_note, player1_id, player2_id, winner_id, played_at, match_sets(set_number, p1_games, p2_games, tiebreak_p1, tiebreak_p2)")
      .eq("status", "pending_approval")
      .order("played_at", { ascending: true }),
    supabase.from("players").select("id, first_name, last_name, email, nickname, use_nickname"),
  ]);
  const rows = matches ?? [];

  const nameOf = new Map(
    (players ?? []).map((p) => [
      p.id,
      displayName({ firstName: p.first_name, lastName: p.last_name, email: p.email, nickname: p.nickname, useNickname: p.use_nickname }),
    ]),
  );

  const setsByMatch = indexEmbeddedScoreSets(rows);

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-6 py-10">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink">Approvals</h1>
          <RebuildRatingsButton />
        </div>
        <Link href="/" className="font-mono text-[12px] uppercase tracking-[1.5px] text-muted">
          ← Home
        </Link>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-[8px] border-2 border-hairline bg-surface p-6 text-center">
          <p className="font-body text-[15px] text-ink">Nothing awaiting approval.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((m) => {
            const winnerName = nameOf.get(m.winner_id ?? "") ?? "Unknown";
            const loserId = m.winner_id === m.player1_id ? m.player2_id : m.player1_id;
            const loserName = nameOf.get(loserId) ?? "Unknown";
            return (
              <li
                key={m.id}
                className="rounded-[8px] border-2 border-ink bg-surface p-4 shadow-[3px_3px_0_var(--color-ink)]"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-heading text-base font-bold text-ink">
                    {winnerName} <span className="text-muted">def.</span> {loserName}
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[1.5px] text-green">
                    Ranked
                  </span>
                </div>
                <p className="mt-1 font-mono text-[13px] text-ink">
                  {formatScore(setsByMatch.get(m.id) ?? []) || "No sets recorded"}
                </p>
                <p className={`${eyebrow} mt-1`}>
                  {m.format === "custom" && m.format_note ? m.format_note : m.format.replace(/_/g, " ")}
                </p>
                <ApprovalActions matchId={m.id} />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
