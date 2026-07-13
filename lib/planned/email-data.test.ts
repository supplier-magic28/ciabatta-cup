import { describe, expect, it } from "vitest";
import {
  formatLabel,
  formatPlannedDateTime,
  formatPlayedDate,
  matchTypeLabel,
  resolveResultNames,
} from "./email-data";

describe("planned email lifecycle data", () => {
  it("formats lifecycle dates on the Melbourne calendar", () => {
    expect(formatPlannedDateTime("2026-07-13T21:38:00.000Z")).toBe("14 July 2026 at 7:38 am");
    expect(formatPlayedDate("2026-07-13T14:30:00.000Z")).toBe("14 July 2026");
  });

  it("maps every supported match format and type label", () => {
    expect(formatLabel("one_set", null)).toBe("SINGLE SET");
    expect(formatLabel("best_of_3", null)).toBe("BEST OF 3");
    expect(formatLabel("pro_set_8", null)).toBe("PRO SET");
    expect(formatLabel("custom", "Fast four")).toBe("FAST FOUR");
    expect(matchTypeLabel("ranked", "one_set", null)).toBe("RANKED · SINGLE SET");
    expect(matchTypeLabel("exhibition", "best_of_3", null)).toBe("NON-RANKED · BEST OF 3");
    expect(matchTypeLabel("unranked_external", "pro_set_8", null)).toBe("NON-CIABATTA · PRO SET");
  });

  it("resolves internal winners by ID rather than display name", () => {
    expect(resolveResultNames({
      player1Id: "one",
      player2Id: "two",
      winnerId: "two",
      externalWon: false,
      externalName: null,
      players: [
        { id: "one", firstName: "Alex" },
        { id: "two", firstName: "Alex" },
      ],
    })).toEqual({ winnerName: "Alex", loserName: "Alex" });
  });

  it("uses external_won for an external result", () => {
    const base = {
      player1Id: "owner",
      player2Id: null,
      winnerId: null,
      externalName: "Visitor",
      players: [{ id: "owner", firstName: "Ringo" }],
    };
    expect(resolveResultNames({ ...base, externalWon: true })).toEqual({
      winnerName: "Visitor",
      loserName: "Ringo",
    });
    expect(resolveResultNames({ ...base, winnerId: "owner", externalWon: false })).toEqual({
      winnerName: "Ringo",
      loserName: "Visitor",
    });
  });
});
