"use server";

import { revalidatePath } from "next/cache";
import { getSessionPlayer } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { AVATAR_MIME_TYPES, MAX_AVATAR_UPLOAD_BYTES } from "./crop";
import { dateKeyInZone } from "./streak";

export type ProfileActionState =
  | { ok: true; message: string }
  | { ok: false; error: string };

const MAX_NICKNAME_LENGTH = 32;

function oldAvatarPath(url: string | null): string | null {
  if (!url) return null;
  const marker = "/storage/v1/object/public/avatars/";
  const path = url.split(marker)[1]?.split("?")[0];
  return path ? decodeURIComponent(path) : null;
}

function invalidateProfile(playerId: string) {
  revalidatePath("/profile");
  revalidatePath("/");
  revalidatePath("/matches");
  revalidatePath("/matches/new");
  revalidatePath("/tournaments");
  revalidatePath("/players/[playerId]", "page");
  revalidatePath(`/players/${playerId}`);
}

export async function updateProfileSettings(
  _previous: ProfileActionState | undefined,
  formData: FormData,
): Promise<ProfileActionState> {
  const player = await getSessionPlayer();
  if (!player) return { ok: false, error: "You need to be signed in to update your profile." };

  const nickname = String(formData.get("nickname") ?? "").trim();
  const useNickname = formData.get("useNickname") === "nickname";
  const removeAvatar = formData.get("removeAvatar") === "true";
  const avatar = formData.get("avatar");

  if (nickname.length > MAX_NICKNAME_LENGTH) {
    return { ok: false, error: `Your nickname must be ${MAX_NICKNAME_LENGTH} characters or fewer.` };
  }
  if (useNickname && !nickname) {
    return { ok: false, error: "Add a nickname before choosing to use it publicly." };
  }
  if (avatar instanceof File && avatar.size > 0) {
    if (!AVATAR_MIME_TYPES.includes(avatar.type as (typeof AVATAR_MIME_TYPES)[number])) {
      return { ok: false, error: "Use a JPEG, PNG, or WebP image." };
    }
    if (avatar.size > MAX_AVATAR_UPLOAD_BYTES) {
      return { ok: false, error: "That image is too large. Choose one under 5 MB." };
    }
  }

  const supabase = await createClient();
  const { data: current } = await supabase
    .from("players")
    .select("avatar_url")
    .eq("id", player.id)
    .single();
  if (!current) return { ok: false, error: "Your profile could not be found." };

  let nextAvatarUrl = current.avatar_url as string | null;
  let uploadedPath: string | null = null;
  const storage = supabase.storage.from("avatars");

  if (avatar instanceof File && avatar.size > 0) {
    uploadedPath = `${player.id}/${Date.now()}-avatar.webp`;
    const { error: uploadError } = await storage.upload(uploadedPath, avatar, {
      contentType: avatar.type,
      upsert: false,
      cacheControl: "31536000",
    });
    if (uploadError) return { ok: false, error: "Couldn't upload that picture. Please try again." };
    nextAvatarUrl = `${storage.getPublicUrl(uploadedPath).data.publicUrl}?v=${Date.now()}`;
  } else if (removeAvatar) {
    nextAvatarUrl = null;
  }

  const { error: updateError } = await supabase
    .from("players")
    .update({
      nickname: nickname || null,
      use_nickname: useNickname,
      avatar_url: nextAvatarUrl,
    })
    .eq("id", player.id);
  if (updateError) {
    if (uploadedPath) await storage.remove([uploadedPath]);
    return { ok: false, error: "Couldn't save your profile. Please try again." };
  }

  const previousPath = oldAvatarPath(current.avatar_url);
  if (previousPath && (uploadedPath || removeAvatar)) await storage.remove([previousPath]);

  invalidateProfile(player.id);
  return { ok: true, message: "Profile settings saved." };
}

export async function setPlayedToday(
  _previous: ProfileActionState | undefined,
  formData: FormData,
): Promise<ProfileActionState> {
  const player = await getSessionPlayer();
  if (!player) return { ok: false, error: "You need to be signed in." };
  const today = dateKeyInZone(new Date());
  const remove = formData.get("mode") === "remove";
  const supabase = await createClient();
  const query = supabase.from("play_days");
  const { error } = remove
    ? await query.delete().eq("player_id", player.id).eq("played_on", today)
    : await query.upsert({ player_id: player.id, played_on: today }, { onConflict: "player_id,played_on", ignoreDuplicates: true });
  if (error) return { ok: false, error: "Couldn't update today's tennis mark." };
  revalidatePath("/profile/streak");
  return { ok: true, message: remove ? "Today's manual mark removed." : "Today counts as played." };
}
