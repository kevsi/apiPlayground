"use client"

import { useState, useEffect, useCallback } from "react"
import type { RequestItem, Collection, HistoryItem } from "@/hooks/use-request-store"
import { isTauriAvailable } from "@/lib/tauri"
import { getMockRoutes, setMockRoutes, isMockEnabledGlobally, setMockEnabledGlobally, reloadMockoonServer } from "@/lib/tauri-mock"
import type { MockRoute, MockServerConfig, MockServer } from "@/lib/mock-types"
import { MOCK_CONFIG_UPDATED_EVENT } from "@/lib/mock-events"
import { persistence } from "@/lib/persistence"

export interface MockLogEntry {
  timestamp: number
  method: string
  path: string
  matchedRouteId: string
  matchedRouteName: string
  responseStatus: number
  delay: number
}

const STORAGE_KEY = "reqly-mock-routes"
const CONFIG_KEY = "reqly-mock-config"
const LOGS_KEY = "reqly-mock-logs"
const SERVERS_KEY = "reqly-mock-servers"
const DEFAULT_SERVER_ID = "mock_server_default"

function loadConfig(): MockServerConfig {
  if (typeof window === "undefined") return { baseUrl: "" }
  try {
    return persistence.getItem<MockServerConfig>(CONFIG_KEY) || { baseUrl: "" }
  } catch {
    return { baseUrl: "" }
  }
}

async function saveConfig(config: MockServerConfig) {
  if (typeof window === "undefined") return
  try {
    await persistence.setItem(CONFIG_KEY, config)
  } catch { /* quota */ }
}

function loadLogs(): MockLogEntry[] {
  if (typeof window === "undefined") return []
  try {
    return persistence.getItem<MockLogEntry[]>(LOGS_KEY) || []
  } catch {
    return []
  }
}

async function saveLogs(logs: MockLogEntry[]) {
  if (typeof window === "undefined") return
  try {
    await persistence.setItem(LOGS_KEY, logs)
  } catch { /* quota */ }
}

function loadServers(): MockServer[] {
  if (typeof window === "undefined") return []
  try {
    return persistence.getItem<MockServer[]>(SERVERS_KEY) || []
  } catch {
    return []
  }
}

async function saveServers(servers: MockServer[]) {
  if (typeof window === "undefined") return
  try {
    await persistence.setItem(SERVERS_KEY, servers)
  } catch { /* quota */ }
}

function loadFromStorage(): MockRoute[] {
  if (typeof window === "undefined") return []
  try {
    const routes: MockRoute[] = persistence.getItem<MockRoute[]>(STORAGE_KEY) || []
    return routes.map((r) => ({
      ...r,
      workspaceId: (r as MockRoute & { workspaceId?: string }).workspaceId || "ws-personal",
    }))
  } catch {
    return []
  }
}

async function saveToStorage(routes: MockRoute[]) {
  if (typeof window === "undefined") return
  try {
    await persistence.setItem(STORAGE_KEY, routes)
  } catch { /* quota exceeded, silently ignore */ }
}

let _id = 0
function generateId(): string {
  return `mock_${Date.now()}_${++_id}_${Math.random().toString(36).substring(2, 7)}`
}

function createDefaultServer(): MockServer {
  return {
    id: DEFAULT_SERVER_ID,
    name: "Default",
    baseUrl: "",
    localPrefix: "default",
    enabled: true,
    createdAt: Date.now(),
  }
}

