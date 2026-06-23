"use client"
import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LogIn } from "lucide-react"
import { useSyncState } from "@/hooks/store/sync-state"

export function WorkspaceJoinDialog() {
  const [token, setToken] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const serverUrl = useSyncState((s) => s.serverUrl)
  const setServerUrl = useSyncState((s) => s.setServerUrl)
  const setWorkspace = useSyncState((s) => s.setWorkspace)
  const setEnabled = useSyncState((s) => s.setEnabled)

  // Pre-fill server URL from env if available
  useEffect(() => {
    if (!serverUrl && typeof process !== "undefined" && (process as any).env?.NEXT_PUBLIC_SYNC_URL) {
      setServerUrl((process as any).env.NEXT_PUBLIC_SYNC_URL)
    }
  }, [serverUrl, setServerUrl])

  const join = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${serverUrl}/api/memberships`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `Join failed: ${res.status}`)
      }
      const data = await res.json()
      setWorkspace(data.workspace.id)
      setEnabled(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Join failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <LogIn className="w-3 h-3 mr-1" /> Join
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Join a shared workspace</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Server URL</label>
            <Input
              placeholder="http://localhost:4000"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Invite token</label>
            <Input
              placeholder="inv-..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button onClick={join} disabled={loading || !token || !serverUrl}>
            {loading ? "Joining..." : "Join workspace"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
