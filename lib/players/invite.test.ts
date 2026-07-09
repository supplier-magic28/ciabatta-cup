import { describe, it, expect } from "vitest";
import { validateInvite } from "./invite";
import type { InviteInput } from "./invite";

function input(overrides: Partial<InviteInput> = {}): InviteInput {
  return { firstName: "Ollie", lastName: "Fenn", email: "ollie@fenn.io", ...overrides };
}

describe("validateInvite", () => {
  it("accepts a well-formed invite and normalises name + email", () => {
    const result = validateInvite(input({ firstName: "  Ollie ", email: "Ollie@Fenn.IO " }));
    expect(result).toEqual({
      ok: true,
      value: { firstName: "Ollie", lastName: "Fenn", email: "ollie@fenn.io" },
    });
  });

  it("requires both names", () => {
    expect(validateInvite(input({ firstName: "" })).ok).toBe(false);
    expect(validateInvite(input({ lastName: "  " })).ok).toBe(false);
  });

  it("requires an email", () => {
    const result = validateInvite(input({ email: "" }));
    expect(result).toEqual({ ok: false, error: "Enter an email address." });
  });

  it("rejects a malformed email", () => {
    const result = validateInvite(input({ email: "not-an-email" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("valid email");
  });

  it("is pure — it does not mutate its input", () => {
    const original = input();
    const snapshot = structuredClone(original);
    validateInvite(original);
    expect(original).toEqual(snapshot);
  });
});
