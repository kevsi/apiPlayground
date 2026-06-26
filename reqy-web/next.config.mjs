/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
]

const nextConfig = {
  turbopack: {
    // next.config.mjs lives in reqy-web/. Turbopack must look from this
    // directory so it finds `next` in reqy-web/node_modules/next/.
    // Using import.meta.dirname (Node 20+) — cleaner than fileURLToPath.
    root: import.meta.dirname,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }]
  },
}

export default nextConfig
