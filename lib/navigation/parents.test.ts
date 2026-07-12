import { describe, expect, it } from "vitest";
import { PARENT_ROUTES } from "./parents";

describe("parent navigation routes", () => {
  it("keeps workflow exits deterministic", () => {
    expect(PARENT_ROUTES).toEqual({ ladder: "/", matches: "/matches", cups: "/tournaments" });
  });
});
