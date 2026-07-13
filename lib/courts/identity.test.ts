import { describe, expect, it } from "vitest";
import { canonicalCourtId, normalizeCourtName } from "./identity";

describe("court identity", () => {
  it("matches names case-insensitively after trimming", () => {
    expect(normalizeCourtName("  Northcote Tennis Club ")).toBe(normalizeCourtName("northcote tennis club"));
  });

  it("follows merged aliases and rejects cycles", () => {
    expect(canonicalCourtId("old", new Map([["old", "new"], ["new", "canonical"], ["canonical", null]]))).toBe("canonical");
    expect(() => canonicalCourtId("a", new Map([["a", "b"], ["b", "a"]]))).toThrow("cycle");
  });
});
