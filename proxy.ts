import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Pages reachable without a session. */
const PUBLIC_PATHS = new Set(["/login"]);

/**
 * Session refresh + route protection. Runs before every page request:
 * refreshes the Supabase session cookies, then sends signed-out visitors
 * to /login. API routes get a 401 instead of a redirect — their callers
 * check res.ok, and RLS already keeps unauthenticated requests from
 * reading anyone's data.
 *
 * Next.js 16 note: middleware is now called proxy — this file is the
 * project's proxy.ts, not middleware.ts.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without a configured Supabase the app runs in preview mode — no
  // session to refresh, nothing to protect.
  if (!url || !anonKey) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // getUser() validates the token with Supabase's auth server — unlike
  // getSession() it never trusts an unverified cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user || PUBLIC_PATHS.has(request.nextUrl.pathname)) {
    return response;
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next internals and static assets.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
