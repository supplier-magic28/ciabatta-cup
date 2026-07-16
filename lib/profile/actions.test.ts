import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionPlayer: vi.fn(),
  createClient: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getSessionPlayer: mocks.getSessionPlayer }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { updateProfileSettings } from "./actions";

function query(data: unknown) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.single = vi.fn().mockResolvedValue({ data, error: null });
  return builder;
}

function client({ avatarUrl = null as string | null, uploadError = null as unknown } = {}) {
  const updateBuilder = {
    eq: vi.fn().mockResolvedValue({ error: null }),
  };
  const update = vi.fn(() => updateBuilder);
  const storage = {
    upload: vi.fn().mockResolvedValue({ error: uploadError }),
    getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } })),
    remove: vi.fn().mockResolvedValue({ error: null }),
  };
  const current = query({ avatar_url: avatarUrl });
  return {
    from: vi.fn((table: string) => table === "players"
      ? { select: () => current, update }
      : {}),
    storage: { from: vi.fn(() => storage) },
    update,
    storageApi: storage,
  };
}

function form({ nickname = "", useNickname = "real-name", avatar, removeAvatar = "false" }: {
  nickname?: string;
  useNickname?: string;
  avatar?: File;
  removeAvatar?: string;
} = {}) {
  const data = new FormData();
  data.set("nickname", nickname);
  data.set("useNickname", useNickname);
  data.set("removeAvatar", removeAvatar);
  if (avatar) data.set("avatar", avatar);
  return data;
}

describe("updateProfileSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionPlayer.mockResolvedValue({ id: "player-1", role: "player", status: "active" });
  });

  it("rejects unauthenticated profile changes", async () => {
    mocks.getSessionPlayer.mockResolvedValue(null);
    await expect(updateProfileSettings(undefined, form())).resolves.toEqual({
      ok: false,
      error: "You need to be signed in to update your profile.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("requires a nickname when nickname display is enabled", async () => {
    await expect(updateProfileSettings(undefined, form({ useNickname: "nickname" }))).resolves.toEqual({
      ok: false,
      error: "Add a nickname before choosing to use it publicly.",
    });
  });

  it("saves nickname preference without making nicknames unique", async () => {
    const first = client();
    mocks.createClient.mockResolvedValue(first);
    await expect(updateProfileSettings(undefined, form({ nickname: "The Breadwinner", useNickname: "nickname" }))).resolves.toEqual({
      ok: true,
      message: "Profile settings saved.",
    });
    expect(first.update).toHaveBeenCalledWith({ nickname: "The Breadwinner", use_nickname: true, avatar_url: null });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("uploads an avatar before updating the profile row", async () => {
    const first = client();
    mocks.createClient.mockResolvedValue(first);
    const avatar = new File([new Uint8Array([1, 2, 3])], "avatar.webp", { type: "image/webp" });
    await expect(updateProfileSettings(undefined, form({ avatar }))).resolves.toEqual({
      ok: true,
      message: "Profile settings saved.",
    });
    expect(first.storageApi.upload).toHaveBeenCalledOnce();
    expect(first.update).toHaveBeenCalledWith(expect.objectContaining({ avatar_url: expect.stringContaining("avatar.webp") }));
  });

  it("does not update the profile when storage upload fails", async () => {
    const first = client({ uploadError: new Error("storage unavailable") });
    mocks.createClient.mockResolvedValue(first);
    const avatar = new File([new Uint8Array([1])], "avatar.webp", { type: "image/webp" });
    await expect(updateProfileSettings(undefined, form({ avatar }))).resolves.toEqual({
      ok: false,
      error: "Couldn't upload that picture. Please try again.",
    });
    expect(first.update).not.toHaveBeenCalled();
  });

  it("removes an existing avatar when requested", async () => {
    const first = client({ avatarUrl: "https://cdn.test/storage/v1/object/public/avatars/player-1/old.webp?v=1" });
    mocks.createClient.mockResolvedValue(first);
    await expect(updateProfileSettings(undefined, form({ removeAvatar: "true" }))).resolves.toEqual({
      ok: true,
      message: "Profile settings saved.",
    });
    expect(first.update).toHaveBeenCalledWith({ nickname: null, use_nickname: false, avatar_url: null });
    expect(first.storageApi.remove).toHaveBeenCalledWith(["player-1/old.webp"]);
  });
});
