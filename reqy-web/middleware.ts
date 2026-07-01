import { NextResponse, type NextRequest } from "next/server"

/**
 * Auth middleware — currently disabled.
 *
 * History: this file was originally a full auth gate that enforced an
 * HMAC-signed `auth_session` cookie on protected routes, redirecting
 * unauthenticated users to `/login` (302) or `/api/*` (401 JSON).
 *
 * The gate was rolled back because the underlying Supabase auth flow is
 * non-functional in this environment and the `/login` and `/signup` pages
 * it redirected to don't exist. Leaving the gate enabled caused the entire
 * `(app)` route group to be unreachable for anonymous visitors.
 *
 * To re-enable auth in the future:
 *   1. Build the `/login` and `/signup` pages (or whatever UI is chosen).
 *   2. Implement `app/api/auth/{signin,signup,callback,session}` routes
 *      (HMAC cookie mint/verify lives in `lib/session.ts`).
 *   3. Replace this function's body with the gate logic — the previous
 *      implementation is recoverable from git history at tag
 *      `v0.2.0-security-hardening` (commit `6fc5301` introduced it).
 *   4. Decide the BUILD_TARGET=desktop guard strategy for Tauri static
 *      export (see the previous version for the no-op pattern).
 */
export function middleware(_request: NextRequest): NextResponse {
  return NextResponse.next()
}

export const config = {
  // Match everything except static assets and images. Kept identical to
  // the previous implementation so re-enabling the gate later doesn't
  // require touching this matcher.
  matcher: [
    "/((?!_next/static|_next/image|_next/data|favicon.ico|icon.png|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|woff2?|ttf)$).*)",
  ],
}
