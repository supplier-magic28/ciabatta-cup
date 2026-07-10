"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSessionPlayer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildInviteRedirectTo, validateInvite } from "./invite";

export type InviteState = { error: string } | { sent: string } | undefined;
export type DeletePlayerState = { error: string } | { deleted: string } | undefined;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Admin-only: invite a player by name + email (ADR-0002, ADR-0009).
 *
 * `inviteUserByEmail` creates the `auth.users` row; the `handle_new_user`
 * trigger then creates their `players` profile at `status = 'invited'` (because
 * the auth user has `invited_at` set). The invitee later chooses a password and
 * is flipped to `active` by the acceptance action (ADR-0013).
 *
 * Admin-only is enforced two ways: this check on the session player's admin role
 * (Server Actions are POST-reachable, so we re-check), and the players table's
 * `is_admin()` RLS policies that govern all profile management. The invite uses
 * the secret-key admin client, which non-admins never reach.
 */
export async function inviteUser(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const player = await getSessionPlayer();
  if (!player || player.role !== "admin") {
    return { error: "Only admins can invite players." };
  }

  const validated = validateInvite({
    firstName: String(formData.get("firstName") ?? ""),
    lastName: String(formData.get("lastName") ?? ""),
    email: String(formData.get("email") ?? ""),
  });
  if (!validated.ok) return { error: validated.error };
  const { firstName, lastName, email } = validated.value;

  // Where Supabase sends the invitee after they accept. /auth/confirm verifies
  // the token and /accept-invite handles password setup + activation.
  const redirectTo = buildInviteRedirectTo(
    process.env.NEXT_PUBLIC_SITE_URL,
    (await headers()).get("origin"),
  );

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { first_name: firstName, last_name: lastName },
    redirectTo,
  });

  if (error) {
    console.error("Supabase inviteUserByEmail failed", error);
    const alreadyExists = /already|registered|exist/i.test(error.message);
    const databaseFailure = /database|saving new user/i.test(error.message);
    return {
      error: alreadyExists
        ? "That email already belongs to a player."
        : databaseFailure
          ? "Couldn't create the player profile. Check the latest database migration."
          : "Couldn't send the invite — please try again.",
    };
  }

  revalidatePath("/admin/players");
  return { sent: email };
}

/** Permanently remove a player only when no immutable match facts reference them. */
export async function deletePlayer(
  _previous: DeletePlayerState,
  formData: FormData,
): Promise<DeletePlayerState> {
  const actor = await getSessionPlayer();
  if (!actor || actor.role !== "admin") {
    return { error: "Only admins can delete players." };
  }

  const playerId = String(formData.get("playerId") ?? "").trim();
  if (!UUID_PATTERN.test(playerId)) return { error: "Invalid player." };
  if (playerId === actor.id) return { error: "You cannot delete your own account." };

  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin
    .from("players")
    .select("id, first_name, last_name, email")
    .eq("id", playerId)
    .maybeSingle();
  if (targetError) {
    console.error("Could not load player before deletion", targetError);
    return { error: "Couldn't check that player. Please try again." };
  }
  if (!target) return { error: "That player no longer exists." };

  const { count, error: matchError } = await admin
    .from("matches")
    .select("id", { count: "exact", head: true })
    .or(
      `player1_id.eq.${playerId},player2_id.eq.${playerId},winner_id.eq.${playerId},submitted_by.eq.${playerId}`,
    );
  if (matchError) {
    console.error("Could not check player match history before deletion", matchError);
    return { error: "Couldn't check that player's match history." };
  }
  if ((count ?? 0) > 0) {
    return { error: "Players with match history cannot be deleted. Deactivate them instead." };
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(playerId);
  if (deleteError) {
    console.error("Supabase deleteUser failed", deleteError);
    return { error: "Couldn't delete that player. Please try again." };
  }

  revalidatePath("/admin/players");
  revalidatePath("/");
  return {
    deleted:
      [target.first_name, target.last_name].filter(Boolean).join(" ") || target.email,
  };
}
