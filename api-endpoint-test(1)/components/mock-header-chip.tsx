"use client"

import React, { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useRequestStore } from "@/hooks/use-request-store"
import { useMockStore } from "@/hooks/use-mock-store"
import { MOCK_CONFIG_UPDATED_EVENT } from "@/lib/mock-events"

export function MockHeaderChip() {
  const { activeWorkspaceId } = useRequestStore()
  const mockStore = useMockStore()
  const workspaceId = activeWorkspaceId || null
  // Initialize from global state to avoid a null -> value flash
  const [enabled, setEnabled] = useState<boolean | null>(mockStore.enabledGlobally ?? null)

  useEffect(() => {
    let cancelled = false

    async function fetchStatus() {
      try {
        const params = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ""
        const res = await fetch(`/api/mock/config${params}`)
        const data = await res.json()
        if (!cancelled) setEnabled(data.workspaceEnabled ?? data.globalEnabled ?? false)
      } catch (e) {
        // ignore
      }
    }

    fetchStatus()

    const handleConfigUpdated = () => {
      fetchStatus()
    }

    window.addEventListener(MOCK_CONFIG_UPDATED_EVENT, handleConfigUpdated)
    return () => {
      cancelled = true
      window.removeEventListener(MOCK_CONFIG_UPDATED_EVENT, handleConfigUpdated)
    }
  }, [workspaceId, mockStore.enabledGlobally])

  // If the mock global flag is known and we haven't set a workspace-specific
  // value yet, use the global value to avoid a UI flash while fetching.
  useEffect(() => {
    setEnabled(mockStore.enabledGlobally ?? false)
  }, [mockStore.enabledGlobally])

  if (enabled === null) return null
  if (!enabled) return null

  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-[12px] font-medium text-yellow-900 border border-yellow-200">Mock ON{workspaceId ? ` (${workspaceId})` : " (global)"}</span>
      <Button variant="ghost" size="sm" onClick={() => window.open(`/api/mock/config${workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}&logs=true` : `?logs=true`}`, "_blank")}>
        Logs
      </Button>
    </div>
  )
}
