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

import { completeTournamentFromStandings, lockTournamentDraw, recordTournamentResult, replaceTournamentParticipant } from "./actions";

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

  return {
    from: vi.fn((table: string) => {
      if (table === "tournaments") return { select: () => tournamentQuery, update: () => tournamentUpdate };
      if (table === "tournament_participants") return { select: () => participantQuery, update: () => participantUpdate };
      if (table === "matches") return { select: () => matchesQuery };
      if (table === "fixtures") return { select: () => fixturesQuery, delete: () => fixtureDelete, insert: fixtureInsert };
      return { select: () => replacementQuery };
    }),
    fixtureInsert,
  };
}

function replacementForm(replacementPlayerId = "player-5") {
  const form = new FormData();
  form.set("tournamentId", "tournament-1");
  form.set("outgoingPlayerId", "player-4");
  form.set("replacementPlayerId", replacementPlayerId);
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

  it("reports a duplicate or transactional RPC failure without rebuilding Elo", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin" });
    mocks.createClient.mockResolvedValue(adminClient(new Error("fixture already has a result")));
    await expect(recordTournamentResult(undefined, resultForm())).resolves.toEqual({
      ok: false,
      error: "Couldn't record this result. It may already be complete.",
    });
    expect(mocks.rebuildRatingCache).not.toHaveBeenCalled();
  });

  it("refuses to record a fixture skipped by standings completion", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin" });
    const client = adminClient(null, { skipped_at: "2026-07-11T04:00:00.000Z" });
    mocks.createClient.mockResolvedValue(client);
    await expect(recordTournamentResult(undefined, resultForm())).resolves.toEqual({
      ok: false,
      error: "That fixture was skipped when the tournament completed.",
    });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("surfaces cache rebuild failure after preserving the approved fact", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin" });
    mocks.createClient.mockResolvedValue(adminClient());
    mocks.rebuildRatingCache.mockRejectedValue(new Error("missing service key"));
    await expect(recordTournamentResult(undefined, resultForm())).resolves.toEqual({
      ok: false,
      error: "Result recorded, but Elo could not rebuild. Use the ratings recovery action.",
    });
  });

  it("records, rebuilds, and invalidates tournament surfaces", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin" });
    const client = adminClient();
    mocks.createClient.mockResolvedValue(client);
    await expect(recordTournamentResult(undefined, resultForm())).resolves.toEqual({
      ok: true,
      message: "Result approved and Elo rebuilt.",
    });
    expect(client.rpc).toHaveBeenCalledWith("record_tournament_result", expect.objectContaining({
      p_fixture_id: "fixture-1",
      p_winner_id: "player-1",
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
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin" });
    mocks.createClient.mockResolvedValue(replacementClient({ matchRows: [{ id: "match-1" }] }));
    await expect(replaceTournamentParticipant(undefined, replacementForm())).resolves.toEqual({
      ok: false,
      error: "The field is locked after the first result.",
    });
  });

  it("rejects a player who is already in the field", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin" });
    mocks.createClient.mockResolvedValue(replacementClient());
    await expect(replaceTournamentParticipant(undefined, replacementForm("player-3"))).resolves.toEqual({
      ok: false,
      error: "That player is already in this tournament.",
    });
  });

  it("replaces the selected seed and writes a fresh draw", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin" });
    const client = replacementClient({ fixtureRows: [{ id: "fixture-1" }] });
    mocks.createClient.mockResolvedValue(client);
    await expect(replaceTournamentParticipant(undefined, replacementForm())).resolves.toEqual({
      ok: true,
      message: "Player replaced and the draw was regenerated.",
    });
    expect(client.fixtureInsert).toHaveBeenCalledOnce();
    expect(client.fixtureInsert.mock.calls[0][0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ player1_id: "player-5" }),
      expect.objectContaining({ player2_id: "player-5" }),
    ]));
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
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin" });
    const client = { rpc: vi.fn().mockResolvedValue({ error: new Error("no fixtures") }) };
    mocks.createClient.mockResolvedValue(client);
    await expect(lockTournamentDraw(undefined, replacementForm())).resolves.toEqual({
      ok: false, error: "Couldn't lock the draw. Generate and review it first.",
    });
    expect(client.rpc).toHaveBeenCalledWith("lock_tournament_draw", { p_tournament_id: "tournament-1" });
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
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin" });
    const client = { rpc: vi.fn().mockResolvedValue({ error: null }) };
    const matchesQuery = { select: vi.fn(), eq: vi.fn() };
    matchesQuery.select.mockReturnValue(matchesQuery);
    matchesQuery.eq.mockResolvedValue({ data: [], error: null });
    const placementUpsert = vi.fn().mockResolvedValue({ error: null });
    const placementClient = { from: vi.fn((table: string) => table === "matches" ? matchesQuery : { upsert: placementUpsert }) };
    mocks.createClient.mockResolvedValueOnce(client).mockResolvedValueOnce(placementClient);
    mocks.loadTournamentBoard.mockResolvedValue({ tournament: { status: "completed", completion_path: "round_robin" }, standings: [], fixtures: [] });
    mocks.deriveOfficialPlacements.mockReturnValue([]);
    mocks.rebuildRatingCache.mockResolvedValue(undefined);
    await expect(completeTournamentFromStandings(undefined, replacementForm())).resolves.toEqual({
      ok: true, message: "Tournament complete. The round-robin standings are final.",
    });
    expect(client.rpc).toHaveBeenCalledWith("complete_tournament_from_standings", { p_tournament_id: "tournament-1" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/tournaments/tournament-1");
  });

  it("reports a required qualification decider", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin", role: "admin" });
    mocks.createClient.mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ error: { message: "complete the qualification decider first" } }) });
    await expect(completeTournamentFromStandings(undefined, replacementForm())).resolves.toEqual({
      ok: false, error: "Complete the qualification decider first.",
    });
  });
});
