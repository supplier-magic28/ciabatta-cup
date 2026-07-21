import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionPlayer: vi.fn(),
  createClient: vi.fn(),
  rebuildRatingCache: vi.fn(),
  revalidatePath: vi.fn(),
  loadTournamentBoard: vi.fn(),
  deriveOfficialPlacements: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionPlayer: mocks.getSessionPlayer }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/scoring/rebuild", () => ({ rebuildRatingCache: mocks.rebuildRatingCache }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("./read", () => ({ loadTournamentBoard: mocks.loadTournamentBoard }));
vi.mock("./placements", () => ({ deriveOfficialPlacements: mocks.deriveOfficialPlacements }));

import { completeTournamentFromStandings, lockTournamentDraw, overrideTournamentFinal, recordTournamentResult, replaceTournamentParticipant, unlockTournamentDraw } from "./actions";

function resultForm() {
  const form = new FormData();
  form.set("fixtureId", "fixture-1");
  form.set("p1Games", "3");
  form.set("p2Games", "1");
  return form;
}

function adminClient(rpcError: unknown = null, fixtureOverrides: Record<string, unknown> = {}) {
  const fixtureQuery = {
    select: vi.fn(), eq: vi.fn(), single: vi.fn(),
  };
  fixtureQuery.select.mockReturnValue(fixtureQuery);
  fixtureQuery.eq.mockReturnValue(fixtureQuery);
  fixtureQuery.single.mockResolvedValue({
    data: {
      id: "fixture-1",
      tournament_id: "tournament-1",
      player1_id: "player-1",
      player2_id: "player-2",
      ruleset: "short_first_to_3",
      skipped_at: null,
      ...fixtureOverrides,
    },
  });
  return {
    from: vi.fn().mockReturnValue(fixtureQuery),
    rpc: vi.fn().mockResolvedValue({ error: rpcError }),
  };
}

function chain(data: unknown, error: unknown = null) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.order = vi.fn(() => query);
  query.limit = vi.fn(() => query);
  query.single = vi.fn().mockResolvedValue({ data, error });
  query.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data, error })));
  return query;
}

function replacementClient({ matchRows = [], fixtureRows = [] }: { matchRows?: unknown[]; fixtureRows?: unknown[] } = {}) {
  const tournamentQuery = chain({ id: "tournament-1", courts: 2, group_ruleset: "short_first_to_3", status: "scheduled" });
  const participantQuery = chain([
    { player_id: "player-1", seed: 1 },
    { player_id: "player-2", seed: 2 },
    { player_id: "player-3", seed: 3 },
    { player_id: "player-4", seed: 4 },
  ]);
  const matchesQuery = chain(matchRows);
  const fixturesQuery = chain(fixtureRows);
  const replacementQuery = chain({ id: "player-5", status: "active" });
  const participantUpdate = {
    eq: vi.fn(() => participantUpdate),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ error: null })),
  };
  const fixtureDelete = {
    eq: vi.fn(() => fixtureDelete),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ error: null })),
  };
  const tournamentUpdate = {
    eq: vi.fn(() => tournamentUpdate),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ error: null })),
  };
  const fixtureInsert = vi.fn().mockResolvedValue({ error: null });
  const rpc = vi.fn().mockResolvedValue({ data: true, error: null });

  return {
    from: vi.fn((table: string) => {
      if (table === "tournaments") return { select: () => tournamentQuery, update: () => tournamentUpdate };
      if (table === "tournament_participants") return { select: () => participantQuery, update: () => participantUpdate };
      if (table === "matches") return { select: () => matchesQuery };
      if (table === "fixtures") return { select: () => fixturesQuery, delete: () => fixtureDelete, insert: fixtureInsert };
      return { select: () => replacementQuery };
    }),
    fixtureInsert,
    rpc,
  };
}

