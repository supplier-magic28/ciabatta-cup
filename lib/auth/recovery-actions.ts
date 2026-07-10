"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildRecoveryRedirectTo, validatePassword } from "./recovery";

export type RequestPasswordResetState =
  | { error: string }
  | { sent: true }
  | undefined;
export type UpdatePasswordState = { error: string } | undefined;

export async function requestPasswordReset(
  _previous: RequestPasswordResetState,
  formData: FormData,
): Promise<RequestPasswordResetState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Enter your email address." };

  const redirectTo = buildRecoveryRedirectTo(
    process.env.NEXT_PUBLIC_SITE_URL,
    (await headers()).get("origin"),
  );
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    console.error("Supabase password recovery request failed", error);
    return { error: "Couldn't send the reset email. Please try again." };
  }

  return { sent: true };
}

export async function updatePassword(
  _previous: UpdatePasswordState,
  formData: FormData,
): Promise<UpdatePasswordState> {
  const validated = validatePassword(
    String(formData.get("password") ?? ""),
    String(formData.get("passwordConfirmation") ?? ""),
  );
  if (!validated.ok) return { error: validated.error };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "This reset link has expired. Request a new one." };

  const { error: passwordError } = await supabase.auth.updateUser({
    password: validated.password,
  });
  if (passwordError) return { error: "Couldn't save your password. Please try again." };

  const { data: player } = await supabase
    .from("players")
    .select("status")
    .eq("id", user.id)
    .maybeSingle();

  if (player?.status === "invited") {
    const { error: activationError } = await supabase
      .from("players")
      .update({ status: "active", joined_at: new Date().toISOString() })
      .eq("id", user.id)
      .eq("status", "invited");
    if (activationError) {
      return { error: "Password saved, but activation failed. Please try again." };
    }
  }

  redirect("/");
}
