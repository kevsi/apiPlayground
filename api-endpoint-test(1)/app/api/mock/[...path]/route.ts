import { NextResponse } from "next/server"
import { getActiveMockRoutesForWorkspace, isMockEnabledForWorkspace, addMockLog, type MockRouteVariant } from "@/app/api/mock/config/route"
import { matchMockRoute } from "@/lib/match-mock-path"

export const runtime = "nodejs"

const ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"] as const

// In-memory rate-limit counters (resets on server restart)
const rateLimitCounters = new Map<string, { count: number; windowStart: number }>()

function checkRateLimit(routeId: string, maxRequests: number, windowSeconds: number): boolean {
  const now = Date.now()
  const key = `rl_${routeId}`
  const entry = rateLimitCounters.get(key)

  if (!entry || now - entry.windowStart > windowSeconds * 1000) {
    // Start a new window
    rateLimitCounters.set(key, { count: 1, windowStart: now })
    return true // allowed
  }

  if (entry.count >= maxRequests) {
    return false // rate limited
  }

  entry.count++
  return true // allowed
}

/** Pick a variant by weighted random selection, or null to use defaults */
function pickVariant(
  variants: MockRouteVariant[]
): MockRouteVariant | null {
  if (!variants || variants.length === 0) return null

  const totalWeight = variants.reduce((sum: number, v: MockRouteVariant) => sum + v.weight, 0)
  if (totalWeight <= 0) return null

  let roll = Math.random() * totalWeight
  for (const v of variants) {
    roll -= v.weight
    if (roll <= 0) return v
  }
  return variants[variants.length - 1] // fallback
}

function extractQueryParams(url: string): Record<string, string> {
  const idx = url.indexOf("?")
  if (idx === -1) return {}
  const params: Record<string, string> = {}
  const searchParams = new URLSearchParams(url.slice(idx))
  for (const [key, value] of searchParams.entries()) {
    params[key] = value
  }
  return params
}

async function handleMockRequest(request: Request, path: string[]) {
  const fullUrl = request.url
  const urlObj = new URL(fullUrl)
  const requestPathname = `/${path.join("/")}`
  const requestMethod = request.method
  const requestQuery = extractQueryParams(fullUrl)
  const requestHeaders: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    requestHeaders[key] = value
  })

  const workspaceId = urlObj.searchParams.get("workspaceId") || request.headers.get("x-workspace-id") || undefined
  const activeRoutes = isMockEnabledForWorkspace(workspaceId)
    ? getActiveMockRoutesForWorkspace(workspaceId)
    : []

  const logMatch = (routeId: string, routeName: string, status: number, delayMs: number) => {
    addMockLog({
      timestamp: Date.now(),
      method: requestMethod,
      path: requestPathname,
      matchedRouteId: routeId,
      matchedRouteName: routeName,
      responseStatus: status,
      delay: delayMs,
    })
  }

  // Try to match a route
  for (const route of activeRoutes) {
    const match = matchMockRoute(
      requestMethod,
      requestPathname,
      route.method,
      route.pathPattern,
      requestQuery,
      requestHeaders,
      route.matchQueryParams,
      route.matchHeaders
    )
    if (match.matched) {
      // Rate limiting check
      if (route.rateLimit?.enabled) {
        const allowed = checkRateLimit(route.id, route.rateLimit.maxRequests, route.rateLimit.windowSeconds)
        if (!allowed) {
          logMatch(route.id, route.name, 429, 0)
          return NextResponse.json(
            {
              error: "Too Many Requests",
              message: `Rate limit exceeded: ${route.rateLimit.maxRequests} requests per ${route.rateLimit.windowSeconds}s`,
              route: route.name,
              retryAfter: route.rateLimit.windowSeconds,
            },
            {
              status: 429,
              headers: {
                "x-mock-route": route.id,
                "x-mock-name": route.name,
                "x-mock-rate-limited": "true",
                "retry-after": String(route.rateLimit.windowSeconds),
              },
            }
          )
        }
      }

      // Variant selection (scenario)
      const variant = route.variants && route.variants.length > 0 ? pickVariant(route.variants) : null

      const activeDelay = variant ? variant.delay : route.delay
      const activeStatus = variant ? variant.responseStatus : route.responseStatus
      const activeBody = variant ? variant.responseBody : route.responseBody
      const activeHeaders = variant ? variant.responseHeaders : route.responseHeaders

      // Simulate delay
      if (activeDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, activeDelay))
      }

      const headers: Record<string, string> = {
        "x-mock-route": route.id,
        "x-mock-name": route.name,
        "x-mock-delay": String(activeDelay),
        ...activeHeaders,
      }

      if (variant) {
        headers["x-mock-variant"] = variant.id
        headers["x-mock-variant-name"] = variant.name
      }

      logMatch(route.id, route.name, activeStatus, activeDelay)

      return new NextResponse(activeBody, {
        status: activeStatus,
        headers,
      })
    }
  }

  // No mock route matched
  return NextResponse.json(
    {
      error: "No active mock route matched",
      request: { method: requestMethod, path: requestPathname },
      activeRoutes: activeRoutes.map((r) => ({
        method: r.method,
        pathPattern: r.pathPattern,
        name: r.name,
      })),
    },
    { status: 404 }
  )
}

// Export all HTTP methods
export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path
  return handleMockRequest(request, path)
}

export async function POST(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path
  return handleMockRequest(request, path)
}

export async function PUT(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path
  return handleMockRequest(request, path)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path
  return handleMockRequest(request, path)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path
  return handleMockRequest(request, path)
}

export async function OPTIONS(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path
  return handleMockRequest(request, path)
}

export async function HEAD(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path
  return handleMockRequest(request, path)
}