function replacementForm(replacementPlayerId = "player-5") {
  const form = new FormData();
  form.set("tournamentId", "tournament-1");
  form.set("outgoingPlayerId", "player-4");
  form.set("replacementPlayerId", replacementPlayerId);
  return form;
}

function finalOverrideForm(finalistTwoId = "player-3", reason = "Director decision after group play.") {
  const form = new FormData();
  form.set("tournamentId", "tournament-1");
  form.set("finalistOneId", "player-1");
  form.set("finalistTwoId", finalistTwoId);
  form.set("reason", reason);
  return form;
}

describe("recordTournamentResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rebuildRatingCache.mockResolvedValue(undefined);
  });

  it("rejects non-admins before database access", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ role: "player" });
    await expect(recordTournamentResult(undefined, resultForm())).resolves.toEqual({
      ok: false,
      error: "Only admins can manage tournaments.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("reports a duplicate or transactional RPC failure without rebuilding activity points", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin", status: "active" });
    mocks.createClient.mockResolvedValue(adminClient(new Error("fixture already has a result")));
    await expect(recordTournamentResult(undefined, resultForm())).resolves.toEqual({
      ok: false,
      error: "Couldn't record this result. It may already be complete.",
    });
    expect(mocks.rebuildRatingCache).not.toHaveBeenCalled();
  });

  it("refuses to record a fixture skipped by standings completion", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin", status: "active" });
    const client = adminClient(null, { skipped_at: "2026-07-11T04:00:00.000Z" });
    mocks.createClient.mockResolvedValue(client);
    await expect(recordTournamentResult(undefined, resultForm())).resolves.toEqual({
      ok: false,
      error: "That fixture was skipped when the tournament completed.",
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("surfaces cache rebuild failure after preserving the approved fact", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin", status: "active" });
    mocks.createClient.mockResolvedValue(adminClient());
    mocks.rebuildRatingCache.mockRejectedValue(new Error("missing service key"));
    await expect(recordTournamentResult(undefined, resultForm())).resolves.toEqual({
      ok: true,
      message: "Result recorded. The points cache needs the organiser recovery rebuild.",
    });
  });

  it("records, rebuilds, and invalidates tournament surfaces", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin", status: "active" });
    const client = adminClient();
    mocks.createClient.mockResolvedValue(client);
    await expect(recordTournamentResult(undefined, resultForm())).resolves.toEqual({
      ok: true,
      message: "Result approved and activity points rebuilt.",
    });
    expect(client.rpc).toHaveBeenCalledWith("record_tournament_result_v2", expect.objectContaining({
      p_fixture_id: "fixture-1",
      p_winner_id: "player-1",
      p_played_at: null,
    }));
    expect(mocks.rebuildRatingCache).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/tournaments/tournament-1");
  });
});

describe("replaceTournamentParticipant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-admins before database access", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ role: "player" });
    await expect(replaceTournamentParticipant(undefined, replacementForm())).resolves.toEqual({
      ok: false,
      error: "Only admins can manage tournaments.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("keeps the field locked after a result exists", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin", status: "active" });
    mocks.createClient.mockResolvedValue(replacementClient({ matchRows: [{ id: "match-1" }] }));
    await expect(replaceTournamentParticipant(undefined, replacementForm())).resolves.toEqual({
      ok: false,
      error: "The field is locked after the first result.",
    });
  });

  it("rejects a player who is already in the field", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin", status: "active" });
    mocks.createClient.mockResolvedValue(replacementClient());
    await expect(replaceTournamentParticipant(undefined, replacementForm("player-3"))).resolves.toEqual({
      ok: false,
      error: "That player is already in this tournament.",
    });
  });

  it("replaces the selected seed and writes a fresh draw", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin", status: "active" });
    const client = replacementClient({ fixtureRows: [{ id: "fixture-1" }] });
    mocks.createClient.mockResolvedValue(client);
    await expect(replaceTournamentParticipant(undefined, replacementForm())).resolves.toEqual({
      ok: true,
      message: "Player replaced and the draw was regenerated.",
    });
    expect(client.rpc).toHaveBeenCalledWith("replace_tournament_participant_v2", expect.objectContaining({
      p_tournament_id: "tournament-1",
      p_outgoing_player_id: "player-4",
      p_replacement_player_id: "player-5",
      p_group_fixtures: expect.arrayContaining([
        expect.objectContaining({ player1_id: "player-5" }),
        expect.objectContaining({ player2_id: "player-5" }),
      ]),
    }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/tournaments/tournament-1");
  });
});

