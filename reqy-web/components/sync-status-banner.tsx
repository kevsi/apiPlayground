"use client"
import { useSyncState } from "@/hooks/store/sync-state"

export function SyncStatusBanner() {
  const syncing = useSyncState((s) => s.syncing)
  const syncError = useSyncState((s) => s.syncError)
  const conflicts = useSyncState((s) => s.conflicts)
  const lastSyncAt = useSyncState((s) => s.lastSyncAt)
  const enabled = useSyncState((s) => s.enabled)
  const clearConflicts = useSyncState((s) => s.clearConflicts)

  if (!enabled) return null

  return (
    <div className="fixed bottom-2 right-2 z-50 max-w-sm rounded-md border bg-card p-2 text-xs shadow">
      <div className="flex items-center justify-between gap-2">
        <span>
          {syncing ? "Syncing..." :
            syncError ? <span className="text-red-500">{syncError}</span> :
            lastSyncAt ? `Last sync: ${new Date(lastSyncAt).toLocaleTimeString()}` :
            "Sync idle"}
        </span>
      </div>
      {conflicts.length > 0 && (
        <div className="mt-1 flex items-center justify-between gap-2 text-orange-600">
          <span>{conflicts.length} conflict{conflicts.length > 1 ? "s" : ""} resolved (server won)</span>
          <button onClick={clearConflicts} className="text-xs underline">dismiss</button>
        </div>
      )}
    </div>
  )
}
