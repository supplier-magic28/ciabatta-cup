import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionPlayer: vi.fn(),
  createClient: vi.fn(),
  rebuildRatingCache: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionPlayer: mocks.getSessionPlayer }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/scoring/rebuild", () => ({ rebuildRatingCache: mocks.rebuildRatingCache }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { updateTournamentPhoto } from "./actions";

function photoForm(photo?: File, removePhoto = "false") {
  const form = new FormData();
  form.set("tournamentId", "tournament-1");
  form.set("removePhoto", removePhoto);
  if (photo) form.set("photo", photo);
  return form;
}

function mockClient({ coverImageUrl = null as string | null, uploadError = null as unknown } = {}) {
  const tournamentQuery: Record<string, ReturnType<typeof vi.fn>> = {};
  tournamentQuery.select = vi.fn(() => tournamentQuery);
  tournamentQuery.eq = vi.fn(() => tournamentQuery);
  tournamentQuery.single = vi.fn().mockResolvedValue({ data: { id: "tournament-1", cover_image_url: coverImageUrl }, error: null });
  const updateBuilder = { eq: vi.fn().mockResolvedValue({ error: null }) };
  const update = vi.fn(() => updateBuilder);
  const storageApi = {
    upload: vi.fn().mockResolvedValue({ error: uploadError }),
    getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } })),
    remove: vi.fn().mockResolvedValue({ error: null }),
  };
  return {
    from: vi.fn(() => ({ select: () => tournamentQuery, update })),
    storage: { from: vi.fn(() => storageApi) },
    update,
    storageApi,
  };
}

describe("updateTournamentPhoto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionPlayer.mockResolvedValue({ id: "admin-1", role: "admin" });
  });

  it("rejects non-admin uploads before database access", async () => {
    mocks.getSessionPlayer.mockResolvedValue({ id: "player-1", role: "player" });
    await expect(updateTournamentPhoto(undefined, photoForm())).resolves.toEqual({
      ok: false,
      error: "Only admins can manage tournaments.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("uploads and saves an allowed tournament image", async () => {
    const client = mockClient();
    mocks.createClient.mockResolvedValue(client);
    const photo = new File([new Uint8Array([1, 2, 3])], "cover.webp", { type: "image/webp" });
    await expect(updateTournamentPhoto(undefined, photoForm(photo))).resolves.toEqual({
      ok: true,
      message: "Tournament photo saved.",
    });
    expect(client.storageApi.upload).toHaveBeenCalledOnce();
    expect(client.update).toHaveBeenCalledWith(expect.objectContaining({ cover_image_url: expect.stringContaining("tournament-1") }));
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/tournaments");
  });

  it("does not update the tournament when storage rejects the image", async () => {
    const client = mockClient({ uploadError: new Error("storage failed") });
    mocks.createClient.mockResolvedValue(client);
    const photo = new File([new Uint8Array([1])], "cover.jpg", { type: "image/jpeg" });
    await expect(updateTournamentPhoto(undefined, photoForm(photo))).resolves.toEqual({
      ok: false,
      error: "Couldn't upload that photo. Please try again.",
    });
    expect(client.update).not.toHaveBeenCalled();
  });

  it("removes an existing tournament photo", async () => {
    const client = mockClient({ coverImageUrl: "https://cdn.test/storage/v1/object/public/tournament-images/tournament-1/old.webp?v=1" });
    mocks.createClient.mockResolvedValue(client);
    await expect(updateTournamentPhoto(undefined, photoForm(undefined, "true"))).resolves.toEqual({
      ok: true,
      message: "Tournament photo removed.",
    });
    expect(client.update).toHaveBeenCalledWith({ cover_image_url: null });
    expect(client.storageApi.remove).toHaveBeenCalledWith(["tournament-1/old.webp"]);
  });
});
