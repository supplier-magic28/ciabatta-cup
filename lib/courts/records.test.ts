import { describe, expect, it } from "vitest";
import { deriveSurfaceRecords, type SurfaceMatch } from "./records";

const match = (patch: Partial<SurfaceMatch> = {}): SurfaceMatch => ({
  type: "ranked", tournamentId: null, surface: "hard", player1Id: "p1", player2Id: "p2", winnerId: "p1", ...patch,
});

describe("deriveSurfaceRecords", () => {
  it("counts tagged ranked and cup matches only", () => {
    const result = deriveSurfaceRecords("p1", [
      match(), match({ surface: "hard", winnerId: "p2" }),
      match({ type: "exhibition", surface: "clay" }),
      match({ type: "exhibition", tournamentId: "cup", surface: "grass" }),
      match({ surface: null }),
    ]);
    expect(result.records.find((row) => row.surface === "hard")).toMatchObject({ won: 1, lost: 1, played: 2, winPercent: 50 });
    expect(result.records.find((row) => row.surface === "grass")).toMatchObject({ won: 1, played: 1, winPercent: 100 });
    expect(result.records.find((row) => row.surface === "clay")?.played).toBe(0);
    expect(result.untagged).toBe(1);
  });
});
