import type { EmailOtpType } from "@supabase/supabase-js";

export type InvitePasswordValidation =
  | { ok: true; password: string }
  | { ok: false; error: string };

export function validateInvitePassword(
  password: string,
  confirmation: string,
): InvitePasswordValidation {
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }
  if (password !== confirmation) {
    return { ok: false, error: "Passwords do not match." };
  }
  return { ok: true, password };
}

export function confirmationDestination(
  type: EmailOtpType,
  requestedPath: string,
): string {
  if (type === "invite") return "/accept-invite";
  if (!requestedPath.startsWith("/") || requestedPath.startsWith("//")) return "/";
  return requestedPath;
}
