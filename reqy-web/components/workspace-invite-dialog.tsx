"use client"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Copy, UserPlus } from "lucide-react"
import { useSyncState } from "@/hooks/store/sync-state"

interface Props {
  workspaceId: string
  workspaceName: string
}

export function WorkspaceInviteDialog({ workspaceId, workspaceName }: Props) {
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const serverUrl = useSyncState((s) => s.serverUrl)

  const generate = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${serverUrl}/api/workspaces/${workspaceId}/invitations`, {
        method: "POST",
        credentials: "include",
      })
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      const data = await res.json()
      setToken(data.token)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate token")
    } finally {
      setLoading(false)
    }
  }

  const copy = () => {
    if (token && typeof navigator !== "undefined") {
      navigator.clipboard.writeText(token).catch(() => {})
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="w-3 h-3 mr-1" /> Invite
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite to {workspaceName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!token ? (
            <Button onClick={generate} disabled={loading || !serverUrl}>
              {loading ? "Generating..." : "Generate invite token"}
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Input value={token} readOnly className="font-mono text-xs" />
              <Button size="icon" variant="outline" onClick={copy}>
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
          <p className="text-xs text-muted-foreground">
            Token expires in 7 days. Share with your teammate — they can paste it in the Join dialog.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
