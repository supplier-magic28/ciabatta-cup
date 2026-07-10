import { describe, expect, it } from "vitest";
import { confirmationDestination, validateInvitePassword } from "./invite";

describe("validateInvitePassword", () => {
  it("accepts matching passwords of at least eight characters", () => {
    expect(validateInvitePassword("fresh-bread", "fresh-bread")).toEqual({
      ok: true,
      password: "fresh-bread",
    });
  });

  it("rejects short and mismatched passwords", () => {
    expect(validateInvitePassword("short", "short")).toEqual({
      ok: false,
      error: "Password must be at least 8 characters.",
    });
    expect(validateInvitePassword("fresh-bread", "other-bread")).toEqual({
      ok: false,
      error: "Passwords do not match.",
    });
  });
});

describe("confirmationDestination", () => {
  it("routes invite tokens to password setup", () => {
    expect(confirmationDestination("invite", "/")).toBe("/accept-invite");
  });

  it("preserves safe paths for other email token types", () => {
    expect(confirmationDestination("email", "/matches")).toBe("/matches");
  });

  it("rejects absolute and protocol-relative redirect targets", () => {
    expect(confirmationDestination("email", "https://example.com")).toBe("/");
    expect(confirmationDestination("email", "//example.com")).toBe("/");
  });
});
