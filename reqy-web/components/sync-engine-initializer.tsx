"use client"

import { useEffect } from "react"
import { useSyncState } from "@/hooks/store/sync-state"
import { useSyncEngine } from "@/hooks/use-sync-engine"

/**
 * Initializes the Cloud sync engine (polling every 30s) when enabled.
 * This component renders nothing — it's a side-effect component.
 */
export function SyncEngineInitializer() {
  const enabled = useSyncState((s) => s.enabled)
  const setServerUrl = useSyncState((s) => s.setServerUrl)
  const serverUrl = useSyncState((s) => s.serverUrl)
  const workspaceId = useSyncState((s) => s.workspaceId)

  // Pre-fill server URL from env if available
  useEffect(() => {
    if (
      !serverUrl &&
      typeof process !== "undefined" &&
      (process as { env?: { NEXT_PUBLIC_SYNC_URL?: string } }).env?.NEXT_PUBLIC_SYNC_URL
    ) {
      setServerUrl(
        (process as { env?: { NEXT_PUBLIC_SYNC_URL?: string } }).env!
          .NEXT_PUBLIC_SYNC_URL as string,
      )
    }
  }, [serverUrl, setServerUrl])

  // Suppress unused-var lint warning for state slices we may want to read later
  void enabled
  void workspaceId

  // The hook handles polling lifecycle based on `enabled`
  useSyncEngine()

  return null
}
