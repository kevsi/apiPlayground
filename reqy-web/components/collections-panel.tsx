"use client"

import { useState, useRef } from "react"
import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Lock,
  Users,
  Package,
  Trash2,
  Edit2,
  Search,
  Download,
  CheckSquare,
  Square,
  X,
  Layers,
  Import,
  Play,
  Copy,
  Loader2,
} from "lucide-react"
import { cn, downloadJson } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/hooks/use-toast"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { Collection, CollectionFolder, RequestItem, HttpMethod } from "@/hooks/use-request-store"
import { requestItemSchema } from "@/lib/import-schemas"

export type NewCollectionInput = {
  name?: string
  color?: string
  icon?: string
}

export type NewRequestInput = Omit<RequestItem, "id" | "createdAt" | "updatedAt">

// Pending delete confirmation state
interface PendingDelete {
  label: string
  onConfirm: () => void
}

const methodColors: Record<HttpMethod, string> = {
  GET: "bg-emerald-500/20 text-emerald-600 border-emerald-500/30",
  POST: "bg-blue-500/20 text-blue-600 border-blue-500/30",
  PUT: "bg-amber-500/20 text-amber-600 border-amber-500/30",
  PATCH: "bg-purple-500/20 text-purple-600 border-purple-500/30",
  DELETE: "bg-red-500/20 text-red-600 border-red-500/30",
  HEAD: "bg-slate-500/20 text-slate-600 border-slate-500/30",
  OPTIONS: "bg-slate-500/20 text-slate-600 border-slate-500/30",
  GRAPHQL: "bg-pink-500/20 text-pink-600 border-pink-500/30",
}

const methodBadgeColors: Record<HttpMethod, string> = {
  GET: "bg-emerald-500 text-white",
  POST: "bg-blue-500 text-white",
  PUT: "bg-amber-500 text-white",
  PATCH: "bg-purple-500 text-white",
  DELETE: "bg-red-500 text-white",
  HEAD: "bg-slate-500 text-white",
  OPTIONS: "bg-slate-500 text-white",
  GRAPHQL: "bg-pink-500 text-white",
}

const collectionColors: Record<string, string> = {
  emerald: "bg-emerald-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  purple: "bg-purple-500",
  red: "bg-red-500",
  pink: "bg-pink-500",
}

const collectionIcons: Record<string, React.ReactNode> = {
  lock: <Lock className="size-3 text-white" />,
  users: <Users className="size-3 text-white" />,
  package: <Package className="size-3 text-white" />,
}





interface CollectionsPanelProps {
  collections: Collection[]
  onSelectRequest: (request: RequestItem) => void
  onSelectAndSendRequest?: (request: RequestItem) => void

  onAddCollection: (data?: NewCollectionInput) => string
  onDeleteCollection: (id: string) => void
  onDuplicateCollection?: (id: string) => void
  onReorderCollections?: (orderedIds: string[]) => void
  onRenameCollection: (id: string, name: string) => void
  onAddRequestToCollection: (collectionId: string, request?: NewRequestInput) => void
  onRemoveRequestFromCollection: (collectionId: string, requestId: string) => void
  // Folder operations
  onAddFolder?: (collectionId: string, name: string, parentId: string | null) => string
  onRenameFolder?: (collectionId: string, folderId: string, name: string) => void
  onDeleteFolder?: (collectionId: string, folderId: string) => void
  onMoveRequestToFolder?: (collectionId: string, requestId: string, folderId: string | null) => void
  onMoveFolder?: (collectionId: string, folderId: string, newParentId: string | null) => void
  // Reorder operations
  onReorderRequestsInCollection?: (collectionId: string, folderId: string | null, orderedRequestIds: string[]) => void
  onReorderFolders?: (collectionId: string, parentFolderId: string | null, orderedFolderIds: string[]) => void
  onRunCollection?: (collection: Collection) => void
}

