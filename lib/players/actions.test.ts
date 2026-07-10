import { beforeEach, describe, expect, it, vi } from "vitest";

const ACTOR_ID = "0fcd555c-85b1-43b6-a6a2-780c13c84550";
const TARGET_ID = "1fcd555c-85b1-43b6-a6a2-780c13c84551";

const mocks = vi.hoisted(() => ({
  getSessionPlayer: vi.fn(),
  createAdminClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionPlayer: mocks.getSessionPlayer }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { deletePlayer } from "./actions";

function deleteForm(playerId = TARGET_ID) {
  const form = new FormData();
  form.set("playerId", playerId);
  return form;
}

function mockAdmin({
  target = {
    id: TARGET_ID,
    first_name: "Ringo",
    last_name: "Test",
    email: "test@example.com",
  } as Record<string, string> | null,
  targetError = null as { message: string } | null,
  matchCount = 0,
  matchError = null as { message: string } | null,
  deleteError = null as { message: string } | null,
} = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: target, error: targetError });
  const playerEq = vi.fn(() => ({ maybeSingle }));
  const playerSelect = vi.fn(() => ({ eq: playerEq }));
  const matchOr = vi.fn().mockResolvedValue({ count: matchCount, error: matchError });
  const matchSelect = vi.fn(() => ({ or: matchOr }));
  const deleteUser = vi.fn().mockResolvedValue({ error: deleteError });
  const client = {
    from: vi.fn((table: string) =>
      table === "players" ? { select: playerSelect } : { select: matchSelect },
    ),
    auth: { admin: { deleteUser } },
  };
  mocks.createAdminClient.mockReturnValue(client);
  return { deleteUser, matchOr };
}

describe("deletePlayer", () => {
  beforeEach(() => {
    mocks.getSessionPlayer.mockReset();
    mocks.createAdminClient.mockReset();
    mocks.revalidatePath.mockReset();
  });

  it("rejects non-admins before creating a service-role client", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: ACTOR_ID, role: "player" });

    await expect(deletePlayer(undefined, deleteForm())).resolves.toEqual({
      error: "Only admins can delete players.",
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects invalid ids and self-deletion", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: ACTOR_ID, role: "admin" });

    await expect(deletePlayer(undefined, deleteForm("not-a-uuid"))).resolves.toEqual({
      error: "Invalid player.",
    });
    await expect(deletePlayer(undefined, deleteForm(ACTOR_ID))).resolves.toEqual({
      error: "You cannot delete your own account.",
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("refuses to erase a player referenced by match facts", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: ACTOR_ID, role: "admin" });
    const { deleteUser } = mockAdmin({ matchCount: 1 });

    await expect(deletePlayer(undefined, deleteForm())).resolves.toEqual({
      error: "Players with match history cannot be deleted. Deactivate them instead.",
    });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("deletes an unused Auth identity and invalidates roster surfaces", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: ACTOR_ID, role: "admin" });
    const { deleteUser } = mockAdmin();

    await expect(deletePlayer(undefined, deleteForm())).resolves.toEqual({
      deleted: "Ringo Test",
    });
    expect(deleteUser).toHaveBeenCalledWith(TARGET_ID);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/players");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("returns a friendly error when Supabase deletion fails", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: ACTOR_ID, role: "admin" });
    mockAdmin({ deleteError: { message: "foreign key violation" } });

    await expect(deletePlayer(undefined, deleteForm())).resolves.toEqual({
      error: "Couldn't delete that player. Please try again.",
    });
  });
});
