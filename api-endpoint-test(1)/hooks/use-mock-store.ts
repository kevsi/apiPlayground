"use client"

import { useState, useEffect, useCallback } from "react"
import type { RequestItem, Collection, HistoryItem } from "@/hooks/use-request-store"
import { isTauriAvailable } from "@/lib/tauri"
import { getMockRoutes, setMockRoutes, isMockEnabledGlobally, setMockEnabledGlobally } from "@/lib/tauri-mock"
import type { MockRoute, MockRouteRateLimit, MockRouteVariant } from "@/lib/mock-types"
import { MOCK_CONFIG_UPDATED_EVENT } from "@/lib/mock-events"

export interface MockLogEntry {
  timestamp: number
  method: string
  path: string
  matchedRouteId: string
  matchedRouteName: string
  responseStatus: number
  delay: number
}

interface MockStore {
  routes: MockRoute[]
}

const STORAGE_KEY = "reqly-mock-routes"

function loadFromStorage(): MockRoute[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const routes: MockRoute[] = raw ? JSON.parse(raw) : []
    return routes.map((r) => ({
      ...r,
      workspaceId: (r as any).workspaceId || "ws-personal",
    }))
  } catch {
    return []
  }
}

function saveToStorage(routes: MockRoute[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routes))
  } catch { /* quota exceeded, silently ignore */ }
}

let _id = 0
function generateId(): string {
  return `mock_${Date.now()}_${++_id}_${Math.random().toString(36).substring(2, 7)}`
}

export function useMockStore() {
  const [routes, setRoutes] = useState<MockRoute[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [enabledGlobally, setEnabledGlobally] = useState(true)
  const [mockLogs, setMockLogs] = useState<MockLogEntry[]>([])

  useEffect(() => {
    async function load() {
      if (isTauriAvailable()) {
        // Load global toggle state
        try {
          const globalEnabled = await isMockEnabledGlobally()
          setEnabledGlobally(globalEnabled)
        } catch { /* use default */ }

        // Tauri mode: localStorage est la source primaire (write-ahead log),
        // Rust est le miroir. On ne lit Rust que si localStorage est vide.
        const local = loadFromStorage()
        if (local.length > 0) {
          setRoutes(local)
        } else {
          const tauriRoutes = await getMockRoutes()
          if (tauriRoutes.length > 0) {
            setRoutes(tauriRoutes)
            saveToStorage(tauriRoutes)
          }
        }
      } else {
        // Web mode: localStorage first, fallback to Next.js API
        try {
          const res = await fetch("/api/mock/config")
          const data = await res.json()
          if (data.globalEnabled !== undefined) {
            setEnabledGlobally(Boolean(data.globalEnabled))
          }
        } catch { /* server not available */ }

        const local = loadFromStorage()
        if (local.length > 0) {
          setRoutes(local)
        } else {
          try {
            const res = await fetch("/api/mock/config")
            const data = await res.json()
            const serverRoutes: MockRoute[] = (data.routes || []).map((r: MockRoute) => ({
              ...r,
              responseHeaders: r.responseHeaders ?? { "content-type": "application/json" },
            }))
            if (serverRoutes.length > 0) {
              setRoutes(serverRoutes)
              saveToStorage(serverRoutes)
            }
          } catch { /* server not available */ }
        }
      }

      // Fetch logs
      try {
        const logRes = await fetch("/api/mock/config?logs=true")
        const logData = await logRes.json()
        if (Array.isArray(logData.logs)) {
          setMockLogs(logData.logs)
        }
      } catch { /* logs not available */ }

      setIsLoaded(true)
    }
    load()
  }, [])

  useEffect(() => {
    if (!isLoaded) return
    saveToStorage(routes)
    syncToBackend(routes)
  }, [routes, isLoaded])

  const addRoute = useCallback((data: Omit<MockRoute, "id" | "createdAt" | "updatedAt">) => {
    const now = Date.now()
    const route: MockRoute = {
      ...data,
      workspaceId: data.workspaceId || "ws-personal",
      id: generateId(),
      createdAt: now,
      updatedAt: now,
    }
    setRoutes((prev) => [...prev, route])
    return route.id
  }, [])

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
        // Write-ahead dans localStorage pour survivre à une navigation
        // avant que le useEffect async ait fini de sync
        return updated
      })
    )
  }, [])

  const generateFromCollection = useCallback(
    (collection: Collection, history: HistoryItem[] = []) => {
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
          workspaceId: collection.workspaceId,
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

  return {
    routes,
    isLoaded,
    enabledGlobally,
    mockLogs,
    addRoute,
    updateRoute,
    deleteRoute,
    toggleRoute,
    toggleGlobal,
    generateFromCollection,
    getRoutesForWorkspace,
    addMockLog,
    clearMockLogs,
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
async function syncToBackend(routes: MockRoute[]) {
  try {
    if (isTauriAvailable()) {
      await setMockRoutes(routes)
    } else {
      await fetch("/api/mock/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ routes }),
      })
    }
  } catch {
    // Backend might not be available
  }
}
