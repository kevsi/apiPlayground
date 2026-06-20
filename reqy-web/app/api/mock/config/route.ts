import { NextResponse } from "next/server"
import type { MockRouteRateLimit, MockRouteVariant, MockServer as MockServerData } from "@/lib/mock-types"
import { validateMockConfigPayloadThrow, validateMockRoute } from "@/lib/schemas/mock-config"
import { WORKSPACE_NORMALIZER } from "@/lib/workspace-utils"

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
  serverId?: string
  workspaceId?: string
  rateLimit?: MockRouteRateLimit
  variants?: MockRouteVariant[]
  matchQueryParams?: Record<string, string>
  matchHeaders?: Record<string, string>
}

// Global in-memory store for mock routes
let mockRoutes: MockRouteData[] = []
let mockServers: MockServerData[] = []
let mockEnabledGlobally = true
const mockBaseUrl = ""
// Allow per-workspace override (keyed by workspace id)
const mockEnabledByWorkspace: Record<string, boolean> = {}

// Use centralized workspace normalizer
const normalizeWorkspaceId = (workspaceId?: string | null): string => WORKSPACE_NORMALIZER.normalize(workspaceId)

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

export function getMockServers(): MockServerData[] {
  return mockServers
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
  const activeWorkspaceId = normalizeWorkspaceId(workspaceId)

  return mockRoutes.filter((route) =>
    route.enabled &&
    normalizeWorkspaceId(route.workspaceId) === activeWorkspaceId
  )
}

export function getActiveMockRoutesForServer(serverPrefix: string, workspaceId?: string | null): MockRouteData[] {
  // Find server by prefix
  const server = mockServers.find((s) => s.localPrefix === serverPrefix && s.enabled)
  if (!server) return []

  const activeWorkspaceId = normalizeWorkspaceId(workspaceId)

  return mockRoutes.filter((route) =>
    route.enabled &&
    route.serverId === server.id &&
    normalizeWorkspaceId(route.workspaceId) === activeWorkspaceId
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
    
    // Validate entire payload against schema
    const validPayload = validateMockConfigPayloadThrow(payload)
    
    if (validPayload.globalEnabled !== undefined) {
      mockEnabledGlobally = Boolean(validPayload.globalEnabled)
    }
    
    if (validPayload.workspaceId && validPayload.workspaceOverrides) {
      // Note: workspaceOverrides is a Record<workspace_id, enabled_bool>
      Object.entries(validPayload.workspaceOverrides).forEach(([wsId, enabled]) => {
        const normalized = WORKSPACE_NORMALIZER.normalize(wsId)
        mockEnabledByWorkspace[normalized] = Boolean(enabled)
      })
    }
    
    if (validPayload.routes && Array.isArray(validPayload.routes)) {
      mockRoutes = validPayload.routes.map((route) => {
        // Validate individual route structure
        const validated = validateMockRoute(route)
        if (!validated) {
          throw new Error(`Invalid route: ${JSON.stringify(route)}`)
        }
        return {
          ...validated,
          workspaceId: WORKSPACE_NORMALIZER.normalize(validated.workspaceId),
        }
      })
    }
    
    if (validPayload.servers && Array.isArray(validPayload.servers)) {
      mockServers = validPayload.servers as MockServerData[]
    }

    return NextResponse.json({
      ok: true,
      count: mockRoutes.length,
      serverCount: mockServers.length,
      globalEnabled: mockEnabledGlobally,
      workspaceOverrides: mockEnabledByWorkspace,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const includeLogs = url.searchParams.get("logs") === "true"
  const workspaceId = url.searchParams.get("workspaceId") || request.headers.get("x-workspace-id") || undefined
  const workspaceEnabled = workspaceId ? (mockEnabledByWorkspace[String(workspaceId)] ?? undefined) : undefined

  return NextResponse.json({
    routes: mockRoutes.map((route) => ({
      ...route,
      workspaceId: normalizeWorkspaceId(route.workspaceId),
    })),
    servers: mockServers,
    globalEnabled: mockEnabledGlobally,
    workspaceEnabled,
    workspaceId,
    baseUrl: mockBaseUrl,
    logs: includeLogs ? mockLogs : undefined,
  })
}
