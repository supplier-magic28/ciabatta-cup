"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateInvitePassword } from "./invite";

export type CompleteInviteState = { error: string } | undefined;

export async function completeInvite(
  _previous: CompleteInviteState,
  formData: FormData,
): Promise<CompleteInviteState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("passwordConfirmation") ?? "");
  const validated = validateInvitePassword(password, confirmation);
  if (!validated.ok) return { error: validated.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "This invitation has expired. Ask an admin for a new invite." };
  }

  const { data: player } = await supabase
    .from("players")
    .select("status")
    .eq("id", user.id)
    .single();
  if (!player || player.status !== "invited") {
    return { error: "This invitation has already been completed." };
  }

  const { error: passwordError } = await supabase.auth.updateUser({
    password: validated.password,
  });
  if (passwordError) {
    return { error: "Couldn't save your password. Please try again." };
  }

  const { error: activationError } = await supabase
    .from("players")
    .update({ status: "active", joined_at: new Date().toISOString() })
    .eq("id", user.id)
    .eq("status", "invited");
  if (activationError) {
    return { error: "Password saved, but activation failed. Please try again." };
  }

  redirect("/");
}
