import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { confirmationDestination } from "@/lib/auth/invite";
import { createClient } from "@/lib/supabase/server";

/**
 * Email-confirmation handler. Supabase sends the user here (token_hash + type)
 * after signup when email confirmation is enabled; we verify the OTP to
 * establish the session, then land them on the protected home.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
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

  return NextResponse.redirect(new URL("/sign-in", request.url));
}
