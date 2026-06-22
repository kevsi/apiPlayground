"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  addStoreChangeListener,
  globalStore as _globalStore,
  forceCommit,
  type RequestStore,
} from "./use-request-store"
import { syncClient, AuthError } from "@/lib/sync-client"
import { offlineQueue } from "@/lib/offline-queue"
import { mergePayloads } from "@/lib/sync-utils"
import type { SyncPayload, SyncItemType, ConflictItem, SyncState } from "@/lib/sync-types"
import { persistence } from "@/lib/persistence"

const SYNC_ENABLED_KEY = "reqly_sync_enabled"
const SYNC_DEVICE_ID_KEY = "reqly_sync_device_id"
const LAST_PULL_AT_KEY = "reqly_sync_last_pull"
const LAST_PUSH_AT_KEY = "reqly_sync_last_push"

const PULL_INTERVAL_MS = 30_000
const PUSH_INTERVAL_MS = 5_000

function getDeviceId(): string {
  let id = persistence.getItem<string>(SYNC_DEVICE_ID_KEY)
  if (!id) {
    id = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
    persistence.setItem(SYNC_DEVICE_ID_KEY, id)
  }
  return id
}

function getLong(key: string, fallback = 0): number {
  const v = persistence.getItem<number | string>(key)
  return typeof v === "number" ? v : typeof v === "string" ? Number(v) || fallback : fallback
}

function setLong(key: string, value: number): void {
  persistence.setItem(key, value)
}

function toPayload(itemType: SyncItemType, data: unknown): SyncPayload {
  const anyData = data as Record<string, unknown>
  return {
    itemType,
    itemId: String(anyData.id ?? ""),
    workspaceId: anyData.workspaceId ? String(anyData.workspaceId) : undefined,
    data,
    updatedAt: typeof anyData.updatedAt === "number" ? anyData.updatedAt : Date.now(),
    deleted: !!anyData.deleted,
  }
}

function extractPendingPayloads(store: RequestStore, since: number): SyncPayload[] {
  const payloads: SyncPayload[] = []

  for (const col of store.collections) {
    if (col.updatedAt > since) payloads.push(toPayload("collection", col))
  }
  for (const env of store.environments) {
    if (env.updatedAt > since) payloads.push(toPayload("environment", env))
  }
  for (const h of store.history) {
    if (h.updatedAt > since) payloads.push(toPayload("history", h))
  }
  for (const vm of store.variableMappings) {
    if (vm.updatedAt > since) payloads.push(toPayload("variableMapping", vm))
  }
  for (const proj of store.projects) {
    const ts = proj.analyzedAt ? new Date(proj.analyzedAt).getTime() : 0
    if (ts > since) payloads.push(toPayload("project", proj))
  }
  for (const ws of store.workspaces) {
    if (ws.updatedAt > since) payloads.push(toPayload("workspace", ws))
  }

  return payloads
}

function findLocalItem(store: RequestStore, itemType: SyncItemType, itemId: string): unknown | undefined {
  switch (itemType) {
    case "collection":
      return store.collections.find((c) => c.id === itemId)
    case "environment":
      return store.environments.find((e) => e.id === itemId)
    case "history":
      return store.history.find((h) => h.id === itemId)
    case "variableMapping":
      return store.variableMappings.find((vm) => vm.id === itemId)
    case "project":
      return store.projects.find((p) => p.id === itemId)
    case "workspace":
      return store.workspaces.find((w) => w.id === itemId)
    default:
      return undefined
  }
}

export interface UseSyncResult {
  state: SyncState
  conflicts: ConflictItem[]
  lastSyncAt: number
  pendingCount: number
  isEnabled: boolean
  isAuthenticated: boolean
  deviceId: string
  setEnabled: (enabled: boolean) => void
  resolveConflict: (conflict: ConflictItem, resolution: "local" | "remote") => Promise<void>
  forceSync: () => Promise<void>
}

