import { describe, expect, it } from "vitest";
import { setAllExpanded, toggleExpanded } from "./expansion";

describe("leaderboard expansion state", () => {
  it("toggles one player without changing the input", () => {
    const current = new Set(["alice"]);
    expect([...toggleExpanded(current, "bob")]).toEqual(["alice", "bob"]);
    expect([...toggleExpanded(current, "alice")]).toEqual([]);
    expect([...current]).toEqual(["alice"]);
  });

  it("expands and collapses every player", () => {
    expect([...setAllExpanded(["alice", "bob"], true)]).toEqual(["alice", "bob"]);
    expect([...setAllExpanded(["alice", "bob"], false)]).toEqual([]);
  });
});
