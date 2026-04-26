// Next.js middleware — refreshes Supabase session on each request and
// protects private routes by redirecting unauthenticated users to /login.
import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Routes that require authentication (prefix match)
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/post",
  "/repos",
  "/wallets",
  "/scan-results",
];

// Routes that are always public (exact or prefix)
const PUBLIC_PATHS = [
  "/",
  "/bounties",
  "/login",
  "/auth/callback",
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  // /bounty/[id] is public (read-only)
  if (pathname.startsWith("/bounty/")) return true;
  // Static assets + API routes handle their own auth
  if (pathname.startsWith("/_next/") || pathname.startsWith("/api/")) return true;
  if (pathname.startsWith("/favicon")) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  // When Supabase is not configured (SQLite mode), skip all auth logic
  if (process.env.USE_SUPABASE !== "true" || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Build response so cookie mutations can be forwarded
  let response = NextResponse.next({ request });

  // Create server client that reads/writes cookies through the response
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(toSet) {
        for (const { name, value } of toSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of toSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh session (rotates tokens if needed)
  const { data: { user } } = await supabase.auth.getUser();

  // Redirect unauthenticated users away from protected routes
  if (!user && isProtected(pathname) && !isPublic(pathname)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from /login
  if (user && pathname === "/login") {
    const next = request.nextUrl.searchParams.get("next") ?? "/dashboard";
    return NextResponse.redirect(new URL(next, request.url));
  }

  return response;
}

export const config = {
  // Run on all routes except static files
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