export function useSync(): UseSyncResult {
  const [state, setState] = useState<SyncState>("idle")
  const [conflicts, setConflicts] = useState<ConflictItem[]>([])
  const [lastSyncAt, setLastSyncAt] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [isEnabled, setIsEnabledState] = useState(() => {
    const v = persistence.getItem<boolean | string>(SYNC_ENABLED_KEY)
    return v !== false && v !== "false"
  })
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const deviceId = useRef(getDeviceId())
  const lastPullAt = useRef(getLong(LAST_PULL_AT_KEY))
  const lastPushAt = useRef(getLong(LAST_PUSH_AT_KEY))
  const pushTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pullInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const isSyncing = useRef(false)
  const unmountRef = useRef(false)

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/status", { credentials: "include" })
      const body = await res.json()
      setIsAuthenticated(body.connected === true)
      return body.connected === true
    } catch {
      setIsAuthenticated(false)
      return false
    }
  }, [])

  const doPull = useCallback(async () => {
    if (isSyncing.current || unmountRef.current) return
    isSyncing.current = true
    setState("syncing")

    try {
      const authenticated = await checkAuth()
      if (!authenticated) {
        setState("idle")
        isSyncing.current = false
        return
      }

      const result = await syncClient.pull(lastPullAt.current)

      let maxUpdatedAt = lastPullAt.current
      if (result.items.length > 0) {
        let draft: RequestStore = { ..._globalStore }
        const newConflicts: ConflictItem[] = []

        for (const ri of result.items) {
          const remotePayload = ri.payload as SyncPayload
          const localItem = findLocalItem(draft, remotePayload.itemType, remotePayload.itemId)
          maxUpdatedAt = Math.max(maxUpdatedAt, remotePayload.updatedAt)

          if (remotePayload.deleted) {
            draft = removeItemFromDraft(draft, remotePayload.itemType, remotePayload.itemId)
            continue
          }

          if (!localItem) {
            draft = addItemToDraft(draft, remotePayload.itemType, remotePayload.data)
            continue
          }

          const localPayload = toPayload(remotePayload.itemType, localItem)
          const merged = mergePayloads(localPayload, remotePayload, deviceId.current)

          if (merged.needsManualResolution) {
            newConflicts.push({
              id: `${remotePayload.itemType}:${remotePayload.itemId}`,
              itemType: remotePayload.itemType,
              itemId: remotePayload.itemId,
              localPayload,
              remotePayload,
              timestamp: Date.now(),
            })
            continue
          }

          draft = updateItemInDraft(draft, merged.winner.itemType, merged.winner.data)
        }

        if (newConflicts.length > 0) {
          setConflicts((prev) => {
            const map = new Map<string, ConflictItem>()
            prev.forEach((c) => map.set(c.id, c))
            newConflicts.forEach((c) => map.set(c.id, c))
            return Array.from(map.values())
          })
        }

        forceCommit(() => draft)
      }

      lastPullAt.current = maxUpdatedAt
      setLong(LAST_PULL_AT_KEY, maxUpdatedAt)
      setLastSyncAt(Date.now())
      setState(result.items.length > 0 ? "synced" : "idle")
    } catch (err) {
      if (err instanceof AuthError) {
        setIsAuthenticated(false)
        setState("idle")
      } else {
        setState("error")
      }
    } finally {
      isSyncing.current = false
    }
  }, [checkAuth])

  const doPush = useCallback(async () => {
    if (!navigator.onLine || unmountRef.current) return

    try {
      const authenticated = await checkAuth()
      if (!authenticated) return

      const queued = await offlineQueue.peek()
      const queuePayloads = queued.map((q) => q.payload)
      const payloads = extractPendingPayloads(_globalStore, lastPushAt.current)

      const allPayloads = [...queuePayloads, ...payloads]
      if (allPayloads.length === 0) return

      const dedup = new Map<string, SyncPayload>()
      for (const p of allPayloads) {
        const key = `${p.itemType}:${p.itemId}`
        const existing = dedup.get(key)
        if (!existing || p.updatedAt > existing.updatedAt) {
          dedup.set(key, p)
        }
      }
      const batch = Array.from(dedup.values())

      setState("syncing")
      await syncClient.push(batch, deviceId.current)

      if (queued.length > 0) {
        await offlineQueue.dequeueAll(queued.map((q) => q.id))
      }

      lastPushAt.current = Date.now()
      setLong(LAST_PUSH_AT_KEY, lastPushAt.current)
      setPendingCount(0)
      setLastSyncAt(Date.now())
      setState("synced")
    } catch (err) {
      if (err instanceof AuthError) {
        setIsAuthenticated(false)
      }
      setState("error")
    }
  }, [checkAuth])

  useEffect(() => {
    if (!isEnabled) return

    const removeListener = addStoreChangeListener((store) => {
      if (!isAuthenticated || !navigator.onLine) {
        const payloads = extractPendingPayloads(store, lastPushAt.current)
        for (const p of payloads) {
          offlineQueue.enqueue(p).catch(() => {})
        }
        offlineQueue.size().then((n) => setPendingCount(n))
        return
      }

      if (pushTimeout.current) clearTimeout(pushTimeout.current)
      pushTimeout.current = setTimeout(() => {
        doPush()
      }, PUSH_INTERVAL_MS)
    })

    return () => {
      removeListener()
      if (pushTimeout.current) clearTimeout(pushTimeout.current)
    }
  }, [isEnabled, isAuthenticated, doPush])

  useEffect(() => {
    if (!isEnabled) return

    checkAuth().then((ok) => {
      if (ok) doPull()
    })

    pullInterval.current = setInterval(() => {
      if (isAuthenticated) doPull()
    }, PULL_INTERVAL_MS)

    return () => {
      if (pullInterval.current) clearInterval(pullInterval.current)
    }
  }, [isEnabled, isAuthenticated, doPull, checkAuth])

  useEffect(() => {
    if (!isEnabled) return

    const onFocus = () => {
      if (isAuthenticated && !isSyncing.current) {
        doPull()
      }
    }

    const onOnline = () => {
      if (isAuthenticated) {
        doPull()
        doPush()
      }
    }

    if (typeof window !== "undefined") {
      window.addEventListener("focus", onFocus)
      window.addEventListener("online", onOnline)
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", onFocus)
        window.removeEventListener("online", onOnline)
      }
    }
  }, [isEnabled, isAuthenticated, doPull, doPush])

  useEffect(() => {
    if (!isEnabled) return

    const interval = setInterval(() => {
      offlineQueue.size().then((n) => setPendingCount(n))
    }, 5_000)

    return () => clearInterval(interval)
  }, [isEnabled])

  const resolveConflict = useCallback(
    async (conflict: ConflictItem, resolution: "local" | "remote") => {
      try {
        setState("syncing")

        if (resolution === "local") {
          const winner = conflict.localPayload
          forceCommit((prev) => updateItemInDraft(prev, winner.itemType, winner.data))
          await syncClient.push([winner], deviceId.current)
        }

        await syncClient.resolve(
          conflict.itemId,
          conflict.itemType,
          resolution,
          deviceId.current
        )

        setConflicts((prev) => prev.filter((c) => c.id !== conflict.id))
        setState("synced")
        setLastSyncAt(Date.now())
      } catch (err) {
        setState("error")
        throw err
      }
    },
    []
  )

  const forceSync = useCallback(async () => {
    await doPush()
    await doPull()
  }, [doPush, doPull])

  const setEnabled = useCallback((enabled: boolean) => {
    persistence.setItem(SYNC_ENABLED_KEY, enabled)
    setIsEnabledState(enabled)
    if (enabled) {
      checkAuth().then((ok) => {
        if (ok) doPull()
      })
    }
  }, [checkAuth, doPull])

  useEffect(() => {
    unmountRef.current = false
    return () => {
      unmountRef.current = true
    }
  }, [])

  return {
    state,
    conflicts,
    lastSyncAt,
    pendingCount,
    isEnabled,
    isAuthenticated,
    deviceId: deviceId.current,
    setEnabled,
    resolveConflict,
    forceSync,
  }
}

