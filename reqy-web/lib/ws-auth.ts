/**
 * Helpers for applying WebSocket auth to a connection.
 *
 * Two modes are supported:
 *  - "bearer": sends an `Authorization: Bearer <token>` header (Tauri backend only;
 *    the browser WebSocket API ignores custom request headers).
 *  - "query": appends `?<name>=<token>` to the URL (works in both Tauri and browser).
 *
 * Kept as pure functions so they are easy to unit-test without rendering React.
 */

export type WsAuthType = "none" | "bearer" | "query"

export interface WsAuthConfig {
  type: WsAuthType
  token: string
  queryName: string
}

/**
 * Returns the headers that should be merged into a Tauri `ws_connect` invocation.
 * Returns an empty object when no header-based auth is configured or when the
 * token is blank. Trims the token; an all-whitespace token is treated as empty.
 */
export function buildAuthHeaders(auth: WsAuthConfig): Record<string, string> {
  if (auth.type !== "bearer") return {}
  const token = auth.token.trim()
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

/**
 * Returns the URL with the auth query parameter appended (or merged into an
 * existing query string) when query-param auth is configured. Returns the
 * original URL unchanged for all other modes.
 *
 * Uses the URL/URLSearchParams APIs so values are properly percent-encoded.
 * Throws if `url` is not a valid absolute URL.
 */
export function applyAuthToUrl(url: string, auth: WsAuthConfig): string {
  if (auth.type !== "query") return url
  const token = auth.token.trim()
  if (!token) return url

  const name = (auth.queryName.trim() || "token")
  const parsed = new URL(url)
  // Do not overwrite an existing param of the same name; explicit user value wins.
  if (!parsed.searchParams.has(name)) {
    parsed.searchParams.set(name, token)
  }
  return parsed.toString()
}
