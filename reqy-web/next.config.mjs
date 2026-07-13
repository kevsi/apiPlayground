/** @type {import('next').NextConfig} */
import path from "path"
import withBundleAnalyzer from "@next/bundle-analyzer"

const AUTH_SIGNING_SECRET = process.env.AUTH_SIGNING_SECRET
if (!AUTH_SIGNING_SECRET || AUTH_SIGNING_SECRET.length < 32) {
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[env:build] AUTH_SIGNING_SECRET is missing or too short. The auth flow " +
        "is currently disabled, so this is non-fatal.",
    )
  }
}

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
  {
    key: "Content-Security-Policy",
    // `'unsafe-inline'` for script-src is needed because Next.js dev mode and
    // several components (CM6 editor, GraphiQL) inject inline scripts. In
    // production this should be replaced by a nonce-based CSP.
    //
    // `report-uri /api/csp-reports` collects violations so we can monitor what
    // needs a hash/nonce before removing `'unsafe-inline'`.
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https: wss:",
      "font-src 'self' data:",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
      "report-uri /api/csp-reports",
    ].join("; "),
  },
  // HSTS only in production — breaks dev over plain HTTP otherwise.
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" }]
    : []),
]

// Desktop build is triggered by setting BUILD_TARGET=desktop in the env.
// The `pnpm generate` script sets this via `node scripts/build-desktop.mjs`
// (cross-platform — no `cross-env` dependency required).
//
// On the desktop build (used by Tauri via `pnpm tauri:build`):
//   - `output: 'export'` enables static export for the Tauri WebView
//   - `assetPrefix` points to the local Next.js dev server in dev (TAURI_DEV_HOST)
//   - `headers()` is omitted (no effect with export; CSP lives in tauri.conf.json)
//
// On the web build (Vercel, `pnpm build`):
//   - No `output: 'export'` — full SSR with API routes
//   - No `assetPrefix` — default
//   - `headers()` works normally
const isDesktopBuild = process.env.BUILD_TARGET === 'desktop'
const isProd = process.env.NODE_ENV === 'production'
const internalHost = process.env.TAURI_DEV_HOST ?? 'localhost'

const nextConfig = {
  turbopack: {
    root: path.resolve(process.cwd(), ".."),
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Web-only: HTTP security headers (work in SSR, ignored in static export)
  ...(!isDesktopBuild && {
    async headers() {
      return [{ source: "/(.*)", headers: securityHeaders }]
    },
  }),
  // Desktop-only: static export + dev-server asset prefix
  ...(isDesktopBuild && {
    output: 'export',
    // trailingSlash is required with output: 'export' so Next.js emits
    // `out/<route>/index.html` (matching the SPA's expected resolution) and
    // the client-side router can navigate without forcing a hard reload.
    trailingSlash: true,
    assetPrefix: isProd ? '' : `http://${internalHost}:3000`,
  }),
}

// Bundle analyzer: enable with `ANALYZE=true pnpm build`.
// Disabled by default so CI builds stay fast and the report file isn't
// generated unless someone explicitly asks for it.
export default withBundleAnalyzer({ enabled: process.env.ANALYZE === "true" })(nextConfig)
