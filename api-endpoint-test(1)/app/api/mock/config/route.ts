import { NextResponse } from "next/server"

export interface MockRouteRateLimit {
  enabled: boolean
  maxRequests: number
  windowSeconds: number
}

export interface MockRouteVariant {
  id: string
  name: string
  weight: number
  responseStatus: number
  responseHeaders: Record<string, string>
  responseBody: string
  contentType: string
  delay: number
}

interface MockRouteData {
  id: string
  name: string
  method: string
  pathPattern: string
  responseStatus: number
  responseHeaders: Record<string, string>
  responseBody: string
  contentType: string
  delay: number
  enabled: boolean
  workspaceId?: string
  rateLimit?: MockRouteRateLimit
  variants?: MockRouteVariant[]
  matchQueryParams?: Record<string, string>
  matchHeaders?: Record<string, string>
}

// Global in-memory store for mock routes
let mockRoutes: MockRouteData[] = []
let mockEnabledGlobally = true
// Allow per-workspace override (keyed by workspace id)
const mockEnabledByWorkspace: Record<string, boolean> = {}

export interface MockLogEntry {
  timestamp: number
  method: string
  path: string
  matchedRouteId: string
  matchedRouteName: string
  responseStatus: number
  delay: number
}

const MAX_LOGS = 200
let mockLogs: MockLogEntry[] = []

export function getMockRoutes(): MockRouteData[] {
  return mockRoutes
}

export function isMockEnabledGlobally(): boolean {
  return mockEnabledGlobally
}

/**
 * Return whether mocks are enabled for a given workspace id.
 * If a workspace override exists, use it; otherwise fall back to global flag.
 */
export function isMockEnabledForWorkspace(workspaceId?: string | null): boolean {
  if (workspaceId) {
    const override = mockEnabledByWorkspace[String(workspaceId)]
    if (override !== undefined) return Boolean(override)
  }
  return mockEnabledGlobally
}

export function getActiveMockRoutesForWorkspace(workspaceId?: string | null): MockRouteData[] {
  return mockRoutes.filter((route) =>
    route.enabled &&
    (workspaceId
      ? route.workspaceId === workspaceId
      : (!route.workspaceId || route.workspaceId === "ws-personal"))
  )
}

export function addMockLog(entry: MockLogEntry): void {
  mockLogs.push(entry)
  if (mockLogs.length > MAX_LOGS) {
    mockLogs = mockLogs.slice(-MAX_LOGS)
  }
}

export function getMockLogs(): MockLogEntry[] {
  return mockLogs
}

export async function POST(request: Request) {
  try {
    const payload = await request.json()
    if (payload.globalEnabled !== undefined) {
      mockEnabledGlobally = Boolean(payload.globalEnabled)
    }
    if (payload.workspaceId && payload.workspaceEnabled !== undefined) {
      mockEnabledByWorkspace[String(payload.workspaceId)] = Boolean(payload.workspaceEnabled)
    }
    if (payload.routes && Array.isArray(payload.routes)) {
      mockRoutes = payload.routes
    }

    return NextResponse.json({
      ok: true,
      count: mockRoutes.length,
      globalEnabled: mockEnabledGlobally,
      workspaceOverrides: mockEnabledByWorkspace,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 400 })
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const includeLogs = url.searchParams.get("logs") === "true"
  const workspaceId = url.searchParams.get("workspaceId") || request.headers.get("x-workspace-id") || undefined
  const workspaceEnabled = workspaceId ? (mockEnabledByWorkspace[String(workspaceId)] ?? undefined) : undefined

  return NextResponse.json({
    routes: mockRoutes,
    globalEnabled: mockEnabledGlobally,
    workspaceEnabled,
    workspaceId,
    logs: includeLogs ? mockLogs : undefined,
  })
}
