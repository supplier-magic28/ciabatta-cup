import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { dateKeyInZone } from "@/lib/profile/streak";
import { loadLeaderboardProjection, loadPlayerProfileProjection } from "@/lib/scoring/publicProjection";
import { rebuildRatingCache } from "@/lib/scoring/rebuild";

const integration = process.env.RUN_SUPABASE_INTEGRATION === "1" ? describe : describe.skip;

integration("authenticated ranked lifecycle", () => {
  it("submits, confirms, approves, rebuilds, and keeps both public projections exact", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    const secretKey = process.env.SUPABASE_SECRET_KEY;
    if (!url || !publishableKey || !secretKey) throw new Error("Local Supabase integration credentials are required.");

    const service = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const runId = randomUUID();
    const password = "Local-integration-42!";
    const identities = [
      { key: "submitter", email: `submitter-${runId}@test.invalid`, firstName: "Submitter", lastName: "Integration" },
      { key: "opponent", email: `opponent-${runId}@test.invalid`, firstName: "Opponent", lastName: "Integration" },
      { key: "organiser", email: `organiser-${runId}@test.invalid`, firstName: "Organiser", lastName: "Integration" },
    ] as const;
    const ids = new Map<string, string>();

    for (const identity of identities) {
      const created = await service.auth.admin.createUser({
        email: identity.email,
        password,
        email_confirm: true,
        user_metadata: { first_name: identity.firstName, last_name: identity.lastName },
      });
      if (created.error || !created.data.user) throw new Error(`Could not create ${identity.key}: ${created.error?.message ?? "missing user"}`);
      ids.set(identity.key, created.data.user.id);
    }

    const organiserId = ids.get("organiser")!;
    const roleUpdate = await service.from("players").update({ role: "admin" }).eq("id", organiserId);
    if (roleUpdate.error) throw new Error(`Could not promote organiser: ${roleUpdate.error.message}`);

    async function signedIn(email: string) {
      const client = createClient(url!, publishableKey!, { auth: { autoRefreshToken: false, persistSession: false } });
      const result = await client.auth.signInWithPassword({ email, password });
      if (result.error || !result.data.user) throw new Error(`Could not sign in ${email}: ${result.error?.message ?? "missing user"}`);
      return client;
    }

    const submitter = await signedIn(identities[0].email);
    const opponent = await signedIn(identities[1].email);
    const organiser = await signedIn(identities[2].email);
    const submitterId = ids.get("submitter")!;
    const opponentId = ids.get("opponent")!;
    const playedAt = new Date().toISOString();

    const submitted = await submitter.rpc("submit_match_v3", {
      p_operation_key: randomUUID(),
      p_opponent_id: opponentId,
      p_match_type: "ranked",
      p_format: "one_set",
      p_format_note: null,
      p_winner_player_id: submitterId,
      p_played_at: playedAt,
      p_location: null,
      p_court_id: null,
      p_surface: "synthetic",
      p_sets: [{ set_number: 1, p1_games: 6, p2_games: 4, tiebreak_p1: null, tiebreak_p2: null }],
    });
    if (submitted.error || typeof submitted.data !== "string") throw new Error(`Ranked submission failed: ${submitted.error?.message ?? "missing match id"}`);
    const matchId = submitted.data;

    const confirmed = await opponent.rpc("confirm_match_v1", { p_match_id: matchId });
    expect(confirmed.error).toBeNull();
    expect(confirmed.data).toBe("pending_approval");

    const reviewed = await organiser.rpc("review_match_v2", { p_match_id: matchId, p_decision: "approved" });
    expect(reviewed.error).toBeNull();
    expect(reviewed.data).toBe("approved");

    await rebuildRatingCache();

    const [state, players, history, match] = await Promise.all([
      service.from("scoring_cache_state").select("fact_version,built_version").eq("singleton", true).single(),
      service.from("players").select("id,rating_points").in("id", [submitterId, opponentId, organiserId]),
      service.from("rating_history").select("match_id,player_id,points_before,points_after").eq("match_id", matchId),
      service.from("matches").select("status,player1_id,player2_id,winner_id").eq("id", matchId).single(),
    ]);
    for (const result of [state, players, history, match]) {
      if (result.error) throw new Error(`Lifecycle verification query failed: ${result.error.message}`);
    }

    expect(match.data).toMatchObject({ status: "approved", player1_id: submitterId, player2_id: opponentId, winner_id: submitterId });
    expect(state.data?.built_version).toBe(state.data?.fact_version);

    const persistedPoints = new Map((players.data ?? []).map((player) => [player.id, player.rating_points]));
    expect(persistedPoints.get(submitterId)).toBe(30);
    expect(persistedPoints.get(opponentId)).toBe(15);
    const historyByPlayer = new Map((history.data ?? []).map((entry) => [entry.player_id, entry]));
    expect(historyByPlayer.get(submitterId)).toMatchObject({ points_before: 0, points_after: 30 });
    expect(historyByPlayer.get(opponentId)).toMatchObject({ points_before: 0, points_after: 15 });

    const playerIds = [submitterId, opponentId, organiserId];
    const asOfDate = dateKeyInZone(new Date(playedAt));
    const [ladderProjection, profileProjection] = await Promise.all([
      loadLeaderboardProjection(playerIds, asOfDate),
      loadPlayerProfileProjection(playerIds, asOfDate),
    ]);
    const projectedPoints = new Map(ladderProjection.cache.ratingPoints.map((entry) => [entry.playerId, entry.rating]));
    const profilePoints = new Map(profileProjection.cache.ratingPoints.map((entry) => [entry.playerId, entry.rating]));
    expect(projectedPoints.get(submitterId)).toBe(30);
    expect(projectedPoints.get(opponentId)).toBe(15);
    for (const [playerId, points] of projectedPoints) {
      expect(profilePoints.get(playerId)).toBe(points);
      expect(persistedPoints.get(playerId)).toBe(points);
    }
  }, 60_000);
});
