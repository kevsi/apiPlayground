/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" }
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
    root: import.meta.dirname,
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

export default nextConfig
