import type { HttpMethod } from "@/lib/types"

export interface PathMatchResult {
  matched: boolean
  params: Record<string, string>
}

/**
 * Matches a request method + pathname against a mock route pattern.
 *
 * Patterns support `:param` segments:
 *   /api/users/:id         → matches /api/users/42        → { id: "42" }
 *   /api/users/:id/posts   → matches /api/users/42/posts  → { id: "42" }
 *   /api/users/*           → matches any /api/users/...    → { "*": "..." }
 *
 * Method matching: GET matches GET. Wildcard "*" matches any method.
 *
 * Optional query param / header matching:
 *   If matchQueryParams is provided, the request must include the specified
 *   query params with matching values.
 *   If matchHeaders is provided, the request must include the specified
 *   headers with matching values (case-insensitive keys).
 */
export function matchMockRoute(
  requestMethod: HttpMethod | string,
  requestPathname: string,
  routeMethod: HttpMethod | string,
  routePattern: string,
  requestQuery?: Record<string, string>,
  requestHeaders?: Record<string, string>,
  matchQueryParams?: Record<string, string>,
  matchHeaders?: Record<string, string>
): PathMatchResult {
  // Normalize paths
  const normalizedRequest = normalizePath(requestPathname)
  const normalizedPattern = normalizePath(routePattern)

  // Method matching
  const methodMatch =
    routeMethod === "*" ||
    routeMethod.toUpperCase() === requestMethod.toUpperCase()
  if (!methodMatch) {
    return { matched: false, params: {} }
  }

  // Path matching — split into segments
  const requestSegments = normalizedRequest.split("/").filter(Boolean)
  const patternSegments = normalizedPattern.split("/").filter(Boolean)

  // If pattern has trailing wildcard, allow extra segments
  const hasWildcard = patternSegments.length > 0 && patternSegments[patternSegments.length - 1] === "*"

  if (!hasWildcard && requestSegments.length !== patternSegments.length) {
    return { matched: false, params: {} }
  }

  if (hasWildcard && requestSegments.length < patternSegments.length - 1) {
    return { matched: false, params: {} }
  }

  const params: Record<string, string> = {}

  for (let i = 0; i < patternSegments.length; i++) {
    const patternSegment = patternSegments[i]
    const requestSegment = requestSegments[i]

    if (patternSegment === "*") {
      // Wildcard captures the rest
      params["*"] = requestSegments.slice(i).join("/")
      break
    }

    if (patternSegment.startsWith(":")) {
      // Named parameter
      const paramName = patternSegment.slice(1)
      params[paramName] = requestSegment || ""
      continue
    }

    // Literal segment
    if (patternSegment !== requestSegment) {
      return { matched: false, params: {} }
    }
  }

  // Query param matching
  if (matchQueryParams && Object.keys(matchQueryParams).length > 0) {
    const reqQuery = requestQuery || {}
    for (const [key, expectedValue] of Object.entries(matchQueryParams)) {
      const actualValue = reqQuery[key]
      if (actualValue === undefined || actualValue === null) {
        return { matched: false, params: {} }
      }
      if (expectedValue !== "*" && actualValue !== expectedValue) {
        return { matched: false, params: {} }
      }
    }
  }

  // Header matching
  if (matchHeaders && Object.keys(matchHeaders).length > 0) {
    const reqHeaders = requestHeaders || {}
    const reqHeadersLower: Record<string, string> = {}
    for (const [k, v] of Object.entries(reqHeaders)) {
      reqHeadersLower[k.toLowerCase()] = v
    }
    for (const [key, expectedValue] of Object.entries(matchHeaders)) {
      const actualValue = reqHeadersLower[key.toLowerCase()]
      if (actualValue === undefined || actualValue === null) {
        return { matched: false, params: {} }
      }
      if (expectedValue !== "*" && actualValue !== expectedValue) {
        return { matched: false, params: {} }
      }
    }
  }

  return { matched: true, params }
}

function normalizePath(path: string): string {
  let p = path.trim()
  // Remove trailing slash (except root)
  if (p !== "/" && p.endsWith("/")) {
    p = p.slice(0, -1)
  }
  return p
}
