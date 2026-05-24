"use client"

import { useState, useEffect, useCallback, useRef } from "react"

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export interface RequestItem {
  id: string
  name: string
  method: HttpMethod
  url: string
  endpoint: string
  headers?: Record<string, string>
  body?: string
  queryParams?: Array<{ key: string; value: string }>
  createdAt: number
  updatedAt: number
}

export interface HistoryItem extends RequestItem {
  responseStatus?: number
  responseTime?: number
  responseSize?: string
  responseBody?: string | Blob
  executedAt: number
}

export interface Collection {
  id: string
  name: string
  description?: string
  color: string
  icon: string
  requests: RequestItem[]
  createdAt: number
  updatedAt: number
}

export interface EnvironmentVariable {
  key: string
  value: string
  enabled: boolean
}

export interface Environment {
  id: string
  name: string
  color: string
  variables: EnvironmentVariable[]
  createdAt: number
  updatedAt: number
}

export interface VariableMapping {
  id: string
  name: string
  sourceRequestId: string
  sourcePath: string
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface Notification {
  id: string
  title: string
  body?: string
  type?: "info" | "success" | "warning" | "error"
  event?: string
  read: boolean
  createdAt: number
}

import type { CurrentRequest, LastResponse } from "@/lib/ai-engine"
import { toast } from '@/hooks/use-toast'
import type { SavedProject } from '@/types'

interface RequestStore {
  history: HistoryItem[]
  collections: Collection[]
  environments: Environment[]
  notifications: Notification[]
  variableMappings: VariableMapping[]
  systemNotificationPermission?: string
  activeEnvironmentId: string | null
  projects: SavedProject[]
  selectedProjectId: string | null
  currentRequest?: CurrentRequest | null
  lastResponse?: LastResponse | null
  environmentVariables?: Record<string, string>
  collectionHistory?: CurrentRequest[]
  activeCollection?: string | null
  aiAutoApply?: boolean
  aiAudit?: Array<{ id: string; actionType: string; detail?: any; result?: any; timestamp: number }>
}

const STORAGE_KEY = "reqly-request-store"
const STORE_UPDATE_EVENT = "reqly-store-update"

const defaultEnvironments: Environment[] = [
  {
    id: "env-global",
    name: "Global",
    color: "slate",
    variables: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
]

const initialStore: RequestStore = {
  history: [],
  collections: [],
  environments: defaultEnvironments,
  notifications: [],
  variableMappings: [],
  systemNotificationPermission: typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default',
  activeEnvironmentId: "env-global",
  projects: [],
  selectedProjectId: null,
  currentRequest: null,
  lastResponse: null,
  environmentVariables: {},
  collectionHistory: [],
  activeCollection: null,
  aiAutoApply: false,
  aiAudit: [],
}

function loadFromStorage(): RequestStore {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return loadFallback()
    const parsed = JSON.parse(stored)
    return {
      history: parsed.history || [],
      collections: parsed.collections || [],
      environments: parsed.environments || defaultEnvironments,
      notifications: parsed.notifications || [],
      variableMappings: parsed.variableMappings || [],
      systemNotificationPermission:
        parsed.systemNotificationPermission ?? (typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'),
      activeEnvironmentId:
        parsed.activeEnvironmentId !== undefined
          ? parsed.activeEnvironmentId
          : "env-global",
      projects: parsed.projects || [],
      selectedProjectId: parsed.selectedProjectId ?? null,
      currentRequest: parsed.currentRequest ?? null,
      lastResponse: parsed.lastResponse ?? null,
      environmentVariables: parsed.environmentVariables ?? {},
      collectionHistory: Array.isArray(parsed.collectionHistory) ? parsed.collectionHistory : [],
      activeCollection: parsed.activeCollection ?? null,
      aiAutoApply: typeof parsed.aiAutoApply === 'boolean' ? parsed.aiAutoApply : false,
      aiAudit: Array.isArray(parsed.aiAudit) ? parsed.aiAudit : [],
    }
  } catch {
    return loadFallback()
  }
}

/** Fallback : si la clé principale n'existe pas, on tente la migration depuis l'ancienne clé */
function loadFallback(): RequestStore {
  try {
    const legacy = localStorage.getItem("probe_projects")
    const fallbackProjects: SavedProject[] = legacy ? JSON.parse(legacy) : []
    return {
      history: [],
      collections: [],
      environments: defaultEnvironments,
      notifications: [],
      systemNotificationPermission: typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported',
      variableMappings: [],
      activeEnvironmentId: "env-global",
      projects: fallbackProjects,
      selectedProjectId: null,
      currentRequest: null,
      lastResponse: null,
      environmentVariables: {},
      collectionHistory: [],
      activeCollection: null,
      aiAutoApply: false,
      aiAudit: [],
    }
  } catch {
    return {
      history: [],
      collections: [],
      environments: defaultEnvironments,
      notifications: [],
      systemNotificationPermission: typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported',
      variableMappings: [],
      activeEnvironmentId: "env-global",
      projects: [],
      selectedProjectId: null,
      currentRequest: null,
      lastResponse: null,
      environmentVariables: {},
      collectionHistory: [],
      activeCollection: null,
      aiAutoApply: false,
      aiAudit: [],
    }
  }
}

function saveToStorage(store: RequestStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // intentionally empty
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Proactive notifications — runs once on app load
   Rules:
   1. Any endpoint whose avg response time is ≥130% of its own historical baseline
   2. Any endpoint with error rate > 20% over last 10 calls
   3. Any collection not used (no requests) for more than 7 days
───────────────────────────────────────────────────────────────────────── */
function runProactiveAnalysis(store: RequestStore) {
  try {
    const { history, collections } = store
    if (!history.length) return

    const NOW = Date.now()
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
    const ERROR_THRESHOLD = 0.2   // 20 %
    const SLOW_THRESHOLD  = 1.3   // +30 %

    /* ── 1. Group history by endpoint ─────────────────────────── */
    const endpointMap = new Map<
      string,
      { times: number[]; statuses: number[]; lastUsed: number }
    >()

    for (const item of history) {
      const key = item.endpoint || item.url || "Unknown"
      if (!endpointMap.has(key)) {
        endpointMap.set(key, { times: [], statuses: [], lastUsed: 0 })
      }
      const bucket = endpointMap.get(key)!
      if (item.responseTime != null) bucket.times.push(item.responseTime)
      if (item.responseStatus != null) bucket.statuses.push(item.responseStatus)
      if (item.executedAt > bucket.lastUsed) bucket.lastUsed = item.executedAt
    }

    /* ── 2. Slow endpoint detection ───────────────────────────── */
    for (const [endpoint, data] of endpointMap.entries()) {
      if (data.times.length < 3) continue   // need enough samples

      const allAvg = data.times.reduce((s, t) => s + t, 0) / data.times.length
      // Compare last 3 calls to overall average
      const recent3 = data.times.slice(-3)
      const recentAvg = recent3.reduce((s, t) => s + t, 0) / recent3.length

      if (recentAvg >= allAvg * SLOW_THRESHOLD) {
        toast({
          title: `⚠️ Endpoint lent détecté`,
          description: `${endpoint} répond ~${Math.round(recentAvg)}ms en moyenne (normale : ~${Math.round(allAvg)}ms, soit +${Math.round((recentAvg / allAvg - 1) * 100)}%).`,
          variant: "default",
        })
      }
    }

    /* ── 3. High error rate detection (last 10 calls) ─────────── */
    for (const [endpoint, data] of endpointMap.entries()) {
      const last10 = data.statuses.slice(-10)
      if (last10.length < 3) continue

      const errorCount = last10.filter((s) => s >= 400).length
      const errorRate = errorCount / last10.length

      if (errorRate > ERROR_THRESHOLD) {
        toast({
          title: `🔴 Taux d'erreur élevé`,
          description: `${endpoint} a ${Math.round(errorRate * 100)}% d'erreurs sur les ${last10.length} derniers appels.`,
          variant: "destructive",
        })
      }
    }

    /* ── 4. Stale collections (unused > 7 days) ───────────────── */
    for (const collection of collections) {
      if (!collection.requests.length) continue

      // Find the most recent usage of any request in this collection
      let lastUsed = collection.updatedAt
      for (const request of collection.requests) {
        const matchedRequests = history.filter(
          (item) => item.endpoint === request.endpoint || item.url === request.url
        )
        if (matchedRequests.length) {
          const latest = Math.max(...matchedRequests.map((item) => item.executedAt))
          lastUsed = Math.max(lastUsed, latest)
        }
      }

      if (NOW - lastUsed > SEVEN_DAYS_MS) {
        const daysAgo = Math.floor((NOW - lastUsed) / (24 * 60 * 60 * 1000))
        toast({
          title: `📁 Collection inactive`,
          description: `"${collection.name}" n'a pas été utilisée depuis ${daysAgo} jours.`,
          variant: "default",
        })
      }
    }
  } catch {
    // intentionally empty
  }
}

export function useRequestStore() {
  const [store, setStore] = useState<RequestStore>(initialStore)
  const [isLoaded, setIsLoaded] = useState(false)
  // Keep a ref always in sync so mutations can read latest state synchronously
  const storeRef = useRef<RequestStore>(initialStore)

  // Load from localStorage on mount
  useEffect(() => {
    let loaded = loadFromStorage()
    
    // ── Auto-create "Brouillons" collection on first startup ──────────────
    const hasBrouillonsCollection = loaded.collections.some(c => c.name === "Brouillons")
    if (!hasBrouillonsCollection) {
      const brouillonsCollection: Collection = {
        id: `col-brouillons-${Date.now()}`,
        name: "Brouillons",
        description: "Vos brouillons et requêtes non classées",
        color: "slate",
        icon: "folder",
        requests: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      loaded = {
        ...loaded,
        collections: [brouillonsCollection, ...loaded.collections],
      }
      saveToStorage(loaded)
      try {
        console.log('STORE INIT: Auto-created "Brouillons" collection:', brouillonsCollection.id)
      } catch {
        // intentionally empty
      }
    }
    
    storeRef.current = loaded
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStore(loaded)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoaded(true)

    // ── Proactive notifications analysis ──────────────────────────
    runProactiveAnalysis(loaded)

    const handleUpdate = () => {
      const latest = loadFromStorage()
      storeRef.current = latest
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStore(latest)
    }

    window.addEventListener(STORE_UPDATE_EVENT, handleUpdate)

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        const latest = loadFromStorage()
        storeRef.current = latest
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStore(latest)
      }
    }

    window.addEventListener("storage", handleStorage)
    return () => {
      window.removeEventListener(STORE_UPDATE_EVENT, handleUpdate)
      window.removeEventListener("storage", handleStorage)
    }
  }, [])

  // Helper: apply an update, save synchronously, and schedule a React re-render
  const commit = useCallback((updater: (prev: RequestStore) => RequestStore) => {
    const next = updater(storeRef.current)
    try {
      console.log('STORE COMMIT: next.collections.length=', next.collections.length)
    } catch {
      // intentionally empty
    }
    storeRef.current = next
    saveToStorage(next)   // ← synchronous write, survives immediate navigation
    setStore(next)        // ← triggers re-render
    window.dispatchEvent(new Event(STORE_UPDATE_EVENT)) // ← sync other components
  }, [])

  // ── Notifications ───────────────────────────────────────────────────────
  const addNotification = useCallback(
    (notif: Omit<Notification, "id" | "createdAt" | "read">) => {
      const newNotif: Notification = {
        ...notif,
        id: `notif-${Date.now()}`,
        read: false,
        createdAt: Date.now(),
      }
      commit((prev) => ({ ...prev, notifications: [newNotif, ...prev.notifications] }))
      // Show an in-app toast panel for every notification event (gated by settings).
      try {
        toast({
          title: newNotif.title,
          description: newNotif.body,
          variant: newNotif.type === "error" ? "destructive" : "default",
          meta: { event: newNotif.event },
        } as unknown as Parameters<typeof toast>[0])
      } catch {
        // intentionally empty
      }
      // Show system notification when permission granted (check stored permission)
      try {
        const perm = storeRef.current.systemNotificationPermission ?? (typeof window !== "undefined" && "Notification" in window ? Notification.permission : undefined)
        if (perm === "granted" && typeof window !== "undefined" && "Notification" in window) {
          try {
            new Notification(newNotif.title, { body: newNotif.body })
          } catch {
            // intentionally empty
          }
        }
      } catch {
        // intentionally empty
      }
      return newNotif.id
    },
    [commit]
  )

  const requestSystemNotificationPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported"
    try {
      const result = await Notification.requestPermission()
      commit((prev) => ({ ...prev, systemNotificationPermission: result }))
      return result // 'granted' | 'denied' | 'default'
    } catch {
      commit((prev) => ({ ...prev, systemNotificationPermission: "default" }))
      return "default"
    }
  }, [commit])

  
  const markNotificationRead = useCallback(
    (id: string) => {
      commit((prev) => ({
        ...prev,
        notifications: prev.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
      }))
    },
    [commit]
  )

