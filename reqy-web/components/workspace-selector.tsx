"use client"

import { useState, useCallback } from "react"
import { Plus, Check, Folder, Globe, Lock, Zap, Cloud, Terminal, Pencil } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { useRequestStore, type Workspace } from "@/hooks/use-request-store"

const workspaceIcons: Record<string, typeof Folder> = {
  folder: Folder,
  globe: Globe,
  lock: Lock,
  zap: Zap,
  cloud: Cloud,
  terminal: Terminal,
}

const workspaceColors: Record<string, string> = {
  slate: "bg-slate-500",
  emerald: "bg-emerald-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  purple: "bg-purple-500",
  red: "bg-red-500",
}

export function WorkspaceSelector() {
  const {
    workspaces,
    activeWorkspaceId,
    addWorkspace,
    updateWorkspace,
    deleteWorkspace,
    setActiveWorkspace,
  } = useRequestStore()

  const [createOpen, setCreateOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renamingWorkspace, setRenamingWorkspace] = useState<Workspace | null>(null)
  const [newName, setNewName] = useState("")
  const [hoveredWsId, setHoveredWsId] = useState<string | null>(null)

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)

  const handleCreate = useCallback(() => {
    if (!newName.trim()) return
    addWorkspace({
      name: newName.trim(),
      description: "",
      color: "slate",
      icon: "folder",
    })
    setNewName("")
    setCreateOpen(false)
  }, [newName, addWorkspace])

  const handleRename = useCallback(() => {
    if (!renamingWorkspace || !newName.trim()) return
    updateWorkspace(renamingWorkspace.id, { name: newName.trim() })
    setRenamingWorkspace(null)
    setNewName("")
    setRenameOpen(false)
  }, [renamingWorkspace, newName, updateWorkspace])

  const openRename = useCallback((w: Workspace) => {
    setRenamingWorkspace(w)
    setNewName(w.name)
    setRenameOpen(true)
  }, [])

  const IconComponent = activeWorkspace
    ? workspaceIcons[activeWorkspace.icon] || Folder
    : Folder

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Switch workspace"
            className="group/ws flex items-center gap-2 rounded-lg border border-transparent px-2.5 py-1.5 text-sm font-medium text-foreground transition-all duration-200 hover:border-border hover:bg-accent/50"
          >
            <div className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-md",
              activeWorkspace ? workspaceColors[activeWorkspace.color] || "bg-slate-500" : "bg-slate-500"
            )}>
              <IconComponent className="size-3.5 text-white" />
            </div>
            <span className="max-w-[140px] truncate">{activeWorkspace?.name ?? "Workspace"}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[240px] animate-scale-in">
          <DropdownMenuLabel className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Workspaces
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {workspaces.map((w) => {
            const Icon = workspaceIcons[w.icon] || Folder
            const isActive = w.id === activeWorkspaceId
            return (
                <DropdownMenuItem
                  key={w.id}
                  onClick={() => setActiveWorkspace(w.id)}
                  onMouseEnter={() => setHoveredWsId(w.id)}
                  onMouseLeave={() => setHoveredWsId(null)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2",
                    isActive && "bg-primary/10 text-primary"
                  )}
                >
                  <div className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-md",
                    workspaceColors[w.color] || "bg-slate-500"
                  )}>
                    <Icon className="size-3.5 text-white" />
                  </div>
                  <span className="flex-1 truncate text-sm">{w.name}</span>
                  {isActive && <Check className="size-4 shrink-0 text-primary" />}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      openRename(w)
                    }}
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 transition-all hover:bg-accent hover:text-foreground",
                      hoveredWsId === w.id ? "opacity-100" : "opacity-0"
                    )}
                    title="Renommer"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                </DropdownMenuItem>
            )
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreateOpen(true)} className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-md border border-dashed border-border">
              <Plus className="size-3.5" />
            </div>
            <span>Nouveau workspace</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Créer un workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ws-name">Nom</Label>
              <Input
                id="ws-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Mon workspace"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={(v) => { setRenameOpen(v); if (!v) setRenamingWorkspace(null) }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Renommer le workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ws-rename">Nom</Label>
              <Input
                id="ws-rename"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRename()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRenameOpen(false); setRenamingWorkspace(null) }}>
              Annuler
            </Button>
            <Button onClick={handleRename} disabled={!newName.trim()}>
              Renommer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}