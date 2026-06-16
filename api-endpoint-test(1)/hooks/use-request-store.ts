"use client"

import { useState, useEffect, useCallback, useRef } from "react"

// Re-export all types from the types module for backward compatibility
export type {
  HttpMethod,
  CollectionFolder,
  RequestItem,
  HistoryItem,
  Collection,
  EnvironmentVariable,
  Environment,
  VariableMapping,
  Notification,
  Workspace,
} from "./request-types"
export type { RequestStore } from "./request-types"

import type {
  HttpMethod,
  CollectionFolder,
  RequestItem,
  HistoryItem,
  Collection,
  Environment,
  EnvironmentVariable,
  VariableMapping,
  Notification,
  RequestStore,
  Workspace,
} from "./request-types"

import type { CurrentRequest, LastResponse } from "@/lib/ai-engine"
import { toast } from '@/hooks/use-toast'
import { parseJsonSafe } from '@/lib/utils'
import type { SavedProject } from '@/types'
import { runProactiveAnalysis } from "./store-analysis"

const STORAGE_KEY = "reqly-request-store"
const STORE_UPDATE_EVENT = "reqly-store-update"

const WORKSPACE_PERSONAL_ID = "ws-personal"

const defaultEnvironments: Environment[] = [
  {
    id: "env-global",
    name: "Global",
    color: "slate",
    workspaceId: WORKSPACE_PERSONAL_ID,
    variables: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
]

const defaultWorkspace: Workspace = {
  id: WORKSPACE_PERSONAL_ID,
  name: "Personal",
  description: "Your personal workspace",
  color: "slate",
  icon: "folder",
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

const DEFAULT_NOTIFICATION_PREFERENCES: Record<string, boolean> = {
  requestComplete: true,
  collectionComplete: true,
  aiResponse: true,
  aiError: true,
  importExport: true,
}

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
  workspaces: [defaultWorkspace],
  activeWorkspaceId: WORKSPACE_PERSONAL_ID,
  notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
}

function migrateWorkspaceIds(store: RequestStore): RequestStore {
  const hasWorkspaces = store.workspaces && store.workspaces.length > 0
  if (!hasWorkspaces) {
    store = {
      ...store,
      workspaces: [defaultWorkspace],
      activeWorkspaceId: store.activeWorkspaceId ?? WORKSPACE_PERSONAL_ID,
    }
  }

  const wsId = store.activeWorkspaceId ?? WORKSPACE_PERSONAL_ID

  store.collections = store.collections.map((c) => ({
    ...c,
    workspaceId: c.workspaceId || wsId,
  }))

  store.environments = store.environments.map((e) => ({
    ...e,
    workspaceId: e.workspaceId || wsId,
  }))

  store.history = store.history.map((h) => ({
    ...h,
    workspaceId: h.workspaceId || wsId,
  }))

  store.variableMappings = store.variableMappings.map((vm) => ({
    ...vm,
    workspaceId: vm.workspaceId || wsId,
  }))

  return store
}

function loadFromStorage(): RequestStore {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return loadFallback()
    const parsed = JSON.parse(stored)
    return migrateWorkspaceIds({
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
      workspaces: parsed.workspaces || [defaultWorkspace],
      activeWorkspaceId: parsed.activeWorkspaceId ?? WORKSPACE_PERSONAL_ID,
      notificationPreferences: parsed.notificationPreferences ?? { ...DEFAULT_NOTIFICATION_PREFERENCES },
    })
  } catch (e) {
    console.warn("Migration failed:", e)
    return loadFallback()
  }
}

/** Fallback: if the main key does not exist, try migration from old key */
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
      workspaces: [defaultWorkspace],
      activeWorkspaceId: WORKSPACE_PERSONAL_ID,
      notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
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
      workspaces: [defaultWorkspace],
      activeWorkspaceId: WORKSPACE_PERSONAL_ID,
      notificationPreferences: { ...DEFAULT_NOTIFICATION_PREFERENCES },
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

