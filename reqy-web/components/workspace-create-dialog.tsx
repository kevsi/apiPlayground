"use client"
import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus } from "lucide-react"
import { useSyncState } from "@/hooks/store/sync-state"

export function WorkspaceCreateDialog() {
  const [name, setName] = useState("")
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

  const create = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${serverUrl}/api/workspaces`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `Create failed: ${res.status}`)
      }
      const data = await res.json()
      setWorkspace(data.workspace.id)
      setEnabled(true)
      setName("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="default" size="sm">
          <Plus className="w-3 h-3 mr-1" /> New workspace
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a new workspace</DialogTitle>
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
            <label className="text-xs text-muted-foreground">Workspace name</label>
            <Input
              placeholder="My Team Workspace"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <Button onClick={create} disabled={loading || !name || !serverUrl}>
            {loading ? "Creating..." : "Create workspace"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
