import { describe, it, expect } from "vitest";
import { validateSubmission } from "./submission";
import type { MatchSubmission, SetScore } from "./types";

const SELF = "me";
const OPP = "opponent";

function set(selfGames: number, opponentGames: number, tb?: [number, number]): SetScore {
  return {
    selfGames,
    opponentGames,
    selfTiebreak: tb ? tb[0] : null,
    opponentTiebreak: tb ? tb[1] : null,
  };
}

function submission(overrides: Partial<MatchSubmission> = {}): MatchSubmission {
  return {
    opponentId: OPP,
    type: "ranked",
    format: "best_of_3",
    formatNote: "",
    sets: [set(6, 4), set(6, 3)],
    ...overrides,
  };
}

describe("validateSubmission", () => {
  it("rejects playing yourself", () => {
    const result = validateSubmission(submission({ opponentId: SELF }), SELF);
    expect(result).toEqual({ ok: false, error: "You can't log a match against yourself." });
  });

  it("rejects a missing opponent", () => {
    const result = validateSubmission(submission({ opponentId: "" }), SELF);
    expect(result.ok).toBe(false);
  });

  it("derives the winner as the submitter when they win more sets", () => {
    const result = validateSubmission(submission({ sets: [set(6, 4), set(6, 3)] }), SELF);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.winnerId).toBe(SELF);
  });

  it("derives the winner as the opponent when they win more sets", () => {
    const result = validateSubmission(submission({ sets: [set(4, 6), set(3, 6)] }), SELF);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.winnerId).toBe(OPP);
  });

  it("handles a deciding third set", () => {
    const result = validateSubmission(submission({ sets: [set(6, 4), set(4, 6), set(6, 3)] }), SELF);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.winnerId).toBe(SELF);
      expect(result.value.sets).toHaveLength(3);
      expect(result.value.sets[2].setNumber).toBe(3);
    }
  });

  it("lets the tie-break decide a set with level games", () => {
    const result = validateSubmission(
      submission({ format: "one_set", sets: [set(6, 6, [7, 5])] }),
      SELF,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.winnerId).toBe(SELF);
  });

  it("rejects a match with no clear winner (a set each)", () => {
    const result = validateSubmission(submission({ sets: [set(6, 4), set(4, 6)] }), SELF);
    expect(result).toEqual({
      ok: false,
      error: "The match needs a clear winner — one player must win more sets.",
    });
  });

  it("rejects a set that is a tie with no tie-break", () => {
    const result = validateSubmission(submission({ sets: [set(6, 6)] }), SELF);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("needs a winner");
  });

  it("rejects a half-entered tie-break", () => {
    const lopsided: SetScore = { selfGames: 6, opponentGames: 6, selfTiebreak: 7, opponentTiebreak: null };
    const result = validateSubmission(submission({ sets: [lopsided] }), SELF);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("both tie-break");
  });

  it("rejects out-of-range game scores", () => {
    const result = validateSubmission(submission({ sets: [set(6, 99)] }), SELF);
    expect(result.ok).toBe(false);
  });

  it("requires a note for custom format and drops it otherwise", () => {
    expect(validateSubmission(submission({ format: "custom", formatNote: "" }), SELF).ok).toBe(false);

    const custom = validateSubmission(
      submission({ format: "custom", formatNote: " first to 4 " }),
      SELF,
    );
    expect(custom.ok).toBe(true);
    if (custom.ok) expect(custom.value.formatNote).toBe("first to 4");

    const ranked = validateSubmission(submission({ format: "one_set", formatNote: "ignored", sets: [set(6, 3)] }), SELF);
    expect(ranked.ok).toBe(true);
    if (ranked.ok) expect(ranked.value.formatNote).toBeNull();
  });

  it("is pure — it does not mutate its input", () => {
    const input = submission();
    const snapshot = structuredClone(input);
    validateSubmission(input, SELF);
    expect(input).toEqual(snapshot);
  });
});
