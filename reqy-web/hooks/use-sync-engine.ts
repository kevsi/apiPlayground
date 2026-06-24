"use client"
import { useEffect, useRef, useCallback } from "react"
import { useSyncState } from "@/hooks/store/sync-state"
import { useRequestStore } from "@/hooks/use-request-store"
import { useSyncSocket } from "@/hooks/use-sync-socket"

const POLL_INTERVAL_MS = 30_000

export interface LocalSyncChange {
  entityType: "collection" | "environment" | "folder"
  id: string
  data: object
  updatedAt: number
  updatedBy: string
  baseVersion?: number
}

// Subset of the request store that the sync engine mutates when applying
// remote changes. These live in hooks/store/workspaces.ts but are not yet
// reflected in the public RequestStore interface, so we narrow with a local
// shape instead of `as any`.
interface SyncMutations {
  upsertCollectionFromSync?: (data: unknown) => void
  upsertEnvironmentFromSync?: (data: unknown) => void
  upsertFolderFromSync?: (data: unknown) => void
}

export function useSyncEngine() {
  const syncEnabled = useSyncState((s) => s.enabled)
  const workspaceId = useSyncState((s) => s.workspaceId)
  const serverUrl = useSyncState((s) => s.serverUrl)
  const setSyncing = useSyncState((s) => s.setSyncing)
  const setSyncError = useSyncState((s) => s.setSyncError)
  const setLastSyncAt = useSyncState((s) => s.setLastSyncAt)
  const addConflict = useSyncState((s) => s.addConflict)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const store = useRequestStore() as unknown as SyncMutations

  const pollOnce = useCallback(async () => {
    if (!syncEnabled || !workspaceId || !serverUrl) return
    setSyncing(true)
    setSyncError(null)
    try {
      const res = await fetch(
        `${serverUrl}/api/sync/poll?workspaceId=${encodeURIComponent(workspaceId)}&since=${useSyncState.getState().lastSyncAt ?? 0}`,
        { credentials: "include" }
      )
      if (!res.ok) throw new Error(`Poll failed: ${res.status}`)
      const data = await res.json()
      for (const change of data.changes ?? []) {
        if (change.deleted) continue
        if (change.entityType === "collection") {
          store.upsertCollectionFromSync?.(change.data)
        } else if (change.entityType === "environment") {
          store.upsertEnvironmentFromSync?.(change.data)
        } else if (change.entityType === "folder") {
          store.upsertFolderFromSync?.(change.data)
        }
      }
      setLastSyncAt(data.serverTime ?? Date.now())
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Sync failed")
    } finally {
      setSyncing(false)
    }
  }, [syncEnabled, workspaceId, serverUrl, store, setSyncing, setSyncError, setLastSyncAt])

  const pushLocalChanges = useCallback(async (changes: LocalSyncChange[]) => {
    if (!syncEnabled || !workspaceId || !serverUrl || changes.length === 0) return
    try {
      const res = await fetch(`${serverUrl}/api/sync/push`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, changes }),
      })
      if (!res.ok) throw new Error(`Push failed: ${res.status}`)
      const data = await res.json()
      for (const c of data.conflicts ?? []) {
        addConflict({
          entityType: c.entityType,
          entityId: c.id,
          localUpdatedAt: Date.now(),
          remoteUpdatedAt: c.serverUpdatedAt,
          resolution: "remote-wins",
        })
      }
    } catch (err) {
      setSyncError(err instanceof Error ? err.message : "Push failed")
    }
  }, [syncEnabled, workspaceId, serverUrl, addConflict, setSyncError])

  // WebSocket push: trigger an immediate poll when the server notifies of a
  // remote change. Polling remains active as a fallback (e.g. when WS is down).
  useSyncSocket(
    useCallback(() => {
      void pollOnce()
    }, [])
  )

  // Wire up the banner's retry button: pressing it re-runs the poll loop.
  // Re-registered whenever pollOnce changes (sync state changes).
  useEffect(() => {
    useSyncState.setState({ retrySync: () => { void pollOnce() } })
  }, [pollOnce])

  useEffect(() => {
    if (!syncEnabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }
    pollOnce()
    intervalRef.current = setInterval(pollOnce, POLL_INTERVAL_MS)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [syncEnabled, pollOnce])

  return { pollOnce, pushLocalChanges }
}