describe("lockTournamentDraw", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-admins before attempting the lock", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ role: "player" });
    await expect(lockTournamentDraw(undefined, replacementForm())).resolves.toEqual({
      ok: false, error: "Only admins can manage tournaments.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("does not send email when the database refuses the lock", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin", status: "active" });
    const tournamentQuery=chain({id:"tournament-1",courts:2});
    const participantQuery=chain([{player_id:"player-1",seed:1},{player_id:"player-2",seed:2}]);
    const client = { from:vi.fn((table:string)=>({select:()=>table==="tournaments"?tournamentQuery:participantQuery})),rpc: vi.fn().mockResolvedValue({ error: new Error("checklist") }) };
    mocks.createClient.mockResolvedValue(client);
    await expect(lockTournamentDraw(undefined, replacementForm())).resolves.toEqual({
      ok: false, error: "Couldn't lock the draw. Generate and review it first.",
    });
    expect(client.rpc).toHaveBeenCalledWith("lock_tournament_draw_v2", expect.objectContaining({ p_tournament_id: "tournament-1",p_group_fixtures:expect.any(Array) }));
  });
});

describe("unlockTournamentDraw", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-admins before attempting the unlock", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ role: "player" });
    await expect(unlockTournamentDraw(undefined, replacementForm())).resolves.toEqual({
      ok: false, error: "Only admins can manage tournaments.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("unlocks through the guarded RPC and revalidates the cup", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin", status: "active" });
    const client = { rpc: vi.fn().mockResolvedValue({ error: null }) };
    mocks.createClient.mockResolvedValue(client);
    await expect(unlockTournamentDraw(undefined, replacementForm())).resolves.toEqual({
      ok: true, message: "Draw unlocked. Update the field, then lock it again before play.",
    });
    expect(client.rpc).toHaveBeenCalledWith("unlock_tournament_draw_v1", { p_tournament_id: "tournament-1" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/tournaments/tournament-1");
  });

  it("explains that a recorded result makes the draw final", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin", status: "active" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.createClient.mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ error: new Error("cup draw has a recorded result") }) });
    await expect(unlockTournamentDraw(undefined, replacementForm())).resolves.toEqual({
      ok: false, error: "The draw can’t be unlocked after a result has been recorded.",
    });
    expect(errorSpy).toHaveBeenCalledWith("Tournament draw unlock failed", expect.objectContaining({ tournamentId: "tournament-1" }));
    errorSpy.mockRestore();
  });

  it("identifies a deployment whose unlock RPC is missing", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin", status: "active" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.createClient.mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ error: { code: "PGRST202", message: "Could not find the function public.unlock_tournament_draw_v1 in the schema cache" } }) });
    await expect(unlockTournamentDraw(undefined, replacementForm())).resolves.toEqual({
      ok: false, error: "Draw unlock is not available in this deployment.",
    });
    errorSpy.mockRestore();
  });

  it.each([
    ["cup not found", "Tournament not found."],
    ["only active organisers may unlock cup draws", "Only admins can manage tournaments."],
    ["unexpected database failure", "Couldn’t unlock the draw. Try again."],
  ])("maps the database failure %s", async (databaseMessage, expectedError) => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin", status: "active" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.createClient.mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ error: { code: "XX000", message: databaseMessage } }) });
    await expect(unlockTournamentDraw(undefined, replacementForm())).resolves.toEqual({
      ok: false, error: expectedError,
    });
    errorSpy.mockRestore();
  });
});

