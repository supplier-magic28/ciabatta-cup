import { describe, expect, it } from "vitest";
import {
  buildRecoveryRedirectTo,
  safeAuthDestination,
  validatePassword,
} from "./recovery";

describe("password recovery helpers", () => {
  it("requires a matching password of at least eight characters", () => {
    expect(validatePassword("short", "short")).toEqual({
      ok: false,
      error: "Password must be at least 8 characters.",
    });
    expect(validatePassword("fresh-bread", "different")).toEqual({
      ok: false,
      error: "Passwords do not match.",
    });
    expect(validatePassword("fresh-bread", "fresh-bread")).toEqual({
      ok: true,
      password: "fresh-bread",
    });
  });

  it("builds a recovery callback on the configured site", () => {
    expect(buildRecoveryRedirectTo("https://ciabatta-cup.app", null)).toBe(
      "https://ciabatta-cup.app/auth/confirm?next=%2Fupdate-password",
    );
  });

  it("falls back to the request origin and rejects invalid destinations", () => {
    expect(buildRecoveryRedirectTo(undefined, "http://localhost:3000")).toBe(
      "http://localhost:3000/auth/confirm?next=%2Fupdate-password",
    );
    expect(safeAuthDestination("https://example.com")).toBe("/");
    expect(safeAuthDestination("//example.com")).toBe("/");
    expect(safeAuthDestination("/update-password")).toBe("/update-password");
  });
});
