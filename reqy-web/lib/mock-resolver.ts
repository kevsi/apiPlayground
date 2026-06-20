import { matchMockRoute } from "@/lib/match-mock-path"
import type { MockRouteRateLimit, MockRouteVariant } from "@/lib/mock-types"

/** Minimal route shape used by proxy and mock handlers. */
export interface ResolveMockRoute {
  id: string
  name: string
  method: string
  pathPattern: string
  responseStatus: number
  responseHeaders: Record<string, string>
  responseBody: string
  contentType: string
  delay: number
  workspaceId?: string
  rateLimit?: MockRouteRateLimit
  variants?: MockRouteVariant[]
  matchQueryParams?: Record<string, string>
  matchHeaders?: Record<string, string>
}

export interface MockResolveRequest {
  method: string
  pathname: string
  query?: Record<string, string>
  headers?: Record<string, string>
}

export interface MockResolveResult {
  route: ResolveMockRoute
  status: number
  body: string
  headers: Record<string, string>
  delay: number
  rateLimited: boolean
  variantId?: string
  variantName?: string
}

const rateLimitCounters = new Map<string, { count: number; windowStart: number }>()

export function resetMockRateLimitCounters(): void {
  rateLimitCounters.clear()
}

export function checkMockRateLimit(
  routeId: string,
  maxRequests: number,
  windowSeconds: number,
): boolean {
  const now = Date.now()
  const key = `rl_${routeId}`
  const entry = rateLimitCounters.get(key)

  if (!entry || now - entry.windowStart > windowSeconds * 1000) {
    rateLimitCounters.set(key, { count: 1, windowStart: now })
    return true
  }

  if (entry.count >= maxRequests) {
    return false
  }

  entry.count++
  return true
}

export function pickMockVariant(variants: MockRouteVariant[]): MockRouteVariant | null {
  if (!variants || variants.length === 0) return null

  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0)
  if (totalWeight <= 0) return null

  let roll = Math.random() * totalWeight
  for (const v of variants) {
    roll -= v.weight
    if (roll <= 0) return v
  }
  return variants[variants.length - 1]
}

export function extractQueryParams(url: string): Record<string, string> {
  const idx = url.indexOf("?")
  if (idx === -1) return {}
  const params: Record<string, string> = {}
  const searchParams = new URLSearchParams(url.slice(idx))
  for (const [key, value] of searchParams.entries()) {
    params[key] = value
  }
  return params
}

export function ensureContentType(
  headers: Record<string, string>,
  contentType: string,
): Record<string, string> {
  if (!contentType.trim()) return headers
  const hasContentType = Object.keys(headers).some(
    (k) => k.toLowerCase() === "content-type",
  )
  if (hasContentType) return headers
  return { ...headers, "Content-Type": contentType }
}

export interface BuildMockHeadersOptions {
  workspaceId?: string
  debug?: string
  variantId?: string
  variantName?: string
  rateLimited?: boolean
  retryAfterSeconds?: number
}

export function buildMockHeaders(
  route: ResolveMockRoute,
  activeHeaders: Record<string, string>,
  activeDelay: number,
  options: BuildMockHeadersOptions = {},
): Record<string, string> {
  const workspace = route.workspaceId || options.workspaceId || "ws-personal"
  const headers: Record<string, string> = {
    "x-mock-route": route.id,
    "x-mock-name": route.name,
    "x-mock-workspace": workspace,
    "x-mock-delay": String(activeDelay),
    ...ensureContentType(activeHeaders, route.contentType),
  }

  if (options.debug) {
    headers["x-mock-debug"] = options.debug
  }

  if (options.rateLimited) {
    headers["x-mock-rate-limited"] = "true"
    if (options.retryAfterSeconds !== undefined) {
      headers["retry-after"] = String(options.retryAfterSeconds)
    }
  }

  if (options.variantId) {
    headers["x-mock-variant"] = options.variantId
  }
  if (options.variantName) {
    headers["x-mock-variant-name"] = options.variantName
  }

  return headers
}

function resolveActiveResponse(route: ResolveMockRoute): {
  delay: number
  status: number
  body: string
  headers: Record<string, string>
  contentType: string
  variantId?: string
  variantName?: string
} {
  const variant =
    route.variants && route.variants.length > 0
      ? pickMockVariant(route.variants)
      : null

  if (variant) {
    return {
      delay: variant.delay,
      status: variant.responseStatus,
      body: variant.responseBody,
      headers: variant.responseHeaders,
      contentType: variant.contentType || route.contentType,
      variantId: variant.id,
      variantName: variant.name,
    }
  }

  return {
    delay: route.delay,
    status: route.responseStatus,
    body: route.responseBody,
    headers: route.responseHeaders,
    contentType: route.contentType,
  }
}

/** Find the first matching route and resolve its response (no delay applied). */
export function resolveMockMatch(
  routes: ResolveMockRoute[],
  request: MockResolveRequest,
): MockResolveResult | null {
  for (const route of routes) {
    const match = matchMockRoute(
      request.method,
      request.pathname,
      route.method,
      route.pathPattern,
      request.query,
      request.headers,
      route.matchQueryParams,
      route.matchHeaders,
    )

    if (!match.matched) continue

    if (route.rateLimit?.enabled) {
      const allowed = checkMockRateLimit(
        route.id,
        route.rateLimit.maxRequests,
        route.rateLimit.windowSeconds,
      )
      if (!allowed) {
        return {
          route,
          status: 429,
          body: JSON.stringify({
            error: "Too Many Requests",
            message: `Rate limit exceeded: ${route.rateLimit.maxRequests} requests per ${route.rateLimit.windowSeconds}s`,
            route: route.name,
            retryAfter: route.rateLimit.windowSeconds,
          }),
          headers: buildMockHeaders(route, {}, 0, {
            workspaceId: route.workspaceId,
            rateLimited: true,
            retryAfterSeconds: route.rateLimit.windowSeconds,
          }),
          delay: 0,
          rateLimited: true,
        }
      }
    }

    const active = resolveActiveResponse(route)
    return {
      route,
      status: active.status,
      body: active.body,
      headers: ensureContentType(active.headers, active.contentType),
      delay: active.delay,
      rateLimited: false,
      variantId: active.variantId,
      variantName: active.variantName,
    }
  }

  return null
}

export async function applyMockDelay(delayMs: number): Promise<void> {
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
}