export function useMockStore() {
  const [routes, setRoutes] = useState<MockRoute[]>([])
  const [servers, setServers] = useState<MockServer[]>([])
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [enabledGlobally, setEnabledGlobally] = useState(true)
  const [mockLogs, setMockLogs] = useState<MockLogEntry[]>([])
  const [config, setConfig] = useState<MockServerConfig>({ baseUrl: "" })

  useEffect(() => {
    async function load() {
      // Restore config + logs from localStorage
      setConfig(loadConfig())
      setMockLogs(loadLogs())

      // Load or initialize servers
      let loadedServers = loadServers()
      if (loadedServers.length === 0) {
        loadedServers = [createDefaultServer()]
      }
      setServers(loadedServers)
      setSelectedServerId(loadedServers[0]?.id || DEFAULT_SERVER_ID)

      if (isTauriAvailable()) {
        // Load global toggle state
        try {
          const globalEnabled = await isMockEnabledGlobally()
          setEnabledGlobally(globalEnabled)
        } catch { /* use default */ }

        const local = loadFromStorage()
        if (local.length > 0) {
          // Ensure routes without serverId are assigned to default
          const migratedRoutes = local.map(r => ({
            ...r,
            serverId: r.serverId || DEFAULT_SERVER_ID,
            workspaceId: r.workspaceId || "ws-personal"
          }))
          setRoutes(migratedRoutes)
        } else {
          const tauriRoutes = await getMockRoutes()
          if (tauriRoutes.length > 0) {
            const migratedRoutes = tauriRoutes.map(r => ({
              ...r,
              serverId: r.serverId || DEFAULT_SERVER_ID,
              workspaceId: r.workspaceId || "ws-personal"
            }))
            setRoutes(migratedRoutes)
            saveToStorage(migratedRoutes)
          }
        }
      } else {
        try {
          const res = await fetch("/api/mock/config")
          const data = await res.json()
          if (data.globalEnabled !== undefined) {
            setEnabledGlobally(Boolean(data.globalEnabled))
          }
          if (data.baseUrl !== undefined) {
            setConfig((prev) => ({ ...prev, baseUrl: data.baseUrl || prev.baseUrl }))
          }
        } catch { /* server not available */ }

        const local = loadFromStorage()
        if (local.length > 0) {
          const migratedRoutes = local.map(r => ({
            ...r,
            serverId: r.serverId || DEFAULT_SERVER_ID,
            workspaceId: r.workspaceId || "ws-personal"
          }))
          setRoutes(migratedRoutes)
        } else {
          try {
            const res = await fetch("/api/mock/config")
            const data = await res.json()
            const serverRoutes: MockRoute[] = (data.routes || []).map((r: MockRoute) => ({
              ...r,
              serverId: r.serverId || DEFAULT_SERVER_ID,
              workspaceId: r.workspaceId || "ws-personal",
              responseHeaders: r.responseHeaders ?? { "content-type": "application/json" },
            }))
            if (serverRoutes.length > 0) {
              setRoutes(serverRoutes)
              saveToStorage(serverRoutes)
            }
          } catch { /* server not available */ }
        }
      }

      setIsLoaded(true)
    }
    load()
  }, [])

  useEffect(() => {
    if (!isLoaded) return
    ;(async () => {
      await Promise.all([
        saveToStorage(routes),
        saveConfig(config),
        saveServers(servers),
      ])
      syncToBackend(routes, config, servers)
    })()
  }, [routes, config, servers, isLoaded])

  useEffect(() => {
    ;(async () => {
      await saveLogs(mockLogs)
    })()
  }, [mockLogs])

  const addRoute = useCallback((data: Omit<MockRoute, "id" | "createdAt" | "updatedAt">) => {
    const now = Date.now()
    const route: MockRoute = {
      ...data,
      workspaceId: data.workspaceId || "ws-personal",
      serverId: data.serverId || selectedServerId || DEFAULT_SERVER_ID,
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    }
    setRoutes((prev) => [...prev, route])
    return route.id
  }, [selectedServerId])

  const updateRoute = useCallback((id: string, updates: Partial<MockRoute>) => {
    setRoutes((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...updates, updatedAt: Date.now() } : r))
    )
  }, [])

  const deleteRoute = useCallback((id: string) => {
    setRoutes((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const toggleGlobal = useCallback(() => {
    setEnabledGlobally((prev) => {
      const next = !prev
      if (isTauriAvailable()) {
        setMockEnabledGlobally(next).catch(() => {})
      } else {
        fetch("/api/mock/config", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ globalEnabled: next }),
        }).then(() => {
          if (typeof window !== "undefined") {
            window.dispatchEvent(new Event(MOCK_CONFIG_UPDATED_EVENT))
          }
        }).catch(() => {})
      }
      return next
    })
  }, [])

  const toggleRoute = useCallback((id: string) => {
    setRoutes((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        const updated = { ...r, enabled: !r.enabled, updatedAt: Date.now() }
        return updated
      })
    )
  }, [])

  const reorderRoutes = useCallback((orderedIds: string[]) => {
    setRoutes((prev) => {
      const routeMap = new Map(prev.map((r) => [r.id, r]))
      return orderedIds.map((id) => routeMap.get(id)).filter(Boolean) as MockRoute[]
    })
  }, [])

  const generateFromCollection = useCallback(
    (collection: Collection, history: HistoryItem[] = [], serverId: string = DEFAULT_SERVER_ID) => {
      const newIds: string[] = []
      for (const req of collection.requests) {
        const pathPattern = extractPathPattern(req.url)
        if (!pathPattern) continue

        // Find the latest saved response for this request
        const savedResponse = findLatestResponse(req, history)

        const id = addRoute({
          name: req.name,
          method: req.method,
          pathPattern,
          responseStatus: savedResponse?.status ?? 200,
          responseHeaders: savedResponse?.headers ?? { "content-type": "application/json" },
          responseBody: savedResponse?.body ?? JSON.stringify({ message: `Mock response for ${req.name}` }, null, 2),
          contentType: savedResponse?.contentType ?? "application/json",
          delay: 0,
          enabled: true,
          serverId,
          workspaceId: collection.workspaceId || "ws-personal",
          collectionId: collection.id,
          collectionName: collection.name,
        })
        newIds.push(id)
      }
      return newIds
    },
    [addRoute]
  )

  const getRoutesForWorkspace = useCallback(
    (workspaceId: string) => routes.filter((r) => r.workspaceId === workspaceId),
    [routes]
  )

  const addMockLog = useCallback((entry: MockLogEntry) => {
    setMockLogs((prev) => {
      const next = [...prev, entry]
      if (next.length > 200) return next.slice(-200)
      return next
    })
  }, [])

  const clearMockLogs = useCallback(() => {
    setMockLogs([])
  }, [])

  const setBaseUrl = useCallback((url: string) => {
    setConfig((prev) => ({ ...prev, baseUrl: url }))
  }, [])

  // ===== Server management methods =====

  const addServer = useCallback((server: Omit<MockServer, "id" | "createdAt">) => {
    const newServer: MockServer = {
      ...server,
      id: generateId(),
      createdAt: Date.now(),
    }
    setServers((prev) => [...prev, newServer])
    setSelectedServerId(newServer.id)
    return newServer.id
  }, [])

  const updateServer = useCallback((id: string, patch: Partial<MockServer>) => {
    setServers((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    )
  }, [])

  const deleteServer = useCallback((id: string) => {
    if (id === DEFAULT_SERVER_ID) return // Cannot delete default server
    setServers((prev) => prev.filter((s) => s.id !== id))
    // Move all routes from this server to default
    setRoutes((prev) =>
      prev.map((r) =>
        r.serverId === id ? { ...r, serverId: DEFAULT_SERVER_ID } : r
      )
    )
    // If this was selected, select default
    if (selectedServerId === id) {
      setSelectedServerId(DEFAULT_SERVER_ID)
    }
  }, [selectedServerId])

  const selectServer = useCallback((id: string) => {
    setSelectedServerId(id)
  }, [])

  const getServerRoutes = useCallback(
    (serverId: string): MockRoute[] => {
      return routes.filter((r) => r.serverId === serverId)
    },
    [routes]
  )

  return {
    routes,
    servers,
    selectedServerId,
    isLoaded,
    enabledGlobally,
    mockLogs,
    baseUrl: config.baseUrl,
    setBaseUrl,
    addRoute,
    updateRoute,
    deleteRoute,
    toggleRoute,
    reorderRoutes,
    toggleGlobal,
    generateFromCollection,
    getRoutesForWorkspace,
    addMockLog,
    clearMockLogs,
    // Server methods
    addServer,
    updateServer,
    deleteServer,
    selectServer,
    getServerRoutes,
  }
}