export function useRequestStore() {
  const [store, setStore] = useState<RequestStore>(initialStore)
  const [isLoaded, setIsLoaded] = useState(false)
  // Keep a ref always in sync so mutations can read latest state synchronously
  const storeRef = useRef<RequestStore>(initialStore)

  // Load from localStorage on mount
  useEffect(() => {
    let loaded = loadFromStorage()
    
    // ── Auto-create "Drafts" collection on first startup ──────────────
    const hasDraftsCollection = loaded.collections.some(c => c.name === "Drafts")
    if (!hasDraftsCollection) {
      const draftsCollection: Collection = {
        id: `col-drafts-${Date.now()}`,
        name: "Drafts",
        description: "Your drafts and uncategorized requests",
        color: "slate",
        icon: "folder",
        workspaceId: loaded.activeWorkspaceId ?? WORKSPACE_PERSONAL_ID,
        requests: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      loaded = {
        ...loaded,
        collections: [draftsCollection, ...loaded.collections],
      }
      saveToStorage(loaded)

    }
    
    storeRef.current = loaded
    const t = window.setTimeout(() => {
      setStore(loaded)
      setIsLoaded(true)
    }, 0)

    // ── Proactive notifications analysis ──────────────────────────
    runProactiveAnalysis(loaded)

    const handleUpdate = () => {
      const latest = loadFromStorage()
      storeRef.current = latest
      setStore(latest)
    }

    window.addEventListener(STORE_UPDATE_EVENT, handleUpdate)

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        const latest = loadFromStorage()
        storeRef.current = latest
        setStore(latest)
      }
    }

    window.addEventListener("storage", handleStorage)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener(STORE_UPDATE_EVENT, handleUpdate)
      window.removeEventListener("storage", handleStorage)
    }
  }, [])

  // Helper: apply an update, save synchronously, and schedule a React re-render
  const commit = useCallback((updater: (prev: RequestStore) => RequestStore) => {
    const next = updater(storeRef.current)
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
      // Show system notification when permission granted and event preference enabled
      try {
        const prefs = storeRef.current.notificationPreferences ?? {}
        const eventEnabled = newNotif.event ? prefs[newNotif.event] !== false : true
        if (eventEnabled) {
          const perm = storeRef.current.systemNotificationPermission ?? (typeof window !== "undefined" && "Notification" in window ? Notification.permission : undefined)
          if (perm === "granted" && typeof window !== "undefined" && "Notification" in window) {
            try {
              new Notification(newNotif.title, { body: newNotif.body })
            } catch {
              // intentionally empty
            }
          }
        }
      } catch {
        // intentionally empty
      }
      return newNotif.id
    },
    [commit]
  )

  const setNotificationPreference = useCallback(
    (key: string, value: boolean) => {
      commit((prev) => ({
        ...prev,
        notificationPreferences: {
          ...(prev.notificationPreferences || {}),
          [key]: value,
        },
      }))
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
      const wsId = storeRef.current.activeWorkspaceId ?? WORKSPACE_PERSONAL_ID
      commit((prev) => ({
        ...prev,
        history: [
          {
            ...item,
            workspaceId: wsId,
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
            title: `Request ${item.method} ${item.endpoint}`,
            body: `Status: ${item.responseStatus ?? "-"} — ${item.responseTime ?? "-"}ms`,
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
      const req = request as Partial<RequestItem>
      const params = Array.isArray(req.queryParams)
        ? Object.fromEntries(
            req.queryParams.map(({ key, value }) => [key, value])
          )
        : {}
      const currentRequest: CurrentRequest = {
        method: (req.method || "GET") as HttpMethod,
        url: req.url || "",
        headers: req.headers || {},
        params,
        body: req.body,
        // auth only exists on CurrentRequest, not on RequestItem
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
    const req = request as Partial<RequestItem>
    const method = req.method || "GET"
    const url = req.url || ""
    const headers = req.headers || {}
    const body = req.body

    try {
      const debugHeaders = (typeof process !== "undefined" && process.env && process.env.NODE_ENV !== "production")
        ? { "x-proxy-debug": "1" }
        : {}

      const workspaceId = storeRef.current.activeWorkspaceId
      const proxyResponse = await fetch("/api/proxy", {
        method: "POST",
        headers: ({ "Content-Type": "application/json", ...debugHeaders, ...(workspaceId ? { "x-workspace-id": workspaceId } : {}) } as unknown) as Record<string, string>,
        body: JSON.stringify({ url, method, headers, body: method !== "GET" ? body : undefined, workspaceId }),
      })

      const proxyResult = await parseJsonSafe(proxyResponse)

      const params = Array.isArray(req.queryParams)
        ? Object.fromEntries(
            req.queryParams.map(({ key, value }) => [key, value])
          )
        : {}

      const currentRequest: CurrentRequest = {
        method: method as HttpMethod,
        url,
        headers: headers as Record<string, string>,
        params,
        body: body as unknown,
        // auth not on RequestItem type, cast needed
        auth: (request as any).auth,
      }

      setCurrentRequest(currentRequest)

      const status = proxyResult.status ?? proxyResponse.status
      const rawBodyValue: string | undefined = proxyResult.body ?? proxyResult.error
      let rawBody: string | Blob = rawBodyValue ?? ""
      let parsedBody: string | Blob
      
      if (proxyResult.encoding === "base64" && typeof rawBody === "string") {
        const contentType = proxyResult.headers?.["content-type"] || proxyResult.headers?.["Content-Type"] || "application/octet-stream"
        const binary = Uint8Array.from(atob(rawBody), (c) => c.charCodeAt(0))
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
        status,
        statusText: proxyResult.statusText ?? proxyResponse.statusText ?? undefined,
        durationMs: proxyResult.durationMs ?? undefined,
        headers: proxyResult.headers || {},
        body: parsedBody,
      }

      setLastResponse(lastResponse)

      const historyItem = {
        // name only exists on RequestItem, not on CurrentRequest
        name: (request as any).name || url,
        method: method as HttpMethod,
        url,
        endpoint: url,
        headers: headers as Record<string, string>,
        body: body as string,
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
        // name only exists on RequestItem, not on CurrentRequest
        name: (request as any).name || url,
        method: method as HttpMethod,
        url,
        endpoint: url,
        headers: headers as Record<string, string>,
        body: body as string,
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
      const wsId = storeRef.current.activeWorkspaceId ?? WORKSPACE_PERSONAL_ID
      const newCollection: Collection = {
        ...collection,
        workspaceId: wsId,
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
        addNotification({
          title: `Collection created: ${collection.name}`,
          body: `Collection "${collection.name}" has been created.`,
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

  const duplicateCollection = useCallback(
    (id: string) => {
      commit((prev) => {
        const source = prev.collections.find((c) => c.id === id)
        if (!source) return prev
        const now = Date.now()

        // Build old → new folder ID mapping
        const folderIdMap = new Map<string, string>()
        const cloneFolders = (source.folders ?? []).map((f) => {
          const newId = `fld-${now}-${Math.random().toString(36).substring(2, 9)}`
          folderIdMap.set(f.id, newId)
          return { ...f, id: newId }
        })
        // Apply remapped parentIds on cloned folders
        const remappedFolders = cloneFolders.map((f) => ({
          ...f,
          parentId: f.parentId ? (folderIdMap.get(f.parentId) ?? f.parentId) : null,
        }))

        // Remap request folderIds
        const cloneRequests = source.requests.map((r) => ({
          ...r,
          id: `req-${now}-${Math.random().toString(36).substring(2, 9)}`,
          folderId: r.folderId ? (folderIdMap.get(r.folderId) ?? r.folderId) : r.folderId,
          createdAt: now,
          updatedAt: now,
        }))

        const duplicate: Collection = {
          ...source,
          id: `col-${now}-${Math.random().toString(36).substring(2, 9)}`,
          name: `${source.name} (copy)`,
          requests: cloneRequests,
          folders: remappedFolders,
          createdAt: now,
          updatedAt: now,
          workspaceId: source.workspaceId,
        }
        // Insert right after the source
        const idx = prev.collections.indexOf(source)
        const newCols = [...prev.collections]
        newCols.splice(idx + 1, 0, duplicate)
        return { ...prev, collections: newCols }
      })
    },
    [commit]
  )

  const reorderCollections = useCallback(
    (orderedIds: string[]) => {
      commit((prev) => {
        const map = new Map(prev.collections.map((c) => [c.id, c]))
        const reordered = orderedIds.map((id) => map.get(id)).filter(Boolean) as Collection[]
        // Preserve any collections not in orderedIds at the end
        const remaining = prev.collections.filter((c) => !orderedIds.includes(c.id))
        return { ...prev, collections: [...reordered, ...remaining] }
      })
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

  // ─── Folder operations ─────────────────────────────────────────────────────

  const addFolder = useCallback(
    (collectionId: string, name: string, parentId: string | null = null) => {
      const newFolder: CollectionFolder = {
        id: `folder-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        name,
        parentId,
        collectionId,
        order: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === collectionId
            ? { ...c, folders: [...(c.folders ?? []), newFolder], updatedAt: Date.now() }
            : c
        ),
      }))
      return newFolder.id
    },
    [commit]
  )

  const renameFolder = useCallback(
    (collectionId: string, folderId: string, name: string) => {
      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === collectionId
            ? {
                ...c,
                folders: (c.folders ?? []).map((f) =>
                  f.id === folderId ? { ...f, name, updatedAt: Date.now() } : f
                ),
                updatedAt: Date.now(),
              }
            : c
        ),
      }))
    },
    [commit]
  )

  const deleteFolder = useCallback(
    (collectionId: string, folderId: string) => {
      commit((prev) => {
        const collectDescendants = (parentId: string): string[] => {
          const col = prev.collections.find((c) => c.id === collectionId)
          if (!col) return []
          return (col.folders ?? [])
            .filter((f) => f.parentId === parentId)
            .flatMap((f) => [f.id, ...collectDescendants(f.id)])
        }
        const toDelete = new Set([folderId, ...collectDescendants(folderId)])

        return {
          ...prev,
          collections: prev.collections.map((c) =>
            c.id === collectionId
              ? {
                  ...c,
                  requests: c.requests.map((r) =>
                    toDelete.has(r.folderId ?? "") ? { ...r, folderId: undefined } : r
                  ),
                  folders: (c.folders ?? []).filter((f) => !toDelete.has(f.id)),
                  updatedAt: Date.now(),
                }
              : c
          ),
        }
      })
    },
    [commit]
  )

  const moveRequestToFolder = useCallback(
    (collectionId: string, requestId: string, folderId: string | null) => {
      const now = Date.now()
      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === collectionId
            ? {
                ...c,
                requests: c.requests.map((r) =>
                  r.id === requestId ? { ...r, folderId, updatedAt: now } : r
                ),
                updatedAt: now,
              }
            : c
        ),
      }))
    },
    [commit]
  )

  const moveFolder = useCallback(
    (collectionId: string, folderId: string, newParentId: string | null) => {
      const isCircular = (targetParentId: string | null, childId: string): boolean => {
        if (!targetParentId) return false
        if (targetParentId === childId) return true
        const col = storeRef.current.collections.find((c) => c.id === collectionId)
        const parent = col?.folders?.find((f) => f.id === targetParentId)
        return parent ? isCircular(parent.parentId, childId) : false
      }
      if (isCircular(newParentId, folderId)) return

      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === collectionId
            ? {
                ...c,
                folders: (c.folders ?? []).map((f) =>
                  f.id === folderId ? { ...f, parentId: newParentId, updatedAt: Date.now() } : f
                ),
                updatedAt: Date.now(),
              }
            : c
        ),
      }))
    },
    [commit]
  )

  const reorderRequestsInCollection = useCallback(
    (collectionId: string, folderId: string | null, orderedRequestIds: string[]) => {
      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) => {
          if (c.id !== collectionId) return c
          const requestsInLevel = c.requests.filter((r) => r.folderId === folderId)
          const requestsNotInLevel = c.requests.filter((r) => r.folderId !== folderId)
          const requestMap = new Map(requestsInLevel.map((r) => [r.id, r]))
          const reordered = orderedRequestIds
            .map((id) => requestMap.get(id))
            .filter(Boolean) as RequestItem[]
          const remaining = requestsInLevel.filter(
            (r) => !orderedRequestIds.includes(r.id)
          )
          return {
            ...c,
            requests: [...reordered, ...remaining, ...requestsNotInLevel],
            updatedAt: Date.now(),
          }
        }),
      }))
    },
    [commit]
  )

  const reorderFolders = useCallback(
    (collectionId: string, parentFolderId: string | null, orderedFolderIds: string[]) => {
      commit((prev) => {
        const collection = prev.collections.find((c) => c.id === collectionId)
        if (!collection) return prev

        const folders = collection.folders ?? []
        const foldersInLevel = folders.filter((f) => f.parentId === parentFolderId)
        const foldersNotInLevel = folders.filter((f) => f.parentId !== parentFolderId)
        const folderMap = new Map(foldersInLevel.map((f) => [f.id, f]))
        const reordered = orderedFolderIds
          .map((id) => folderMap.get(id))
          .filter(Boolean) as CollectionFolder[]
        const remaining = foldersInLevel.filter(
          (f) => !orderedFolderIds.includes(f.id)
        )

        return {
          ...prev,
          collections: prev.collections.map((c) =>
            c.id === collectionId
              ? {
                  ...c,
                  folders: [...reordered, ...remaining, ...foldersNotInLevel],
                  updatedAt: Date.now(),
                }
              : c
          ),
        }
      })
    },
    [commit]
  )

  const getFoldersForCollection = useCallback(
    (collectionId: string): CollectionFolder[] => {
      // This is called synchronously, we read from the store ref
      const col = storeRef.current?.collections?.find((c) => c.id === collectionId)
      return col?.folders ?? []
    },
    []
  )

  const addVariableMapping = useCallback(
    (mapping: Omit<VariableMapping, "id" | "createdAt" | "updatedAt">) => {
      const wsId = storeRef.current.activeWorkspaceId ?? WORKSPACE_PERSONAL_ID
      const newMapping: VariableMapping = {
        ...mapping,
        workspaceId: wsId,
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
      const wsId = storeRef.current.activeWorkspaceId ?? WORKSPACE_PERSONAL_ID
      commit((prev) => ({
        ...prev,
        projects: [
          {
            ...project,
            workspaceId: wsId,
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
      const wsId = storeRef.current.activeWorkspaceId ?? WORKSPACE_PERSONAL_ID
      const newEnv: Environment = {
        ...env,
        workspaceId: wsId,
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

  // ── Workspaces ──────────────────────────────────────────────────────────

  const activeWorkspaceId = store.activeWorkspaceId
  const workspaces = store.workspaces

  const addWorkspace = useCallback(
    (data: Omit<Workspace, "id" | "createdAt" | "updatedAt">) => {
      const now = Date.now()
      const workspace: Workspace = {
        ...data,
        id: `ws-${now}`,
        createdAt: now,
        updatedAt: now,
      }
      commit((prev) => ({
        ...prev,
        workspaces: [...prev.workspaces, workspace],
        activeWorkspaceId: workspace.id,
      }))
      return workspace.id
    },
    [commit]
  )

  const updateWorkspace = useCallback(
    (id: string, updates: Partial<Workspace>) => {
      commit((prev) => ({
        ...prev,
        workspaces: prev.workspaces.map((w) =>
          w.id === id ? { ...w, ...updates, updatedAt: Date.now() } : w
        ),
      }))
    },
    [commit]
  )

  const deleteWorkspace = useCallback(
    (id: string) => {
      commit((prev) => {
        const remaining = prev.workspaces.filter((w) => w.id !== id)
        if (remaining.length === 0) return prev
        return {
          ...prev,
          workspaces: remaining,
          activeWorkspaceId:
            prev.activeWorkspaceId === id ? remaining[0].id : prev.activeWorkspaceId,
        }
      })
    },
    [commit]
  )

  const setActiveWorkspace = useCallback(
    (id: string) => {
      commit((prev) => ({ ...prev, activeWorkspaceId: id }))
    },
    [commit]
  )

  // ── Filtered getters ──────────────────────────────────────────────────

  const workspaceCollections = activeWorkspaceId
    ? store.collections.filter((c) => c.workspaceId === activeWorkspaceId)
    : store.collections

  const workspaceEnvironments = activeWorkspaceId
    ? store.environments.filter((e) => e.workspaceId === activeWorkspaceId)
    : store.environments

  const workspaceHistory = activeWorkspaceId
    ? store.history.filter((h) => h.workspaceId === activeWorkspaceId)
    : store.history

  const workspaceVariableMappings = activeWorkspaceId
    ? store.variableMappings.filter((vm) => vm.workspaceId === activeWorkspaceId)
    : store.variableMappings

  const workspaceProjects = activeWorkspaceId
    ? store.projects.filter((p) => p.workspaceId === activeWorkspaceId)
    : store.projects

  const computedEnvironmentVariables = workspaceEnvironments
    .find((env) => env.id === store.activeEnvironmentId)
    ?.variables.filter((v) => v.enabled)
    .reduce<Record<string, string>>((acc, variable) => {
      acc[variable.key] = variable.value
      return acc
    }, {}) || {}

  const computedCollectionHistory = workspaceHistory.slice(0, 10).map((item) => ({
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
    history: workspaceHistory,
    collections: workspaceCollections,
    environments: workspaceEnvironments,
    activeEnvironmentId: store.activeEnvironmentId,
    projects: workspaceProjects,
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
    duplicateCollection,
    reorderCollections,
    addRequestToCollection,
    removeRequestFromCollection,
    updateRequestInCollection,
    updateRequestById,
    addFolder,
    renameFolder,
    deleteFolder,
    moveRequestToFolder,
    moveFolder,
    getFoldersForCollection,
    reorderRequestsInCollection,
    reorderFolders,
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
    variableMappings: workspaceVariableMappings,
    addVariableMapping,
    updateVariableMapping,
    removeVariableMapping,
    addHistoryAndNotify: _addHistoryAndNotify,
    requestSystemNotificationPermission,
    systemNotificationPermission: store.systemNotificationPermission,
    notificationPreferences: store.notificationPreferences ?? {},
    setNotificationPreference,
    aiAutoApply: store.aiAutoApply,
    setAiAutoApply,
    executeRequest,
    executeRequestById,
    aiAudit: store.aiAudit,
    addAiAuditEntry,
    setCurrentRequest,
    setLastResponse,
    workspaces,
    activeWorkspaceId,
    addWorkspace,
    updateWorkspace,
    deleteWorkspace,
    setActiveWorkspace,
  }
}
