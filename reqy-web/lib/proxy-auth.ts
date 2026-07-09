/**
 * Returns the proxy service token for authenticating to protected API
 * routes (/api/proxy*, /api/test-runner/*, etc.).
 *
 * In the browser this reads NEXT_PUBLIC_PROXY_SERVICE_TOKEN (baked in
 * at build time by webpack DefinePlugin). On the server it falls back to
 * PROXY_SERVICE_TOKEN.
 *
 * Uses direct property access (not optional chaining) so that webpack's
 * DefinePlugin can statically replace the NEXT_PUBLIC_* expression in
 * the browser bundle.
 */
export function getProxyToken(): string {
  if (typeof process === "undefined") return ""
  try {
    return (
      (process.env as Record<string, string | undefined>)
        .NEXT_PUBLIC_PROXY_SERVICE_TOKEN ||
      (process.env as Record<string, string | undefined>)
        .PROXY_SERVICE_TOKEN ||
      ""
    )
  } catch {
    return ""
  }
}

export function proxyAuthHeaders(): Record<string, string> {
  const token = getProxyToken()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}
