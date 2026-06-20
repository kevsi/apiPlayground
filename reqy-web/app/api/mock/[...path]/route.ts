import { NextResponse } from "next/server"
import {
  getMockRoutes,
  getActiveMockRoutesForWorkspace,
  getActiveMockRoutesForServer,
  getMockServers,
  isMockEnabledForWorkspace,
  addMockLog,
} from "@/app/api/mock/config/route"
import {
  resolveMockMatch,
  applyMockDelay,
  buildMockHeaders,
  extractQueryParams,
} from "@/lib/mock-resolver"

export const runtime = "nodejs"

async function handleMockRequest(request: Request, path: string[]) {
  const fullUrl = request.url
  const urlObj = new URL(fullUrl)

  const servers = getMockServers()
  let serverPrefix = ""
  let requestPathname = "/"
  let serverDisabled = false

  if (path.length > 0) {
    const potentialPrefix = path[0]
    const matchedServer = servers.find((s) => s.localPrefix === potentialPrefix)

    if (matchedServer) {
      serverPrefix = potentialPrefix
      const restPath = path.slice(1)
      requestPathname = restPath.length > 0 ? `/${restPath.join("/")}` : "/"
      serverDisabled = !matchedServer.enabled
    } else {
      requestPathname = `/${path.join("/")}`
    }
  }

  const requestMethod = request.method
  const requestQuery = extractQueryParams(fullUrl)
  const requestHeaders: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    requestHeaders[key] = value
  })

  const workspaceId = urlObj.searchParams.get("workspaceId") || request.headers.get("x-workspace-id") || undefined

  const activeRoutes =
    !serverDisabled && isMockEnabledForWorkspace(workspaceId)
      ? serverPrefix
        ? getActiveMockRoutesForServer(serverPrefix, workspaceId)
        : getActiveMockRoutesForWorkspace(workspaceId)
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

  const resolved = resolveMockMatch(activeRoutes, {
    method: requestMethod,
    pathname: requestPathname,
    query: requestQuery,
    headers: requestHeaders,
  })

  if (resolved) {
    const ws = resolved.route.workspaceId || "ws-personal"

    if (resolved.rateLimited) {
      logMatch(resolved.route.id, resolved.route.name, 429, 0)
      return NextResponse.json(JSON.parse(resolved.body), {
        status: 429,
        headers: buildMockHeaders(resolved.route, resolved.headers, 0, {
          rateLimited: true,
          retryAfterSeconds: resolved.route.rateLimit?.windowSeconds,
          debug: `handler|rate-limited|workspace:${ws}|prefix:${serverPrefix}|path:${requestPathname}`,
        }),
      })
    }

    await applyMockDelay(resolved.delay)

    const headers = buildMockHeaders(resolved.route, resolved.headers, resolved.delay, {
      debug: `handler|matched|workspace:${ws}|prefix:${serverPrefix}|path:${requestPathname}|serverDisabled:${serverDisabled}`,
      variantId: resolved.variantId,
      variantName: resolved.variantName,
    })

    logMatch(resolved.route.id, resolved.route.name, resolved.status, resolved.delay)

    return new NextResponse(resolved.body, {
      status: resolved.status,
      headers,
    })
  }

  return NextResponse.json(
    {
      error: "No active mock route matched",
      request: { method: requestMethod, path: requestPathname, serverPrefix, serverDisabled, workspaceId, fullUrl },
      activeRoutes: activeRoutes.map((r) => ({
        method: r.method,
        pathPattern: r.pathPattern,
        name: r.name,
      })),
      debug: {
        serversCount: servers.length,
        servers: servers.map((s) => ({ id: s.id, name: s.name, prefix: s.localPrefix, enabled: s.enabled })),
        routesCount: getMockRoutes().length,
        mockEnabled: isMockEnabledForWorkspace(workspaceId),
        workspaceId: workspaceId || "ws-personal",
      },
    },
    {
      status: 404,
      headers: {
        "x-mock-debug": `handler|no-match|workspace:${workspaceId || "ws-personal"}|prefix:${serverPrefix}|path:${requestPathname}|serverDisabled:${serverDisabled}`,
      },
    },
  )
}

export async function GET(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return handleMockRequest(request, (await params).path)
}

export async function POST(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return handleMockRequest(request, (await params).path)
}

export async function PUT(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return handleMockRequest(request, (await params).path)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return handleMockRequest(request, (await params).path)
}

export async function DELETE(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return handleMockRequest(request, (await params).path)
}

export async function OPTIONS(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return handleMockRequest(request, (await params).path)
}

export async function HEAD(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return handleMockRequest(request, (await params).path)
}
