import { NextResponse, type NextRequest } from "next/server"
import { parseSessionCookie, SESSION_COOKIE_NAME } from "@/lib/session"

// ─────────────────────────────────────────────────────────────────────────
// Auth middleware.
//
// - On web (Vercel / Node runtime): enforces auth_session cookie on protected
//   segments, redirects to /login when missing/invalid.
// - On Tauri desktop static export (BUILD_TARGET=desktop): the middleware is
//   NOT executed at runtime because static export emits pre-rendered HTML
//   without a server. Next.js still needs the file to *exist* so the build
//   succeeds, so we no-op when the build target is desktop.
// ─────────────────────────────────────────────────────────────────────────

const PUBLIC_PATHS: ReadonlySet<string> = new Set([
  "/",
  "/login",
  "/signup",
  "/api/auth/signin",
  "/api/auth/signup",
  "/api/auth/callback",
  "/api/auth/session",
])

const PUBLIC_PREFIXES: readonly string[] = [
  "/api/auth/",
  "/api/mock/",
  "/api/proxy/",          // proxy is intentionally open (SSRF-guarded)
  "/api/proxy-ai/",
  "/api/proxy-models/",
  "/_next/",
  "/icon",
  "/favicon",
  "/api/health",
]

export function middleware(request: NextRequest) {
  // Tauri desktop static export: skip middleware entirely. Auth is enforced
  // by the Rust shell (src-tauri/src/lib.rs) which embeds a local proxy that
  // injects a session token before the WebView loads.
  if (process.env.BUILD_TARGET === "desktop") {
    return NextResponse.next()
  }

  const { pathname } = request.nextUrl

  // Public assets / pages / API routes
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next()
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next()

  // Everything else requires a valid auth_session cookie
  const cookie = request.cookies.get(SESSION_COOKIE_NAME)?.value
  const session = parseSessionCookie(cookie)
  if (!session) {
    // For API routes, return 401 JSON instead of redirecting to /login.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("redirect", pathname)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  // Skip static assets and image optimizer; let middleware run on everything else.
  matcher: [
    "/((?!_next/static|_next/image|_next/data|favicon.ico|icon.png|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|woff2?|ttf)$).*)",
  ],
}