function findLatestResponse(
  request: RequestItem,
  history: HistoryItem[]
): { body: string; status: number; contentType: string; headers: Record<string, string> } | null {
  // Find the most recent history entry matching method + URL
  const matches = history.filter(
    (h) => h.method === request.method && h.url === request.url && h.responseBody != null
  )
  if (matches.length === 0) return null

  // Sort by executedAt descending, take latest
  matches.sort((a, b) => b.executedAt - a.executedAt)
  const latest = matches[0]

  const body = typeof latest.responseBody === "string"
    ? latest.responseBody
    : JSON.stringify({ message: `Mock response for ${request.name}` }, null, 2)

  return {
    body,
    status: latest.responseStatus ?? 200,
    contentType: detectContentType(body),
    headers: { "content-type": detectContentType(body) },
  }
}

/** Naive content-type detection from response body string */
function detectContentType(body: string): string {
  try {
    JSON.parse(body)
    return "application/json"
  } catch {
    return "text/plain"
  }
}

function extractPathPattern(url: string): string {
  try {
    // Extract the pathname from a full URL, or use as-is if it's already a path
    const path = url.startsWith("http") || url.startsWith("//")
      ? new URL(url).pathname
      : url.startsWith("/")
        ? url
        : `/${url}`

    // Remove trailing slash (except for root)
    return path.replace(/\/$/g, "") || "/"
  } catch {
    return "/"
  }
}

/**
 * Sync routes to backend (Tauri Rust store or Next.js API).
 * Fire-and-forget — no error if backend is down.
 */
async function syncToBackend(routes: MockRoute[], config?: MockServerConfig, servers?: MockServer[]) {
  try {
    if (isTauriAvailable()) {
      await setMockRoutes(routes)
    }
    // Toujours syncer vers le handler Next.js /api/mock/[...path] qui lit
    // l'état en mémoire côté serveur (getMockRoutes / getMockServers).
    // En mode Tauri, le sync Rust seul ne suffit pas car la requête finale
    // transite par le serveur Next.js qui a sa propre copie en mémoire.
    await fetch("/api/mock/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ routes, baseUrl: config?.baseUrl, servers }),
    })

    // Reload Mockoon CLI sidecar with current active routes.
    const activeRoutes = routes.filter((r) => r.enabled)
    const result = await reloadMockoonServer(activeRoutes)
    if (!result.ok) {
      console.error("Mockoon sidecar reload failed:", result.error)
    }
  } catch {
    // Backend might not be available
  }
}
