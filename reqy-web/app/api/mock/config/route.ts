export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server"
import { validateMockConfigPayloadThrow, validateMockRoute } from "@/lib/schemas/mock-config"
import { mockStore, type MockLogEntry, type MockServerData } from "@/lib/mock-store"

export async function POST(request: Request) {
  try {
    const payload = await request.json()
    
    // Validate entire payload against schema
    const validPayload = validateMockConfigPayloadThrow(payload)
    
    if (validPayload.globalEnabled !== undefined) {
      mockStore.mockEnabledGlobally = Boolean(validPayload.globalEnabled)
    }
    
    if (validPayload.workspaceId && validPayload.workspaceOverrides) {
      // Note: workspaceOverrides is a Record<workspace_id, enabled_bool>
      Object.entries(validPayload.workspaceOverrides).forEach(([wsId, enabled]) => {
        const normalized = mockStore.normalizeWorkspaceId(wsId)
        mockStore.mockEnabledByWorkspace[normalized] = Boolean(enabled)
      })
    }
    
    if (validPayload.routes && Array.isArray(validPayload.routes)) {
      mockStore.mockRoutes = validPayload.routes.map((route) => {
        // Validate individual route structure
        const validated = validateMockRoute(route)
        if (!validated) {
          throw new Error(`Invalid route: ${JSON.stringify(route)}`)
        }
        return {
          ...validated,
          workspaceId: mockStore.normalizeWorkspaceId(validated.workspaceId),
        }
      })
    }
    
    if (validPayload.servers && Array.isArray(validPayload.servers)) {
      mockStore.mockServers = validPayload.servers as MockServerData[]
    }

    return NextResponse.json({
      ok: true,
      count: mockStore.mockRoutes.length,
      serverCount: mockStore.mockServers.length,
      globalEnabled: mockStore.mockEnabledGlobally,
      workspaceOverrides: mockStore.mockEnabledByWorkspace,
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
  const workspaceEnabled = workspaceId ? (mockStore.mockEnabledByWorkspace[String(workspaceId)] ?? undefined) : undefined

  return NextResponse.json({
    routes: mockStore.mockRoutes.map((route) => ({
      ...route,
      workspaceId: mockStore.normalizeWorkspaceId(route.workspaceId),
    })),
    servers: mockStore.mockServers,
    globalEnabled: mockStore.mockEnabledGlobally,
    workspaceEnabled,
    workspaceId,
    baseUrl: mockStore.mockBaseUrl,
    logs: includeLogs ? mockStore.getMockLogs() : undefined,
  })
}
