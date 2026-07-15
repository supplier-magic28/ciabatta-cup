import { describe, expect, it } from "vitest";
import { buildOrderedTournamentRoster, includePersistedTournamentPlayers } from "./roster";

describe("tournament roster presentation", () => {
  it("places persisted players by seed rather than query position", () => {
    expect(buildOrderedTournamentRoster(5, [
      { id: "player-2", seed: 2 },
      { id: "player-1", seed: 1 },
    ])).toEqual(["player-1", "player-2", "", "", ""]);
  });

  it("keeps a persisted participant visible when absent from active options", () => {
    expect(includePersistedTournamentPlayers(
      [{ id: "active", name: "Active player", avatarUrl: null }],
      [{ id: "saved", seed: 1, name: "Saved player" }],
    )).toEqual([
      { id: "active", name: "Active player", avatarUrl: null },
      { id: "saved", name: "Saved player", avatarUrl: null },
    ]);
  });
});
