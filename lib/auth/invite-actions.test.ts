import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { completeInvite } from "./invite-actions";

function passwordForm(password = "fresh-bread", confirmation = password) {
  const form = new FormData();
  form.set("password", password);
  form.set("passwordConfirmation", confirmation);
  return form;
}

function mockSupabase({
  user = { id: "player-1" } as { id: string } | null,
  status = "invited" as string | null,
  passwordError = null as { message: string } | null,
  activationError = null as { message: string } | null,
} = {}) {
  const single = vi.fn().mockResolvedValue({
    data: status === null ? null : { status },
  });
  const selectEq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq: selectEq }));
  const activationStatusEq = vi.fn().mockResolvedValue({ error: activationError });
  const activationIdEq = vi.fn(() => ({ eq: activationStatusEq }));
  const update = vi.fn(() => ({ eq: activationIdEq }));
  const updateUser = vi.fn().mockResolvedValue({ error: passwordError });
  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
      updateUser,
    },
    from: vi.fn(() => ({ select, update })),
  };
  mocks.createClient.mockResolvedValue(client);
  return { client, updateUser, update, activationStatusEq };
}

describe("completeInvite", () => {
  beforeEach(() => {
    mocks.createClient.mockReset();
    mocks.redirect.mockClear();
  });

  it("validates passwords before creating a Supabase client", async () => {
    await expect(completeInvite(undefined, passwordForm("short"))).resolves.toEqual({
      error: "Password must be at least 8 characters.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("rejects an expired invite session", async () => {
    const { updateUser } = mockSupabase({ user: null });

    await expect(completeInvite(undefined, passwordForm())).resolves.toEqual({
      error: "This invitation has expired. Ask an admin for a new invite.",
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("rejects a user whose invited profile is no longer pending", async () => {
    const { updateUser } = mockSupabase({ status: "active" });

    await expect(completeInvite(undefined, passwordForm())).resolves.toEqual({
      error: "This invitation has already been completed.",
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("does not activate the player when the password update fails", async () => {
    const { update, activationStatusEq } = mockSupabase({
      passwordError: { message: "auth failure" },
    });

    await expect(completeInvite(undefined, passwordForm())).resolves.toEqual({
      error: "Couldn't save your password. Please try again.",
    });
    expect(update).not.toHaveBeenCalled();
    expect(activationStatusEq).not.toHaveBeenCalled();
  });

  it("reports a partial failure when profile activation fails", async () => {
    const { updateUser } = mockSupabase({
      activationError: { message: "database failure" },
    });

    await expect(completeInvite(undefined, passwordForm())).resolves.toEqual({
      error: "Password saved, but activation failed. Please try again.",
    });
    expect(updateUser).toHaveBeenCalledWith({ password: "fresh-bread" });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("sets the password, activates the invited player, and enters the app", async () => {
    const { updateUser, update, activationStatusEq } = mockSupabase();

    await expect(completeInvite(undefined, passwordForm())).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(updateUser).toHaveBeenCalledWith({ password: "fresh-bread" });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active", joined_at: expect.any(String) }),
    );
    expect(activationStatusEq).toHaveBeenCalledWith("status", "invited");
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });
});
