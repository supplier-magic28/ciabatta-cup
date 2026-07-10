import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Paths reachable while signed out. Everything else requires a session. */
const PUBLIC_PREFIXES = ["/sign-in", "/sign-up", "/auth"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Refreshes the Supabase session cookies on every request and enforces the
 * protected-route pattern:
 *   - no user on a protected path  → redirect to /sign-in
 *   - signed-in user on /sign-in|/sign-up → redirect to /
 *
 * Follows the @supabase/ssr proxy/middleware contract: the same response object
 * whose cookies are written must be the one returned (or copied into any redirect).
 */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  // Lets public auth screens render in local/CI smoke tests without credentials,
  // while still failing closed for every protected route.
  if (process.env.E2E_SMOKE_MODE === "1" || !url || !publishableKey) {
    if (isPublic(pathname)) return NextResponse.next({ request });
    const signInUrl = request.nextUrl.clone();
    signInUrl.pathname = "/sign-in";
    return NextResponse.redirect(signInUrl);
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    url,
    publishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not run code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/sign-in" || pathname === "/sign-up")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
