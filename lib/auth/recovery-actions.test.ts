import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { requestPasswordReset, updatePassword } from "./recovery-actions";

function passwordForm(password = "fresh-bread", confirmation = password) {
  const form = new FormData();
  form.set("password", password);
  form.set("passwordConfirmation", confirmation);
  return form;
}

function mockSupabase({
  user = { id: "player-1" } as { id: string } | null,
  status = "active" as string | null,
  resetError = null as { message: string } | null,
  passwordError = null as { message: string } | null,
  activationError = null as { message: string } | null,
} = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({
    data: status === null ? null : { status },
  });
  const selectEq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq: selectEq }));
  const activationStatusEq = vi.fn().mockResolvedValue({ error: activationError });
  const activationIdEq = vi.fn(() => ({ eq: activationStatusEq }));
  const update = vi.fn(() => ({ eq: activationIdEq }));
  const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: resetError });
  const updateUser = vi.fn().mockResolvedValue({ error: passwordError });
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
      resetPasswordForEmail,
      updateUser,
    },
    from: vi.fn(() => ({ select, update })),
  };
  mocks.createClient.mockResolvedValue(client);
  return { client, resetPasswordForEmail, updateUser, update, activationStatusEq };
}

describe("requestPasswordReset", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.headers.mockResolvedValue({ get: () => "http://localhost:3000" });
    mocks.redirect.mockClear();
  });

  it("validates the email before making a request", async () => {
    await expect(requestPasswordReset(undefined, new FormData())).resolves.toEqual({
      error: "Enter your email address.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("requests a recovery email with the update-password callback", async () => {
    const { resetPasswordForEmail } = mockSupabase();
    const form = new FormData();
    form.set("email", " PLAYER@EXAMPLE.COM ");

    await expect(requestPasswordReset(undefined, form)).resolves.toEqual({ sent: true });
    expect(resetPasswordForEmail).toHaveBeenCalledWith("player@example.com", {
      redirectTo: "http://localhost:3000/auth/confirm?next=%2Fupdate-password",
    });
  });
});

describe("updatePassword", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.redirect.mockClear();
  });

  it("does not create a client for invalid passwords", async () => {
    await expect(updatePassword(undefined, passwordForm("short"))).resolves.toEqual({
      error: "Password must be at least 8 characters.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("updates an active player's password and enters the app", async () => {
    const { updateUser, update } = mockSupabase();

    await expect(updatePassword(undefined, passwordForm())).rejects.toThrow("NEXT_REDIRECT");
    expect(updateUser).toHaveBeenCalledWith({ password: "fresh-bread" });
    expect(update).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("activates an invited player only after saving the password", async () => {
    const { updateUser, update, activationStatusEq } = mockSupabase({ status: "invited" });

    await expect(updatePassword(undefined, passwordForm())).rejects.toThrow("NEXT_REDIRECT");
    expect(updateUser).toHaveBeenCalledWith({ password: "fresh-bread" });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", joined_at: expect.any(String) }),
    );
    expect(activationStatusEq).toHaveBeenCalledWith("status", "invited");
  });
});
