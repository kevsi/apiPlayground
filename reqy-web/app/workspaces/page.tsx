"use client"
import { useState, useEffect, useCallback } from "react"
import { ApiSidebar } from "@/components/api-sidebar"
import { ApiHeader } from "@/components/api-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, Mail, Clock, Activity } from "lucide-react"
import { useSyncState } from "@/hooks/store/sync-state"
import { WorkspaceCreateDialog } from "@/components/workspace-create-dialog"
import { WorkspaceJoinDialog } from "@/components/workspace-join-dialog"
import { WorkspaceInviteDialog } from "@/components/workspace-invite-dialog"
import { useSidebar } from "@/contexts/sidebar-context"
import { cn } from "@/lib/utils"

interface Workspace {
  id: string
  name: string
  ownerId: string
  role: "owner" | "editor" | "viewer"
  createdAt: number
  updatedAt: number
}

interface Invitation {
  id: string
  workspaceName: string
  inviter: string
  expiresAt: number
  token: string
}

interface ActivityEntry {
  id: string
  type: "sync" | "conflict" | "join" | "edit"
  workspaceId: string
  workspaceName: string
  message: string
  timestamp: number
}

const INVITATIONS_KEY = "reqly-pending-invitations"
const ACTIVITY_KEY = "reqly-activity-feed"
const ACTIVITY_MAX = 20

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback } catch { return fallback }
}

function saveJson(key: string, value: unknown) {
  if (typeof window === "undefined") return
  localStorage.setItem(key, JSON.stringify(value))
}

