"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Copy, Users, UserPlus, AlertCircle, Shield, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useRequestStore, type Workspace } from "@/hooks/use-request-store";

interface MemberData {
  id: string;
  name: string;
  email: string;
  role: string;
  joinedAt: number;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function WorkspacesPage() {
  const workspaces = useRequestStore((s) => s.workspaces);
  const fetchWorkspacesFromApi = useRequestStore((s) => s.fetchWorkspacesFromApi);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinInput, setJoinInput] = useState("");
  const [membersOpen, setMembersOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<MemberData[]>([]);
  const [invitation, setInvitation] = useState<{ token: string; expiresAt: number } | null>(null);
  const [workspaceName, setWorkspaceName] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [inviting, setInviting] = useState(false);

  // Load workspaces from the sync server and populate the shared store
  useEffect(() => {
    fetchWorkspacesFromApi().finally(() => setLoading(false));
  }, [fetchWorkspacesFromApi]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: workspaceName.trim() }),
      });
      if (!res.ok) throw new Error("create failed");
      // Refresh the store so header & page are in sync
      await fetchWorkspacesFromApi();
      setWorkspaceName("");
      setCreateOpen(false);
      toast({ title: "Workspace created" });
    } catch {
      toast({ title: "Failed to create workspace", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/workspaces/${encodeURIComponent(selected.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("delete failed");
      await fetchWorkspacesFromApi();
      setDeleteOpen(false);
      setSelected(null);
      toast({ title: "Workspace deleted" });
    } catch {
      toast({ title: "Failed to delete workspace", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const openMembers = async (ws: Workspace) => {
    setSelected(ws);
    setMembersOpen(true);
    try {
      const res = await fetch(`/api/workspaces/${encodeURIComponent(ws.id)}/members`);
      if (!res.ok) throw new Error("fetch failed");
      const data = await res.json();
      setMembers(data.members ?? []);
    } catch {
      toast({ title: "Failed to load members", variant: "destructive" });
    }
  };

  const openInvite = (ws: Workspace) => {
    setSelected(ws);
    setInvitation(null);
    setInviteOpen(true);
  };

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/workspaces/${encodeURIComponent(selected.id)}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("invite failed");
      const data = await res.json();
      setInvitation(data);
      toast({ title: "Invitation created" });
    } catch {
      toast({ title: "Failed to create invitation", variant: "destructive" });
    } finally {
      setInviting(false);
    }
  };

  const inviteUrl = invitation
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/join?token=${invitation.token}`
    : "";

  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="flex flex-col gap-4 border-b border-border bg-background/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Workspaces</h1>
          <p className="text-sm text-muted-foreground">
            Organize your team, share collections, and manage access.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            data-testid="join-workspace-button"
            variant="outline"
            onClick={() => setJoinOpen(true)}
          >
            <UserPlus className="mr-2 size-4" />
            Join Workspace
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 size-4" />
            New Workspace
          </Button>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            Loading workspaces...
          </div>
        ) : workspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-muted">
              <Building2 className="size-10 text-muted-foreground/40" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">No workspaces yet</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Create a workspace to start sharing collections and collaborating with your team.
            </p>
            <Button className="mt-6" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 size-4" />
              Create your first workspace
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((ws) => (
              <Card key={ws.id} className="bg-card">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Building2 className="size-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-semibold text-foreground truncate">
                          {ws.name}
                        </CardTitle>
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                            ws.role === "owner"
                              ? "bg-success/10 text-success"
                              : ws.role
                                ? "bg-warning/10 text-warning"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {ws.role === "owner" ? (
                            <>
                              <Shield className="size-3" /> Owner
                            </>
                          ) : ws.role ? (
                            ws.role
                          ) : (
                            "Local"
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Created {formatDate(ws.createdAt)}</span>
                    <span>Updated {timeAgo(ws.updatedAt)}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      onClick={() => openMembers(ws)}
                    >
                      <Users className="mr-1.5 size-3.5" />
                      Members
                    </Button>
                    {(ws.role === "owner" || (!ws.role && ws.id === "ws-personal")) && (
                      <>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="flex-1"
                          onClick={() => openInvite(ws)}
                        >
                          <UserPlus className="mr-1.5 size-3.5" />
                          Invite
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            setSelected(ws);
                            setDeleteOpen(true);
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Workspace Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Workspace</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreate} className="space-y-4">
            <Input
              placeholder="Workspace name"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              autoFocus
              maxLength={100}
            />
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!workspaceName.trim() || creating}>
                {creating ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Members Dialog */}
      <Dialog open={membersOpen} onOpenChange={setMembersOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              {selected?.name} — Members
            </DialogTitle>
          </DialogHeader>
          <div className="divide-y divide-border max-h-[60vh] overflow-auto">
            {members.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No members found.</p>
            ) : (
              members.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-4 px-1 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{m.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      m.role === "owner"
                        ? "bg-success/10 text-success"
                        : "bg-warning/10 text-warning",
                    )}
                  >
                    {m.role}
                  </span>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Invitation Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-4 text-muted-foreground" />
              Invite to {selected?.name}
            </DialogTitle>
          </DialogHeader>
          {!invitation ? (
            <form onSubmit={handleCreateInvitation} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Generate an invitation link. Anyone with the link can join this workspace as an
                editor.
              </p>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setInviteOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={inviting}>
                  {inviting ? "Generating..." : "Generate Invitation"}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground mb-1">Invitation link</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all text-xs text-foreground">{inviteUrl}</code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(inviteUrl);
                      toast({ title: "Link copied to clipboard" });
                    }}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
              </div>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <AlertCircle className="size-3.5" />
                Expires on {formatDate(invitation.expiresAt)}
              </p>
              <DialogFooter>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setInvitation(null);
                    setInviteOpen(false);
                  }}
                >
                  Done
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Join Workspace Dialog */}
      <Dialog open={joinOpen} onOpenChange={setJoinOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rejoindre un workspace</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Collez le lien d'invitation ou le jeton fourni par l'administrateur du workspace.
          </p>
          <Input
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value)}
            placeholder="https://.../join?token=abc ou jeton"
            className="h-9"
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => setJoinOpen(false)}>
              Annuler
            </Button>
            <Button
              disabled={!joinInput.trim()}
              onClick={() => {
                const raw = joinInput.trim();
                let token = raw;
                try {
                  if (raw.includes("token=")) {
                    const url = new URL(
                      raw.includes("://") ? raw : `https://x/?${raw.split("?")[1] ?? ""}`,
                    );
                    token = url.searchParams.get("token") || raw;
                  }
                } catch {
                  token = raw;
                }
                setJoinOpen(false);
                setJoinInput("");
                router.push(`/join?token=${encodeURIComponent(token)}`);
              }}
            >
              Continuer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Workspace</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete <strong>{selected?.name}</strong>? This will remove all
            members, invitations, and data associated with this workspace. This action cannot be
            undone.
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
