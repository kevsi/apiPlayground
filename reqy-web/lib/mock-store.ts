import type { MockRouteRateLimit, MockRouteVariant, MockServer as MockServerData } from "@/lib/mock-types"
export type { MockServerData }
import { WORKSPACE_NORMALIZER } from "@/lib/workspace-utils"

export interface MockLogEntry {
  timestamp: number
  method: string
  path: string
  matchedRouteId: string
  matchedRouteName: string
  responseStatus: number
  delay: number
}

export interface MockRouteData {
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
  const MAX_LOGS = 200
  let mockLogs: MockLogEntry[] = []
  mockLogs.push(entry)
  if (mockLogs.length > MAX_LOGS) {
    mockLogs = mockLogs.slice(-MAX_LOGS)
  }
}

export function getMockLogs(): MockLogEntry[] {
  const MAX_LOGS = 200
  let mockLogs: MockLogEntry[] = []
  return mockLogs
}

// Export the store state for external modification
export const mockStore = {
  get mockRoutes() { return mockRoutes },
  set mockRoutes(routes: MockRouteData[]) { mockRoutes = routes },
  get mockServers() { return mockServers },
  set mockServers(servers: MockServerData[]) { mockServers = servers },
  get mockEnabledGlobally() { return mockEnabledGlobally },
  set mockEnabledGlobally(enabled: boolean) { mockEnabledGlobally = enabled },
  get mockEnabledByWorkspace() { return mockEnabledByWorkspace },
  get mockBaseUrl() { return mockBaseUrl },
  normalizeWorkspaceId,
  addMockLog,
  getMockLogs,
  getActiveMockRoutesForWorkspace,
  getActiveMockRoutesForServer,
  isMockEnabledGlobally,
  isMockEnabledForWorkspace,
}