export default function WorkspacesPage() {
  const { isCollapsed, toggleSidebar } = useSidebar()
  const serverUrl = useSyncState((s) => s.serverUrl)
  const activeWorkspaceId = useSyncState((s) => s.workspaceId)
  const setWorkspace = useSyncState((s) => s.setWorkspace)
  const setEnabled = useSyncState((s) => s.setEnabled)
  const lastSyncAt = useSyncState((s) => s.lastSyncAt)
  const syncEnabled = useSyncState((s) => s.enabled)

  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load invitations + activity from localStorage on mount
  useEffect(() => {
    setInvitations(loadJson<Invitation[]>(INVITATIONS_KEY, []))
    setActivity(loadJson<ActivityEntry[]>(ACTIVITY_KEY, []))
  }, [])

  // Append a new activity entry (also persist)
  const appendActivity = useCallback((entry: Omit<ActivityEntry, "id" | "timestamp">) => {
    const newEntry: ActivityEntry = {
      ...entry,
      id: `act-${Date.now()}`,
      timestamp: Date.now(),
    }
    setActivity((prev) => {
      const next = [newEntry, ...prev].slice(0, ACTIVITY_MAX)
      saveJson(ACTIVITY_KEY, next)
      return next
    })
  }, [])

  // Log a sync event when lastSyncAt changes
  useEffect(() => {
    if (lastSyncAt && activeWorkspaceId) {
      const ws = workspaces.find((w) => w.id === activeWorkspaceId)
      appendActivity({
        type: "sync",
        workspaceId: activeWorkspaceId,
        workspaceName: ws?.name ?? "workspace",
        message: `Synced ${workspaces.length} workspace(s)`,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastSyncAt])

  // Fetch workspaces from server
  const fetchWorkspaces = useCallback(async () => {
    if (!serverUrl) {
      setError("Set a server URL first (use Join workspace)")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${serverUrl}/api/workspaces`, {
        credentials: "include",
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setWorkspaces(data.workspaces ?? [])
      appendActivity({
        type: "sync",
        workspaceId: "all",
        workspaceName: "—",
        message: `Fetched ${data.workspaces?.length ?? 0} workspace(s) from server`,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch workspaces")
    } finally {
      setLoading(false)
    }
  }, [serverUrl, appendActivity])

  // Auto-fetch on mount + when serverUrl changes
  useEffect(() => {
    if (serverUrl) fetchWorkspaces()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl])

  const activateWorkspace = (id: string) => {
    setWorkspace(id)
    setEnabled(true)
    const ws = workspaces.find((w) => w.id === id)
    if (ws) {
      appendActivity({
        type: "join",
        workspaceId: id,
        workspaceName: ws.name,
        message: `Switched to ${ws.name}`,
      })
    }
  }

  const acceptInvitation = (inv: Invitation) => {
    // Move invitation to joined
    setInvitations((prev) => {
      const next = prev.filter((i) => i.id !== inv.id)
      saveJson(INVITATIONS_KEY, next)
      return next
    })
    appendActivity({
      type: "join",
      workspaceId: inv.id,
      workspaceName: inv.workspaceName,
      message: `Accepted invitation to ${inv.workspaceName}`,
    })
  }

  const declineInvitation = (inv: Invitation) => {
    setInvitations((prev) => {
      const next = prev.filter((i) => i.id !== inv.id)
      saveJson(INVITATIONS_KEY, next)
      return next
    })
  }

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts
    if (diff < 60_000) return "just now"
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    return `${Math.floor(diff / 86_400_000)}d ago`
  }

  return (
    <div className="flex min-h-screen bg-background">
      <ApiSidebar activePage="workspaces" collapsed={isCollapsed} onCollapse={toggleSidebar} />
      <div className={cn(
        "flex flex-1 flex-col overflow-hidden transition-[margin] duration-200 ease-out",
        isCollapsed ? "ml-[60px]" : "ml-64",
        "max-[916px]:ml-[60px]"
      )}>
        <ApiHeader />
        <main className="flex-1 overflow-auto p-6" data-testid="workspaces-page">
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Users className="w-6 h-6 text-green-500" />
                <h1 className="text-2xl font-bold">Workspaces</h1>
              </div>
              <div className="flex items-center gap-2">
                <WorkspaceJoinDialog />
                <WorkspaceCreateDialog />
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950 border border-red-200 rounded text-sm text-red-700 dark:text-red-300" data-testid="error-banner">
                {error}
              </div>
            )}

            {!serverUrl && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  Set a server URL via <strong>Join workspace</strong> to fetch your workspaces.
                </CardContent>
              </Card>
            )}

            {/* My workspaces */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>My Workspaces ({workspaces.length})</span>
                  <Button size="sm" variant="ghost" onClick={fetchWorkspaces} disabled={loading || !serverUrl} data-testid="refresh-workspaces">
                    {loading ? "Refreshing..." : "Refresh"}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {workspaces.length === 0 && serverUrl && !loading && (
                  <p className="text-sm text-muted-foreground">
                    No workspaces yet. Click <strong>+ New workspace</strong> to create one.
                  </p>
                )}
                {workspaces.map((ws) => {
                  const isActive = ws.id === activeWorkspaceId
                  return (
                    <div
                      key={ws.id}
                      className={`flex items-center justify-between p-3 border rounded-md ${isActive ? "border-primary bg-primary/5" : ""}`}
                      data-testid={`workspace-card-${ws.id}`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{ws.name}</span>
                          {isActive && <Badge variant="default" data-testid="active-badge">Active</Badge>}
                          <Badge variant="outline">{ws.role}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Created {formatTime(ws.createdAt)} · Updated {formatTime(ws.updatedAt)}
                          {isActive && syncEnabled && lastSyncAt && (
                            <> · Last sync {formatTime(lastSyncAt)}</>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isActive && syncEnabled ? (
                          <WorkspaceInviteDialog
                            workspaceId={ws.id}
                            workspaceName={ws.name}
                          />
                        ) : (
                          <Button
                            size="sm"
                            variant={isActive ? "outline" : "default"}
                            onClick={() => activateWorkspace(ws.id)}
                            data-testid={`activate-button-${ws.id}`}
                          >
                            {isActive ? "Active" : "Activate"}
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            </Card>

            {/* Pending invitations */}
            {invitations.length > 0 && (
              <Card data-testid="pending-invitations-section">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Pending Invitations ({invitations.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {invitations.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between p-3 border rounded-md">
                      <div>
                        <div className="text-sm font-medium">{inv.workspaceName}</div>
                        <div className="text-xs text-muted-foreground">
                          From {inv.inviter} · Expires {formatTime(inv.expiresAt)}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => acceptInvitation(inv)} data-testid={`accept-invitation-${inv.id}`}>
                          Accept
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => declineInvitation(inv)} data-testid={`decline-invitation-${inv.id}`}>
                          Decline
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Activity feed */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Recent Activity
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {activity.length === 0 && (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
                )}
                {activity.slice(0, 10).map((entry) => (
                  <div key={entry.id} className="flex items-center gap-2 text-sm py-1" data-testid={`activity-entry-${entry.id}`}>
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="flex-1">
                      <span className="font-medium">{entry.workspaceName}</span> — {entry.message}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatTime(entry.timestamp)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  )
}