describe("overrideTournamentFinal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-admins before database access", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ role: "player" });
    await expect(overrideTournamentFinal(undefined, finalOverrideForm())).resolves.toEqual({
      ok: false, error: "Only admins can manage tournaments.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects duplicate finalists before database access", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin", status: "active" });
    await expect(overrideTournamentFinal(undefined, finalOverrideForm("player-1"))).resolves.toEqual({
      ok: false, error: "Choose two different finalists.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("records the audited director override through its RPC", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin", status: "active" });
    const rpc = vi.fn().mockResolvedValue({ data: true, error: null });
    mocks.createClient.mockResolvedValue({ rpc });
    await expect(overrideTournamentFinal(undefined, finalOverrideForm())).resolves.toEqual({
      ok: true, message: "Director override recorded. The group-format final is ready.",
    });
    expect(rpc).toHaveBeenCalledWith("override_tournament_final_v1", {
      p_tournament_id: "tournament-1",
      p_finalist_one_id: "player-1",
      p_finalist_two_id: "player-3",
      p_reason: "Director decision after group play.",
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/tournaments/tournament-1");
  });

  it("identifies a deployment whose override RPC is missing", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin", status: "active" });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ error: { code: "PGRST202", message: "Could not find override_tournament_final_v1" } }),
    });
    await expect(overrideTournamentFinal(undefined, finalOverrideForm())).resolves.toEqual({
      ok: false, error: "Director final override is not available in this deployment.",
    });
    errorSpy.mockRestore();
  });
});

describe("completeTournamentFromStandings", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects non-admins before database access", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ role: "player" });
    await expect(completeTournamentFromStandings(undefined, replacementForm())).resolves.toEqual({
      ok: false, error: "Only admins can manage tournaments.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("completes atomically through the standings RPC", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin", status: "active" });
    const matchesQuery = { select: vi.fn(), eq: vi.fn() };
    matchesQuery.select.mockReturnValue(matchesQuery);
    matchesQuery.eq.mockResolvedValue({ data: [], error: null });
    const client = { from: vi.fn(() => matchesQuery), rpc: vi.fn().mockResolvedValue({ error: null }) };
    mocks.createClient.mockResolvedValue(client);
    mocks.loadTournamentBoard.mockResolvedValue({ tournament: { status: "scheduled", completion_path: null }, standings: [], fixtures: [] });
    mocks.deriveOfficialPlacements.mockReturnValue([]);
    mocks.rebuildRatingCache.mockResolvedValue(undefined);
    await expect(completeTournamentFromStandings(undefined, replacementForm())).resolves.toEqual({
      ok: true, message: "Tournament complete. The round-robin standings are final.",
    });
    expect(client.rpc).toHaveBeenCalledWith("finalize_tournament_v1", {
      p_tournament_id: "tournament-1",
      p_completion_path: "round_robin",
      p_placements: [],
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/tournaments/tournament-1");
  });

  it("reports a required qualification decider", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin", status: "active" });
    const matchesQuery = { select: vi.fn(), eq: vi.fn() };
    matchesQuery.select.mockReturnValue(matchesQuery);
    matchesQuery.eq.mockResolvedValue({ data: [], error: null });
    mocks.createClient.mockResolvedValue({
      from: vi.fn(() => matchesQuery),
      rpc: vi.fn().mockResolvedValue({ error: { message: "complete the qualification decider first" } }),
    });
    mocks.loadTournamentBoard.mockResolvedValue({ tournament: { status: "scheduled", completion_path: null }, standings: [], fixtures: [] });
    mocks.deriveOfficialPlacements.mockReturnValue([]);
    await expect(completeTournamentFromStandings(undefined, replacementForm())).resolves.toEqual({
      ok: false, error: "Complete the championship decider first.",
    });
  });
});
