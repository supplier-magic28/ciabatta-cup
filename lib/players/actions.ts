"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getSessionPlayer } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildInviteRedirectTo, validateInvite } from "./invite";

export type InviteState = { error: string } | { sent: string } | undefined;

/**
 * Admin-only: invite a player by name + email (ADR-0002, ADR-0009).
 *
 * `inviteUserByEmail` creates the `auth.users` row; the `handle_new_user`
 * trigger then creates their `players` profile at `status = 'invited'` (because
 * the auth user has `invited_at` set). The invitee later completes signup and is
 * flipped to `active` by the existing `ensureActivated` (reused, not duplicated).
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

  // Where Supabase sends the invitee after they accept. The existing
  // /auth/confirm route + ensureActivated handle the session and invited->active
  // flip. Must be allow-listed in the Supabase project (see supabase/README.md).
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
    const alreadyExists = /already|registered|exist/i.test(error.message);
    return {
      error: alreadyExists
        ? "That email already belongs to a player."
        : "Couldn't send the invite — please try again.",
    };
  }

  revalidatePath("/admin/players");
  return { sent: email };
}