export function CollectionsPanel({
  collections,
  onSelectRequest,
  onSelectAndSendRequest,
  onAddCollection,
  onDeleteCollection,
  onDuplicateCollection,
  onReorderCollections,
  onRenameCollection,
  onAddRequestToCollection,
  onRemoveRequestFromCollection,
  onAddFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveRequestToFolder,
  onMoveFolder,
  onReorderRequestsInCollection,
  onReorderFolders,
  onRunCollection,
}: CollectionsPanelProps) {

  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(
    new Set()
  )
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<string>>(new Set())
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(new Set())

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      
      const processCollection = (colData: { name?: string; color?: string; icon?: string; requests?: unknown[] }) => {
        const colId = onAddCollection({
          name: colData.name || "Imported Collection",
          color: colData.color || "emerald",
          icon: colData.icon || "package",
        })
        
        if (colData.requests && Array.isArray(colData.requests)) {
          colData.requests.forEach((req: unknown) => {
            if (onAddRequestToCollection) {
              const parsed = requestItemSchema.safeParse(req)
              if (parsed.success) {
                // Strip any persisted metadata so store generates ids/timestamps consistently.
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = parsed.data
                onAddRequestToCollection(colId, rest)
              }
            }
          })
        }
      }

      const dataObj = data as { type?: string; requests?: unknown[]; collections?: unknown[] };

      if (dataObj.type === "collection" || dataObj.requests) {
        processCollection(dataObj as Parameters<typeof processCollection>[0])
        toast({ title: `Collection importée`, meta: { event: "importExport" } } as unknown as Parameters<typeof toast>[0])
        // (reverted) previously forced reload here; UI should update reactively
      } else if (dataObj.collections && Array.isArray(dataObj.collections)) {
        dataObj.collections.forEach((c) => processCollection(c as Parameters<typeof processCollection>[0]))
        toast({ title: `${dataObj.collections.length} collections importées`, meta: { event: "importExport" } } as unknown as Parameters<typeof toast>[0])
        // (reverted) previously forced reload here; UI should update reactively
      } else {
         toast({ title: "Format non reconnu", variant: "destructive", meta: { event: "importExport" } } as unknown as Parameters<typeof toast>[0])
      }
      
    } catch {
      toast({ title: "Fichier JSON invalide", variant: "destructive", meta: { event: "importExport" } } as unknown as Parameters<typeof toast>[0])
    } finally {
      setImporting(false)
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const confirmDelete = (label: string, onConfirm: () => void) => {
    setPendingDelete({ label, onConfirm })
  }

  const toggleCollection = (id: string) => {
    setExpandedCollections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // --- Selection helpers ---
  const toggleSelectCollection = (id: string) => {
    setSelectedCollectionIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectRequest = (colId: string, reqId: string) => {
    const key = `${colId}::${reqId}`
    setSelectedRequestIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const clearSelection = () => {
    setSelectedCollectionIds(new Set())
    setSelectedRequestIds(new Set())
  }

  // --- Bulk actions ---
  const bulkExport = async () => {
    setExporting(true)
    const isTauri = !!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ || !!(window as unknown as Record<string, unknown>).__TAURI__

    // Gather selected collections
    const cols = collections.filter((c) => selectedCollectionIds.has(c.id))

    // Gather selected requests (grouped by collection)
    const reqsByCol: Record<string, RequestItem[]> = {}
    selectedRequestIds.forEach((key) => {
      const [colId, reqId] = key.split("::")
      const col = collections.find((c) => c.id === colId)
      const req = col?.requests.find((r) => r.id === reqId)
      if (req) {
        if (!reqsByCol[colId]) reqsByCol[colId] = []
        reqsByCol[colId].push(req)
      }
    })

    const exportData = {
      exportedAt: new Date().toISOString(),
      collections: [
        ...cols,
        ...Object.entries(reqsByCol)
          .filter(([colId]) => !selectedCollectionIds.has(colId))
          .map(([colId, reqs]) => {
            const col = collections.find((c) => c.id === colId)!
            return { ...col, requests: reqs }
          }),
      ],
    }

    const defaultName = cols.length === 1 && selectedRequestIds.size === 0
      ? `${cols[0].name.replace(/\s+/g, "_").toLowerCase()}_collection.json`
      : "export_selection.json"

    if (isTauri) {
      try {
        const { invoke } = await import("@tauri-apps/api/core")
        const savedPath = await invoke<string>("export_json", {
          content: JSON.stringify(exportData, null, 2),
          defaultName,
        })
        toast({ title: `Exporté : ${savedPath}`, meta: { event: "importExport" } } as unknown as Parameters<typeof toast>[0])
        clearSelection()
      } catch (error: unknown) {
        if (error === "cancelled") { setExporting(false); return }
        toast({ title: `Erreur export : ${String(error)}`, variant: "destructive", meta: { event: "importExport" } } as unknown as Parameters<typeof toast>[0])
        downloadJson(exportData, defaultName)
        setExporting(false)
      }
    } else {
      downloadJson(exportData, defaultName)
      toast({ title: "Export téléchargé", meta: { event: "importExport" } } as unknown as Parameters<typeof toast>[0])
      clearSelection()
    }
    setExporting(false)
  }

  const bulkDelete = () => {
    const colCount = selectedCollectionIds.size
    const reqCount = selectedRequestIds.size
    const msg = [
      colCount > 0 && `${colCount} collection(s)`,
      reqCount > 0 && `${reqCount} requête(s)`,
    ]
      .filter(Boolean)
      .join(" et ")

    confirmDelete(`Supprimer ${msg} ?`, () => {
      selectedCollectionIds.forEach((id) => onDeleteCollection(id))
      selectedRequestIds.forEach((key) => {
        const [colId, reqId] = key.split("::")
        onRemoveRequestFromCollection(colId, reqId)
      })
      clearSelection()
    })
  }

  // --- Single item export ---
  const exportCollection = async (collection: Collection) => {
    setExporting(true)
    const isTauri = !!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ || !!(window as unknown as Record<string, unknown>).__TAURI__
    const exportData = {
      name: collection.name,
      description: collection.description,
      requests: collection.requests,
      exportedAt: new Date().toISOString(),
      type: "collection",
    }
    const safeName = collection.name.replace(/\s+/g, "_").toLowerCase()

    if (isTauri) {
      try {
        const { invoke } = await import("@tauri-apps/api/core")
        const savedPath = await invoke<string>("export_json", {
          content: JSON.stringify(exportData, null, 2),
          defaultName: `${safeName}_collection.json`,
        })
        toast({ title: `Sauvegardé : ${savedPath}`, meta: { event: "importExport" } } as unknown as Parameters<typeof toast>[0])
      } catch (error: unknown) {
        if (error === "cancelled") { setExporting(false); return }
        toast({ title: `Erreur : ${String(error)}`, variant: "destructive", meta: { event: "importExport" } } as unknown as Parameters<typeof toast>[0])
        downloadJson(exportData, `${safeName}_collection.json`)
      }
    } else {
      downloadJson(exportData, `${safeName}_collection.json`)
    }
    setExporting(false)
  }

  const searchLower = searchQuery.toLowerCase()
  const filteredCollections = collections
    .map((collection) => ({
      ...collection,
      requests: collection.requests.filter(
        (req) =>
          (req.name ?? "").toLowerCase().includes(searchLower) ||
          (req.endpoint ?? "").toLowerCase().includes(searchLower) ||
          (req.url ?? "").toLowerCase().includes(searchLower) ||
          (req.method ?? "").toLowerCase().includes(searchLower)
      ),
    }))
    .filter(
      (collection) => {
        if (searchQuery === "") return true

        // Check collection name
        if (collection.name.toLowerCase().includes(searchLower)) return true

        // Check requests
        if (collection.requests.length > 0) return true

        // Check folder names
        if (collection.folders?.some((f) =>
          f.name.toLowerCase().includes(searchLower)
        )) return true

        // Check request count in original (before filtering) to show collections with matching folders
        const originalCollection = collections.find((c) => c.id === collection.id)
        const hasMatchingFolder = originalCollection?.folders?.some((f) =>
          f.name.toLowerCase().includes(searchLower)
        )
        if (hasMatchingFolder) return true

        return false
      }
    )

  return (
    <div className="flex h-full flex-col">
      {/* Ambient top highlight */}
      <div className="ambient-bar shrink-0" />
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
            <Layers className="size-3.5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground tracking-tight leading-none">Collections</h3>
            <p className="text-[10px] text-muted-foreground/40 leading-none mt-1">{collections.length} total</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">

          <input 
            type="file" 
            accept=".json" 
            ref={fileInputRef} 
            onChange={handleImport} 
            className="hidden" 
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="h-7 gap-1.5 px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            title="Importer JSON"
          >
            {importing ? <Loader2 className="size-3.5 animate-spin" /> : <Import className="size-3.5" />}
            {importing ? "Import..." : "Import"}
          </Button>
          <Button
            variant="default"
            size="sm"
            data-testid="new-collection-button"
            onClick={() => onAddCollection()}
            className="h-7 gap-1.5 px-2.5 text-xs font-medium shadow-xs"
          >
            <Plus className="size-3.5" />
            New
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-border/60 px-3 py-2.5 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
          <Input
            placeholder="Search collections & requests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm bg-muted/30 border-border/50 focus-visible:bg-background transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground transition-colors"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Collections content */}
      <div data-testid="collection-list" className="flex-1 overflow-y-auto">
        <div className="divide-y divide-border/40">
          {filteredCollections.map((collection) => {
            const isExpanded = expandedCollections.has(collection.id)
            const isSelected = selectedCollectionIds.has(collection.id)
            return (
              <div key={collection.id}>
                <div className={cn(
                  "flex items-center gap-3 px-3 py-2.5",
                  isSelected && "bg-primary/[0.03]"
                )}>
                  <button
                    onClick={() => toggleSelectCollection(collection.id)}
                    className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground/60"
                  >
                    {isSelected ? (
                      <CheckSquare className="size-3.5 text-primary" />
                    ) : (
                      <Square className="size-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => toggleCollection(collection.id)}
                    className="shrink-0 text-muted-foreground/50"
                  >
                    {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                  </button>
                  <span className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded",
                    collectionColors[collection.color]
                  )}>
                    {collectionIcons[collection.icon] || <Package className="size-2.5 text-white" />}
                  </span>
                  {editingCollectionId === collection.id ? (
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { onRenameCollection(collection.id, renameValue.trim() || collection.name); setEditingCollectionId(null) }
                          if (e.key === "Escape") setEditingCollectionId(null)
                        }}
                        autoFocus
                        className="h-7 text-sm w-48"
                      />
                      <Button variant="ghost" size="sm" onClick={() => { onRenameCollection(collection.id, renameValue.trim() || collection.name); setEditingCollectionId(null) }} className="h-7 px-2 text-xs font-medium text-primary">OK</Button>
                    </div>
                  ) : (
                    <span
                      className="flex-1 min-w-0 truncate text-sm font-medium text-foreground/90 cursor-pointer"
                      onClick={() => toggleCollection(collection.id)}
                    >
                      {collection.name}
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-muted-foreground/50 font-mono">{collection.requests.length} req</span>
                  <div className="flex items-center gap-0.5">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="size-6 flex items-center justify-center rounded text-muted-foreground/30 hover:text-foreground hover:bg-accent">
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => onAddRequestToCollection(collection.id)}><Plus className="mr-2 size-3.5" /> Add request</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setEditingCollectionId(collection.id); setRenameValue(collection.name) }}><Edit2 className="mr-2 size-3.5" /> Rename</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportCollection(collection)}><Download className="mr-2 size-3.5" /> Export</DropdownMenuItem>
                        {onDuplicateCollection && <DropdownMenuItem onClick={() => onDuplicateCollection(collection.id)}><Copy className="mr-2 size-3.5" /> Duplicate</DropdownMenuItem>}
                        {onRunCollection && <DropdownMenuItem onClick={() => onRunCollection(collection)}><Play className="mr-2 size-3.5" /> Run all</DropdownMenuItem>}
                        <DropdownMenuItem onClick={() => confirmDelete(`Delete "${collection.name}"?`, () => onDeleteCollection(collection.id))} className="text-destructive"><Trash2 className="mr-2 size-3.5" /> Delete</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
                {isExpanded && collection.requests.length > 0 && (
                  <div className="border-t border-border/20">
                    {collection.requests.map((req) => {
                      const reqKey = `${collection.id}::${req.id}`
                      const isReqSelected = selectedRequestIds.has(reqKey)
                      return (
                        <div
                          key={req.id}
                          className={cn(
                            "flex items-center gap-3 py-1.5 px-3 pl-14 text-sm",
                            isReqSelected && "bg-primary/[0.03]",
                            "hover:bg-muted/20"
                          )}
                        >
                          <button
                            onClick={() => toggleSelectRequest(collection.id, req.id)}
                            className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground/60"
                          >
                            {isReqSelected ? (
                              <CheckSquare className="size-3 text-primary" />
                            ) : (
                              <Square className="size-3" />
                            )}
                          </button>
                          <span className={cn("shrink-0 rounded px-1 py-0.5 text-[10px] font-bold text-white", methodBadgeColors[req.method])}>
                            {req.method}
                          </span>
                          <button
                            className="flex-1 min-w-0 text-left truncate text-foreground/80 hover:text-foreground"
                            onClick={() => onSelectRequest(req)}
                          >
                            {req.name}
                          </button>
                          {req.endpoint && (
                            <span className="shrink-0 text-xs text-muted-foreground/40 font-mono truncate max-w-[200px]">{req.endpoint}</span>
                          )}
                          {onSelectAndSendRequest && (
                            <button
                              className="shrink-0 size-5 flex items-center justify-center rounded text-emerald-500/50 hover:text-emerald-500 hover:bg-emerald-500/10"
                              onClick={() => onSelectAndSendRequest(req)}
                              title="Load & send"
                            >
                              <Play className="size-3" />
                            </button>
                          )}
                          <button
                            className="shrink-0 size-5 flex items-center justify-center rounded text-muted-foreground/30 hover:text-destructive"
                            onClick={() => confirmDelete(`Remove "${req.name}"?`, () => onRemoveRequestFromCollection(collection.id, req.id))}
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {filteredCollections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center px-6 animate-fade-in">
            <div className="rounded-2xl bg-muted/20 p-5 mb-4 ring-1 ring-border/40">
              <Package className="size-10 text-muted-foreground/20" />
            </div>
            <p className="text-sm font-semibold text-foreground/80">
              {searchQuery ? "No collections match your search" : "No collections yet"}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1.5 max-w-[240px] leading-relaxed">
              {searchQuery
                ? "Try a different search term or clear the filter"
                : "Create a collection to organize your API requests"
              }
            </p>
            {!searchQuery && (
              <Button
                variant="default"
                size="sm"
                data-testid="new-collection-button"
                onClick={() => onAddCollection()}
                className="mt-5 h-8 gap-1.5 text-xs font-medium shadow-xs"
              >
                <Plus className="size-3.5" />
                Create Collection
              </Button>
            )}
          </div>
        )}
      </div>

      {/* ── Delete confirmation modal ── */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-destructive/10">
                <Trash2 className="size-4 text-destructive" />
              </span>
              Confirm deletion
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>{pendingDelete?.label}</p>
              <p className="font-medium text-destructive/80 text-sm">This action cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-xs"
              onClick={() => {
                pendingDelete?.onConfirm()
                setPendingDelete(null)
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