  const clearNotifications = useCallback(() => {
    commit((prev) => ({ ...prev, notifications: [] }))
  }, [commit])

  // ── History ───────────────────────────────────────────────────────────────

  const addToHistory = useCallback(
    (item: Omit<HistoryItem, "id" | "executedAt" | "createdAt" | "updatedAt">) => {
      commit((prev) => ({
        ...prev,
        history: [
          {
            ...item,
            id: `hist-${Date.now()}`,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            executedAt: Date.now(),
          },
          ...prev.history,
        ].slice(0, 100),
      }))
      runProactiveAnalysis(storeRef.current)
    },
    [commit]
  )

  // When a request is executed, add a simple notification
  const _addHistoryAndNotify = useCallback(
    (item: Omit<HistoryItem, "id" | "executedAt" | "createdAt" | "updatedAt">) => {
      addToHistory(item)
      try {
        addNotification({
            title: `Requête ${item.method} ${item.endpoint}`,
            body: `Statut: ${item.responseStatus ?? "-"} — ${item.responseTime ?? "-"}ms`,
            type: "info",
            event: "requestComplete",
        })
      } catch {
        // intentionally empty
      }
    },
    [addToHistory, addNotification]
  )

  const setCurrentRequest = useCallback(
    (request: Partial<RequestItem> | RequestItem | CurrentRequest) => {
      const params = Array.isArray((request as any).queryParams)
        ? Object.fromEntries(
            ((request as any).queryParams as Array<{ key: string; value: string }>).map(({ key, value }) => [key, value])
          )
        : {}
      const currentRequest: CurrentRequest = {
        method: ((request as any).method || "GET") as HttpMethod,
        url: (request as any).url || "",
        headers: (request as any).headers || {},
        params,
        body: (request as any).body,
        auth: (request as any).auth,
      }
      commit((prev) => ({ ...prev, currentRequest }))
    },
    [commit]
  )

