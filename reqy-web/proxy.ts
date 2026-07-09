import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const PROTECTED_PREFIXES = [
  "/api/proxy",
  "/api/proxy-ai",
  "/api/proxy-models",
  "/api/test-runner/",
  "/api/postman-import",
  "/api/postman-export",
  "/api/github-import",
  "/api/postman-auth",
];

function isExempt(pathname: string): boolean {
  if (pathname === "/" || pathname === "/api") return true;
  if (pathname.startsWith("/_next/static/")) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname.startsWith("/api/github-auth/")) return true;
  return false;
}

function isProtected(pathname: string): boolean {
  for (const p of PROTECTED_PREFIXES) {
    if (pathname.startsWith(p)) return true;
  }
  return false;
}

function extractBearerToken(authorization: string | null): string | null {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.*)$/i);
  if (!match) return null;
  return match[1].trim();
}

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (isExempt(pathname)) {
    return NextResponse.next();
  }

  if (!isProtected(pathname)) {
    return NextResponse.next();
  }

  const token = process.env.PROXY_SERVICE_TOKEN;

  if (!token || token.length < 32) {
    return NextResponse.json({ error: "Service token not configured" }, { status: 503 });
  }

  const bearer = extractBearerToken(request.headers.get("authorization"));

  if (!bearer || bearer !== token) {
    return NextResponse.json(
      { error: "Unauthorized", code: "PROXY_AUTH_REQUIRED" },
      { status: 401 },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
