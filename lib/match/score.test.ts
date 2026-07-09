import { describe, it, expect } from "vitest";
import { formatScore, type ScoreSet } from "./score";

function set(p1Games: number, p2Games: number, tb?: [number, number]): ScoreSet {
  return {
    p1Games,
    p2Games,
    tiebreakP1: tb ? tb[0] : null,
    tiebreakP2: tb ? tb[1] : null,
  };
}

describe("formatScore", () => {
  it("formats a single set player1-first", () => {
    expect(formatScore([set(6, 4)])).toBe("6–4");
  });

  it("joins multiple sets with commas", () => {
    expect(formatScore([set(6, 4), set(3, 6), set(6, 2)])).toBe("6–4, 3–6, 6–2");
  });

  it("shows a tie-break in parentheses", () => {
    expect(formatScore([set(7, 6, [7, 5])])).toBe("7–6 (7–5)");
  });

  it("returns an empty string for no sets", () => {
    expect(formatScore([])).toBe("");
  });
});