// ── Helpers: mutate draft store without React ────────────────────────

function removeItemFromDraft(draft: RequestStore, itemType: SyncItemType, itemId: string): RequestStore {
  switch (itemType) {
    case "collection":
      return { ...draft, collections: draft.collections.filter((c) => c.id !== itemId) }
    case "environment":
      return { ...draft, environments: draft.environments.filter((e) => e.id !== itemId) }
    case "history":
      return { ...draft, history: draft.history.filter((h) => h.id !== itemId) }
    case "variableMapping":
      return { ...draft, variableMappings: draft.variableMappings.filter((vm) => vm.id !== itemId) }
    case "project":
      return { ...draft, projects: draft.projects.filter((p) => p.id !== itemId) }
    case "workspace": {
      const remaining = draft.workspaces.filter((w) => w.id !== itemId)
      return {
        ...draft,
        workspaces: remaining,
        activeWorkspaceId:
          draft.activeWorkspaceId === itemId && remaining.length > 0 ? remaining[0].id : draft.activeWorkspaceId,
      }
    }
    default:
      return draft
  }
}

function addItemToDraft(draft: RequestStore, itemType: SyncItemType, data: unknown): RequestStore {
  switch (itemType) {
    case "collection":
      return { ...draft, collections: [...draft.collections, data as unknown as RequestStore["collections"][number]] }
    case "environment":
      return { ...draft, environments: [...draft.environments, data as unknown as RequestStore["environments"][number]] }
    case "history":
      return { ...draft, history: [...draft.history, data as unknown as RequestStore["history"][number]] }
    case "variableMapping":
      return { ...draft, variableMappings: [...draft.variableMappings, data as unknown as RequestStore["variableMappings"][number]] }
    case "project":
      return { ...draft, projects: [...draft.projects, data as unknown as RequestStore["projects"][number]] }
    case "workspace":
      return { ...draft, workspaces: [...draft.workspaces, data as unknown as RequestStore["workspaces"][number]] }
    default:
      return draft
  }
}

function updateItemInDraft(draft: RequestStore, itemType: SyncItemType, data: unknown): RequestStore {
  const item = data as Record<string, unknown>
  const id = item.id as string
  switch (itemType) {
    case "collection":
      return {
        ...draft,
        collections: draft.collections.map((c) => (c.id === id ? (data as unknown as typeof c) : c)),
      }
    case "environment":
      return {
        ...draft,
        environments: draft.environments.map((e) => (e.id === id ? (data as unknown as typeof e) : e)),
      }
    case "history":
      return { ...draft, history: draft.history.map((h) => (h.id === id ? (data as unknown as typeof h) : h)) }
    case "variableMapping":
      return {
        ...draft,
        variableMappings: draft.variableMappings.map((vm) => (vm.id === id ? (data as unknown as typeof vm) : vm)),
      }
    case "project":
      return { ...draft, projects: draft.projects.map((p) => (p.id === id ? (data as unknown as typeof p) : p)) }
    case "workspace":
      return {
        ...draft,
        workspaces: draft.workspaces.map((w) => (w.id === id ? (data as unknown as typeof w) : w)),
      }
    default:
      return draft
  }
}
