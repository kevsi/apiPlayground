"use client"

import React, { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useRequestStore } from "@/hooks/use-request-store"
import { MOCK_CONFIG_UPDATED_EVENT } from "@/lib/mock-events"

export function MockBanner() {
  const { activeWorkspaceId } = useRequestStore()
  const workspaceId = activeWorkspaceId || null
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!workspaceId) return
    const key = `mock-banner-dismissed-${workspaceId}`
    const v = typeof window !== "undefined" ? window.sessionStorage.getItem(key) : null
    setDismissed(Boolean(v))
  }, [workspaceId])

  useEffect(() => {
    let cancelled = false
    async function fetchStatus() {
      try {
        const params = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ""
        const res = await fetch(`/api/mock/config${params}`)
        const data = await res.json()
        if (!cancelled) {
          // workspaceEnabled may be undefined — fall back to global
          setEnabled(data.workspaceEnabled ?? data.globalEnabled ?? false)
        }
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
  }, [workspaceId])

  if (!workspaceId) return null
  if (dismissed) return null
  if (enabled === null) return null
  if (!enabled) return null

  const handleDisable = async () => {
    if (!workspaceId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/mock/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, workspaceEnabled: false }),
      })
      if (res.ok) {
        setEnabled(false)
        window.dispatchEvent(new Event(MOCK_CONFIG_UPDATED_EVENT))
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  const handleDismiss = () => {
    if (!workspaceId) return
    const key = `mock-banner-dismissed-${workspaceId}`
    try { window.sessionStorage.setItem(key, "1") } catch {}
    setDismissed(true)
  }

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[min(980px,95%)] rounded-md border border-yellow-400 bg-yellow-50/90 text-yellow-900 px-4 py-2 shadow-sm flex items-center gap-3">
      <div className="flex-1 text-sm">Mock server active for workspace <strong>{workspaceId}</strong>. Requests may be intercepted by configured mock routes.</div>
      <div className="flex items-center gap-2">
        <Button variant="destructive" size="sm" onClick={handleDisable} disabled={loading}>Disable for workspace</Button>
          <Button variant="outline" size="sm" onClick={() => window.open(`/api/mock/config?workspaceId=${encodeURIComponent(workspaceId)}&logs=true`, "_blank")}>View logs</Button>
        <Button variant="ghost" size="sm" onClick={handleDismiss}>Hide</Button>
      </div>
    </div>
  )
}
