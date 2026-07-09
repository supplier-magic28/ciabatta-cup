import { describe, it, expect } from "vitest";
import { displayName } from "./displayName";

describe("displayName", () => {
  it("uses the full name when both parts are present", () => {
    expect(displayName({ firstName: "Ben", lastName: "Cossar" })).toBe(
      "Ben Cossar",
    );
  });

  it("falls back to whichever name part exists", () => {
    expect(displayName({ firstName: "Ben", lastName: "" })).toBe("Ben");
    expect(displayName({ firstName: null, lastName: "Cossar" })).toBe("Cossar");
  });

  it("falls back to the email local-part when no name is set", () => {
    expect(displayName({ email: "michaels@kumove.com" })).toBe("michaels");
  });

  it("trims whitespace", () => {
    expect(displayName({ firstName: "  Ben  ", lastName: " Cossar " })).toBe(
      "Ben Cossar",
    );
  });

  it("uses a generic label when nothing usable is provided", () => {
    expect(displayName({})).toBe("player");
    expect(displayName({ firstName: "  ", email: "  " })).toBe("player");
  });
});