  const setLastResponse = useCallback(
    (response: LastResponse | null) => {
      commit((prev) => ({ ...prev, lastResponse: response }))
    },
    [commit]
  )

  const executeRequest = useCallback(async (request: Partial<RequestItem> | RequestItem) => {
    const method = (request as any).method || "GET"
    const url = (request as any).url || ""
    const headers = (request as any).headers || {}
    const body = (request as any).body

    try {
      const proxyResponse = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, method, headers, body: method !== "GET" ? body : undefined }),
      })

      const proxyResult = await proxyResponse.json().catch(() => ({}))

      const params = Array.isArray((request as any).queryParams)
        ? Object.fromEntries(
            ((request as any).queryParams as Array<{ key: string; value: string }>).map(({ key, value }) => [key, value])
          )
        : {}

      const currentRequest: CurrentRequest = {
        method: method as HttpMethod,
        url,
        headers: headers as Record<string, string>,
        params,
        body: body as any,
        auth: (request as any).auth,
      }

      setCurrentRequest(currentRequest)

      let rawBody: string | Blob = proxyResult.body ?? proxyResult.error ?? ""
      let parsedBody: string | Blob
      
      if (proxyResult.encoding === "base64") {
        const contentType = proxyResult.headers?.["content-type"] || proxyResult.headers?.["Content-Type"] || "application/octet-stream"
        const binary = Uint8Array.from(atob(rawBody as string), (c) => c.charCodeAt(0))
        rawBody = new Blob([binary], { type: contentType })
        parsedBody = rawBody
      } else {
        parsedBody = typeof rawBody === "string"
          ? (() => {
              try {
                return JSON.parse(rawBody)
              } catch {
                return rawBody
              }
            })()
          : rawBody
      }

      const lastResponse: LastResponse = {
        status: proxyResult.status ?? (proxyResponse.ok ? 200 : 0),
        statusText: proxyResult.statusText ?? undefined,
        durationMs: proxyResult.durationMs ?? undefined,
        headers: proxyResult.headers || {},
        body: parsedBody,
      }

      setLastResponse(lastResponse)

      const historyItem = {
        name: (request as any).name || url,
        method: method as any,
        url,
        endpoint: url,
        headers: headers as Record<string, string>,
        body: body as any,
        responseStatus: lastResponse.status,
        responseTime: lastResponse.durationMs ?? undefined,
        responseSize: proxyResult.size ?? undefined,
        responseBody: rawBody,
      }

      _addHistoryAndNotify(historyItem)
      return proxyResult
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      setCurrentRequest(request)
      setLastResponse({
        status: 0,
        headers: {},
        body: `Error: ${errMsg}`,
      })
      _addHistoryAndNotify({
        name: (request as any).name || url,
        method: method as any,
        url,
        endpoint: url,
        headers: headers as Record<string, string>,
        body: body as any,
        responseStatus: 0,
        responseTime: undefined,
        responseSize: "0 B",
        responseBody: `Error: ${errMsg}`,
      })
      return { error: errMsg }
    }
  }, [ _addHistoryAndNotify ])

  const executeRequestById = useCallback(async (requestId: string) => {
    // find request in collections
    const collections = storeRef.current.collections
    for (const c of collections) {
      const found = c.requests.find((r) => r.id === requestId)
      if (found) return executeRequest(found)
    }
    return { error: 'request-not-found' }
  }, [executeRequest])

  const clearHistory = useCallback(() => {
    commit((prev) => ({ ...prev, history: [] }))
  }, [commit])

  const setAiAutoApply = useCallback((enabled: boolean) => {
    commit((prev) => ({ ...prev, aiAutoApply: enabled }))
  }, [commit])

  const addAiAuditEntry = useCallback((entry: { actionType: string; detail?: any; result?: any }) => {
    const newEntry = { ...entry, id: `ai-audit-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, timestamp: Date.now() }
    commit((prev) => ({ ...prev, aiAudit: [newEntry, ...(prev.aiAudit || [])] }))
    return newEntry.id
  }, [commit])

  const removeFromHistory = useCallback(
    (id: string) => {
      commit((prev) => ({
        ...prev,
        history: prev.history.filter((h) => h.id !== id),
      }))
    },
    [commit]
  )

  // ── Collections ───────────────────────────────────────────────────────────

  const addCollection = useCallback(
    (collection: Omit<Collection, "id" | "createdAt" | "updatedAt" | "requests">) => {
      const newCollection: Collection = {
        ...collection,
        id: `col-${Date.now()}`,
        requests: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      commit((prev) => ({
        ...prev,
        collections: [...prev.collections, newCollection],
      }))
      try {
        console.log('STORE ACTION: addCollection -> added', newCollection.id, newCollection.name)
      } catch {
        // intentionally empty
      }
      try {
        addNotification({
          title: `Collection créée: ${collection.name}`,
          body: `La collection "${collection.name}" a été créée.`,
          type: "success",
          event: "collectionComplete",
        })
      } catch {
        // intentionally empty
      }
      return newCollection.id
    },
    [commit]
  )

  const updateCollection = useCallback(
    (id: string, updates: Partial<Collection>) => {
      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c
        ),
      }))
    },
    [commit]
  )

  const deleteCollection = useCallback(
    (id: string) => {
      commit((prev) => ({
        ...prev,
        collections: prev.collections.filter((c) => c.id !== id),
      }))
    },
    [commit]
  )

  const addRequestToCollection = useCallback(
    (
      collectionId: string,
      request: Omit<RequestItem, "id" | "createdAt" | "updatedAt">
    ) => {
      const newRequest: RequestItem = {
        ...request,
        id: `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === collectionId
            ? { ...c, requests: [...c.requests, newRequest], updatedAt: Date.now() }
            : c
        ),
      }))
      try {
        console.log('STORE ACTION: addRequestToCollection ->', collectionId, newRequest.id)
      } catch {
        // intentionally empty
      }
      return newRequest.id
    },
    [commit]
  )

  const removeRequestFromCollection = useCallback(
    (collectionId: string, requestId: string) => {
      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === collectionId
            ? {
                ...c,
                requests: c.requests.filter((r) => r.id !== requestId),
                updatedAt: Date.now(),
              }
            : c
        ),
      }))
    },
    [commit]
  )

  const updateRequestInCollection = useCallback(
    (collectionId: string, requestId: string, updates: Partial<RequestItem>) => {
      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === collectionId
            ? {
                ...c,
                requests: c.requests.map((r) =>
                  r.id === requestId ? { ...r, ...updates, updatedAt: Date.now() } : r
                ),
                updatedAt: Date.now(),
              }
            : c
        ),
      }))
    },
    [commit]
  )

  const updateRequestById = useCallback(
    (requestId: string, updates: Partial<RequestItem>) => {
      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) => {
          const hasUpdatedRequest = c.requests.some((r) => r.id === requestId)
          return {
            ...c,
            requests: c.requests.map((r) =>
              r.id === requestId ? { ...r, ...updates, updatedAt: Date.now() } : r
            ),
            updatedAt: hasUpdatedRequest ? Date.now() : c.updatedAt,
          }
        }),
      }))
    },
    [commit]
  )

  const addVariableMapping = useCallback(
    (mapping: Omit<VariableMapping, "id" | "createdAt" | "updatedAt">) => {
      const newMapping: VariableMapping = {
        ...mapping,
        id: `map-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      commit((prev) => ({
        ...prev,
        variableMappings: [...prev.variableMappings, newMapping],
      }))
      return newMapping.id
    },
    [commit]
  )

  const updateVariableMapping = useCallback(
    (mappingId: string, updates: Partial<VariableMapping>) => {
      commit((prev) => ({
        ...prev,
        variableMappings: prev.variableMappings.map((mapping) =>
          mapping.id === mappingId ? { ...mapping, ...updates, updatedAt: Date.now() } : mapping
        ),
      }))
    },
    [commit]
  )

  const removeVariableMapping = useCallback(
    (mappingId: string) => {
      commit((prev) => ({
        ...prev,
        variableMappings: prev.variableMappings.filter((mapping) => mapping.id !== mappingId),
      }))
    },
    [commit]
  )

  // ── Projects ────────────────────────────────────────────────────────────

  const addProject = useCallback(
    (project: Omit<SavedProject, "id">) => {
      commit((prev) => ({
        ...prev,
        projects: [
          {
            ...project,
            id: `proj-${Date.now()}`,
          },
          ...prev.projects,
        ],
      }))
    },
    [commit]
  )

  const deleteProject = useCallback(
    (projectId: string) => {
      commit((prev) => ({
        ...prev,
        projects: prev.projects.filter((p) => p.id !== projectId),
      }))
    },
    [commit]
  )

  const updateProject = useCallback(
    (projectId: string, updates: Partial<SavedProject>) => {
      commit((prev) => ({
        ...prev,
        projects: prev.projects.map((p) =>
          p.id === projectId ? { ...p, ...updates } : p
        ),
      }))
    },
    [commit]
  )

  const setSelectedProject = useCallback(
    (projectId: string | null) => {
      commit((prev) => ({ ...prev, selectedProjectId: projectId }))
    },
    [commit]
  )

  // ── Environments ──────────────────────────────────────────────────────────

  const addEnvironment = useCallback(
    (env: Omit<Environment, "id" | "createdAt" | "updatedAt">) => {
      const newEnv: Environment = {
        ...env,
        id: `env-${Date.now()}`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      commit((prev) => ({
        ...prev,
        environments: [...prev.environments, newEnv],
      }))
      return newEnv.id
    },
    [commit]
  )

  const updateEnvironment = useCallback(
    (id: string, updates: Partial<Environment>) => {
      commit((prev) => ({
        ...prev,
        environments: prev.environments.map((e) =>
          e.id === id ? { ...e, ...updates, updatedAt: Date.now() } : e
        ),
      }))
    },
    [commit]
  )

  const deleteEnvironment = useCallback(
    (id: string) => {
      commit((prev) => ({
        ...prev,
        environments: prev.environments.filter((e) => e.id !== id),
        activeEnvironmentId:
          prev.activeEnvironmentId === id ? null : prev.activeEnvironmentId,
      }))
    },
    [commit]
  )

  const setActiveEnvironment = useCallback(
    (id: string | null) => {
      commit((prev) => ({ ...prev, activeEnvironmentId: id }))
    },
    [commit]
  )

  const computedEnvironmentVariables = store.environments
    .find((env) => env.id === store.activeEnvironmentId)
    ?.variables.filter((v) => v.enabled)
    .reduce<Record<string, string>>((acc, variable) => {
      acc[variable.key] = variable.value
      return acc
    }, {}) || {}

  const computedCollectionHistory = store.history.slice(0, 10).map((item) => ({
    method: item.method,
    url: item.url,
    headers: item.headers || {},
    params: Array.isArray(item.queryParams)
      ? Object.fromEntries(item.queryParams.map(({ key, value }) => [key, value]))
      : {},
    body: item.body,
    auth: undefined,
  }))

  return {
    history: store.history,
    collections: store.collections,
    environments: store.environments,
    activeEnvironmentId: store.activeEnvironmentId,
    projects: store.projects,
    selectedProjectId: store.selectedProjectId,
    currentRequest: store.currentRequest ?? null,
    lastResponse: store.lastResponse ?? null,
    environmentVariables: {
      ...(store.environmentVariables || {}),
      ...computedEnvironmentVariables,
    },
    collectionHistory:
      store.collectionHistory && store.collectionHistory.length > 0
        ? store.collectionHistory
        : computedCollectionHistory,
    activeCollection: store.activeCollection ?? null,
    isLoaded,
    addToHistory,
    clearHistory,
    removeFromHistory,
    addCollection,
    updateCollection,
    deleteCollection,
    addRequestToCollection,
    removeRequestFromCollection,
    updateRequestInCollection,
    updateRequestById,
    addProject,
    updateProject,
    deleteProject,
    setSelectedProject,
    addEnvironment,
    updateEnvironment,
    deleteEnvironment,
    setActiveEnvironment,
    notifications: store.notifications,
    addNotification,
    markNotificationRead,
    clearNotifications,
    variableMappings: store.variableMappings,
    addVariableMapping,
    updateVariableMapping,
    removeVariableMapping,
    addHistoryAndNotify: _addHistoryAndNotify,
    requestSystemNotificationPermission,
    systemNotificationPermission: store.systemNotificationPermission,
    aiAutoApply: store.aiAutoApply,
    setAiAutoApply,
    executeRequest,
    executeRequestById,
    aiAudit: store.aiAudit,
    addAiAuditEntry,
    setCurrentRequest,
    setLastResponse,
  }
}
