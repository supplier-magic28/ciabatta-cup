import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { confirmationDestination } from "@/lib/auth/invite";
import { safeAuthDestination } from "@/lib/auth/recovery";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side Auth callback. Invite and recovery templates send token_hash +
 * type here; we verify the OTP to establish the session before landing on the
 * relevant password form. PKCE code callbacks are supported as well.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) {
      return NextResponse.redirect(
        new URL(confirmationDestination(type, next), request.url),
      );
    }
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(
        new URL(safeAuthDestination(next), request.url),
      );
    }
  }

  return NextResponse.redirect(new URL("/sign-in", request.url));
}
