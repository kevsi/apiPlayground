"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useSyncState } from "@/hooks/use-sync-state"

export function SyncStatusBanner() {
  const { state, retry } = useSyncState()

  if (state === "synced" || state === "syncing") return null

  return (
    <Alert variant="destructive" className="rounded-none border-x-0 border-t-0">
      <AlertTitle>Sync Error</AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>Failed to save data. Your changes may not persist.</span>
        <Button variant="outline" size="sm" onClick={retry}>
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  )
}
