"use client"

import { useState, useRef } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  MoreHorizontal,
  Plus,
  Lock,
  Users,
  Package,
  Trash2,
  Edit2,
  Search,
  Download,
  LayoutGrid,
  List,
  CheckSquare,
  Square,
  X,
  Layers,
  Import,
  Play,
  Copy,
  GripVertical,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import type { Collection, CollectionFolder, RequestItem, HttpMethod } from "@/hooks/use-request-store"
import { requestItemSchema } from "@/lib/import-schemas"
import { CollectionsFolderTree } from "@/components/collections-folder-tree"

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
}

const methodBadgeColors: Record<HttpMethod, string> = {
  GET: "bg-emerald-500 text-white",
  POST: "bg-blue-500 text-white",
  PUT: "bg-amber-500 text-white",
  PATCH: "bg-purple-500 text-white",
  DELETE: "bg-red-500 text-white",
  HEAD: "bg-slate-500 text-white",
  OPTIONS: "bg-slate-500 text-white",
}

const collectionColors: Record<string, string> = {
  emerald: "bg-emerald-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  purple: "bg-purple-500",
  red: "bg-red-500",
  pink: "bg-pink-500",
}

const collectionBorderColors: Record<string, string> = {
  emerald: "border-emerald-500/40",
  blue: "border-blue-500/40",
  amber: "border-amber-500/40",
  purple: "border-purple-500/40",
  red: "border-red-500/40",
  pink: "border-pink-500/40",
}

const collectionIcons: Record<string, React.ReactNode> = {
  lock: <Lock className="size-3 text-white" />,
  users: <Users className="size-3 text-white" />,
  package: <Package className="size-3 text-white" />,
}


type ViewMode = "list" | "card"

interface CollectionsPanelProps {
  collections: Collection[]
  onSelectRequest: (request: RequestItem) => void
  onSelectAndSendRequest?: (request: RequestItem) => void
  onRunCollection?: (collection: Collection) => void

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
}

export function CollectionsPanel({
  collections,
  onSelectRequest,
  onSelectAndSendRequest,
  onRunCollection,
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
}: CollectionsPanelProps) {

  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(
    new Set(collections.map((c) => c.id))
  )
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("list")
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [collectionDetail, setCollectionDetail] = useState<Collection | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const listContainerRef = useRef<HTMLDivElement>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const dragOverIdRef = useRef<string | null>(null)

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

  // Selection state
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<string>>(new Set())
  const [selectedRequestIds, setSelectedRequestIds] = useState<Set<string>>(new Set()) // "colId::reqId"

  const isSelecting = selectedCollectionIds.size > 0 || selectedRequestIds.size > 0

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

  const selectAllCollections = () => {
    setSelectedCollectionIds(new Set(filteredCollections.map((c) => c.id)))
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

  // Virtualizer for the list view — fixed row height ~88px
  const rowVirtualizer = useVirtualizer({
    count: filteredCollections.length,
    getScrollElement: () => listContainerRef.current,
    estimateSize: () => 88,
    overscan: 5,
  })

  const totalSelected = selectedCollectionIds.size + selectedRequestIds.size

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
          {/* View toggle — pill style */}
          <div className="flex items-center rounded-lg border border-border/40 bg-muted/30 p-0.5 mr-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("list")}
              className={cn("h-6 w-6 p-0 rounded-md transition-all", viewMode === "list" && "bg-background shadow-xs")}
              title="Vue liste"
            >
              <List className="size-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setViewMode("card")}
              className={cn("h-6 w-6 p-0 rounded-md transition-all", viewMode === "card" && "bg-background shadow-xs")}
              title="Vue carte"
            >
              <LayoutGrid className="size-3" />
            </Button>
          </div>
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

      {/* Selection toolbar */}
      {isSelecting && (
        <div className="flex items-center gap-1.5 border-b border-border/60 bg-primary/[0.03] px-4 py-2 shrink-0 animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="flex size-5 items-center justify-center rounded bg-primary/10">
              <CheckSquare className="size-3 text-primary" />
            </span>
            <span className="text-xs font-semibold text-foreground/80">
              {totalSelected} selected
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs font-medium"
              onClick={selectAllCollections}
            >
              <Layers className="size-3" />
              All
            </Button>
            <div className="mx-0.5 h-4 w-px bg-border/50" />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs font-medium text-primary hover:text-primary"
              onClick={bulkExport}
              disabled={exporting}
            >
              {exporting ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
              {exporting ? "Export..." : "Export"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2.5 text-xs font-medium text-destructive hover:text-destructive"
              onClick={bulkDelete}
            >
              <Trash2 className="size-3" />
              Delete
            </Button>
            <div className="mx-0.5 h-4 w-px bg-border/50" />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={clearSelection}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Collections content */}
      <div ref={listContainerRef} className="flex-1 overflow-y-auto hide-scrollbar p-2" style={{ maxHeight: "60vh" }}>
        {viewMode === "list" ? (
          // ── LIST VIEW ──────────────────────────────────────────────────
          <div
            className="space-y-1 relative"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const collection = filteredCollections[virtualItem.index]
              const isExpanded = expandedCollections.has(collection.id)
              const isSelected = selectedCollectionIds.has(collection.id)
              const accentColor = collectionBorderColors[collection.color]?.replace("border-", "bg-").replace("/40", "") || "bg-muted-foreground/20"

              return (
                <div
                  key={collection.id}
                  data-index={virtualItem.index}
                  ref={rowVirtualizer.measureElement}
                  className={cn(
                    "rounded-xl transition-all duration-200 absolute top-0 left-0 w-full",
                    isSelected && "bg-primary/[0.04] ring-1 ring-primary/20",
                    dragId === collection.id && "opacity-40 scale-[0.98]"
                  )}
                  style={{
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  draggable={!!onReorderCollections}
                  onDragStart={(e) => {
                    setDragId(collection.id)
                    e.dataTransfer.effectAllowed = "move"
                    e.dataTransfer.setData("text/plain", collection.id)
                  }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = "move"
                    dragOverIdRef.current = collection.id
                  }}
                  onDragEnd={() => {
                    const targetId = dragOverIdRef.current
                    const draggedId = collection.id
                    if (draggedId && targetId && onReorderCollections && draggedId !== targetId) {
                      const ids = collections.map((c) => c.id)
                      const fromIdx = ids.indexOf(draggedId)
                      const toIdx = ids.indexOf(targetId)
                      if (fromIdx !== -1 && toIdx !== -1) {
                        ids.splice(fromIdx, 1)
                        ids.splice(toIdx, 0, draggedId)
                        onReorderCollections(ids)
                      }
                    }
                    setDragId(null)
                    dragOverIdRef.current = null
                  }}
                >
                  {/* Collection row — premium card header */}
                  <div className={cn(
                    "group relative flex items-center gap-1.5 rounded-xl px-2.5 py-2.5 transition-all duration-200",
                    "bg-card border shadow-xs",
                    isExpanded && "rounded-b-none border-b-0 shadow-none",
                    isSelected && "border-primary/35 shadow-primary/5",
                    !isExpanded && "hover:shadow-sm hover:border-border/80",
                    isExpanded && "bg-muted/20"
                  )}>
                    {/* Left accent bar — thicker, rounded */}
                    <span className={cn(
                      "absolute left-0 top-1 bottom-1 w-[4px] rounded-r-full transition-all duration-200",
                      accentColor,
                      isSelected && "opacity-100",
                      !isSelected && "opacity-60 group-hover:opacity-100"
                    )} />

                    {/* Drag handle — always visible but subtle */}
                    {onReorderCollections && (
                      <div className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground/50 transition-colors duration-200">
                        <GripVertical className="size-4" />
                      </div>
                    )}

                    {/* Checkbox */}
                    <button
                      onClick={() => toggleSelectCollection(collection.id)}
                      className={cn(
                        "shrink-0 flex items-center justify-center transition-all duration-150",
                        isSelected
                        ? "text-primary"
                        : "text-muted-foreground/40 hover:text-muted-foreground/60"
                      )}
                    >
                      {isSelected ? (
                        <span className="flex size-5 items-center justify-center rounded bg-primary/10">
                          <CheckSquare className="size-3.5 text-primary" />
                        </span>
                      ) : (
                        <Square className="size-3.5" />
                      )}
                    </button>

                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleCollection(collection.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCollection(collection.id) } }}
                      className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                    >
                      {/* Chevron — subtle animation */}
                      <div className="shrink-0 transition-transform duration-200 text-muted-foreground/50 group-hover:text-muted-foreground/70">
                        {isExpanded ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5" />
                        )}
                      </div>

                      {/* Collection icon */}
                      <span
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-lg shadow-xs ring-1 ring-black/5",
                          collectionColors[collection.color]
                        )}
                      >
                        {collectionIcons[collection.icon] || <Package className="size-3 text-white" />}
                      </span>

                      {editingCollectionId === collection.id ? (
                        <div className="flex w-full items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <Input
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                onRenameCollection(collection.id, renameValue.trim() || collection.name)
                                setEditingCollectionId(null)
                              }
                              if (event.key === "Escape") setEditingCollectionId(null)
                            }}
                            autoFocus
                            className="h-7 text-sm"
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              onRenameCollection(collection.id, renameValue.trim() || collection.name)
                              setEditingCollectionId(null)
                            }}
                            className="h-7 px-2 text-xs font-semibold text-primary"
                          >
                            OK
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate text-sm font-semibold text-foreground/90 group-hover:text-foreground transition-colors">
                            {collection.name}
                          </span>
                          <span className="shrink-0 text-[10px] font-semibold text-muted-foreground/60 bg-muted/30 px-1.5 py-0.5 rounded-full leading-none">
                            {collection.requests.length}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Quick actions bar */}
                    <div className="flex items-center gap-0.5">
                      {onSelectAndSendRequest && collection.requests.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); onRunCollection?.(collection) }}
                          className="size-7 p-0 text-muted-foreground/30 hover:text-emerald-500 hover:bg-emerald-500/10 opacity-0 group-hover:opacity-100 transition-all duration-200"
                          title="Run all"
                        >
                          <Play className="size-3.5" />
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-7 p-0 text-muted-foreground/30 hover:text-foreground hover:bg-accent opacity-0 group-hover:opacity-100 transition-all duration-200"
                          >
                            <MoreHorizontal className="size-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem onClick={() => onAddRequestToCollection(collection.id)}>
                            <Plus className="mr-2 size-3.5" /> Add Request
                          </DropdownMenuItem>
                          {onRunCollection && (
                            <DropdownMenuItem onClick={() => onRunCollection(collection)}>
                              <Play className="mr-2 size-3.5" /> Run collection
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => {
                              setEditingCollectionId(collection.id)
                              setRenameValue(collection.name)
                            }}
                          >
                            <Edit2 className="mr-2 size-3.5" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportCollection(collection)}>
                            <Download className="mr-2 size-3.5" /> Export JSON
                          </DropdownMenuItem>
                          {onDuplicateCollection && (
                            <DropdownMenuItem onClick={() => onDuplicateCollection(collection.id)}>
                              <Copy className="mr-2 size-3.5" /> Duplicate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => onDeleteCollection(collection.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 size-3.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Expanded content — nested container with inset feel */}
                  {isExpanded && (
                    <div className={cn(
                      "rounded-b-xl border border-t-0 shadow-xs bg-muted/[0.03] pb-2 overflow-hidden transition-all duration-200",
                      isSelected
                        ? "border-primary/20"
                        : "border-border/40"
                    )}>
                      <div className="pt-0.5">
                        <CollectionsFolderTree
                          collection={collection}
                          folders={collection.folders ?? []}
                          requests={collection.requests}
                          selectedRequestIds={selectedRequestIds}
                          onToggleSelectRequest={toggleSelectRequest}
                          onSelectRequest={onSelectRequest}
                          onSelectAndSendRequest={onSelectAndSendRequest}
                          onRemoveRequestFromCollection={onRemoveRequestFromCollection}
                          onAddFolder={onAddFolder ?? (() => "")}
                          onRenameFolder={onRenameFolder ?? (() => {})}
                          onDeleteFolder={onDeleteFolder ?? (() => {})}
                          onMoveRequestToFolder={onMoveRequestToFolder ?? (() => {})}
                          onMoveFolder={onMoveFolder}
                          onReorderRequests={onReorderRequestsInCollection}
                          onReorderFolders={onReorderFolders}
                          confirmDelete={confirmDelete}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          // ── CARD VIEW ──────────────────────────────────────────────────
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 p-1">
            {filteredCollections.map((collection) => {
              const isSelected = selectedCollectionIds.has(collection.id)
              const accentColor = collectionBorderColors[collection.color]?.replace("/40", "/30") || ""
              return (
                <div
                  key={collection.id}
                  className={cn(
                    "group relative flex flex-col items-center rounded-xl border p-3 transition-all duration-200 cursor-default gap-2.5 bg-card",
                    isSelected
                      ? "border-primary/40 bg-primary/[0.04] shadow-sm shadow-primary/15 ring-1 ring-primary/20"
                      : cn(
                          "hover:shadow-md hover:border-border/80",
                          accentColor && `border-l-[3px] ${accentColor}`
                        )
                  )}
                >
                  {/* Top accent strip for selected state */}
                  {isSelected && (
                    <span className="absolute top-0 left-0 right-0 h-[3px] rounded-t-xl bg-primary/60" />
                  )}

                  {/* Checkbox */}
                  <button
                    onClick={() => toggleSelectCollection(collection.id)}
                    className={cn(
                      "absolute top-2.5 left-2.5 z-10 transition-all duration-150",
                      isSelected
                        ? "text-primary"
                        : "text-muted-foreground/30 hover:text-muted-foreground/60"
                    )}
                  >
                    {isSelected ? (
                      <span className="flex size-4 items-center justify-center rounded bg-primary/10">
                        <CheckSquare className="size-3 text-primary" />
                      </span>
                    ) : (
                      <Square className="size-3 opacity-30 group-hover:opacity-100 transition-opacity" />
                    )}
                  </button>

                  {/* Menu */}
                  <div className="absolute top-2 right-2 z-10">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="size-6 p-0 text-muted-foreground/30 hover:text-foreground hover:bg-accent opacity-0 group-hover:opacity-100 transition-all duration-200">
                          <MoreHorizontal className="size-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => onAddRequestToCollection(collection.id)}>
                          <Plus className="mr-2 size-3.5" /> Add Request
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setEditingCollectionId(collection.id); setRenameValue(collection.name) }}>
                          <Edit2 className="mr-2 size-3.5" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportCollection(collection)}>
                          <Download className="mr-2 size-3.5" /> Export JSON
                        </DropdownMenuItem>
                        {onDuplicateCollection && (
                          <DropdownMenuItem onClick={() => onDuplicateCollection(collection.id)}>
                            <Copy className="mr-2 size-3.5" /> Duplicate
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => confirmDelete(`Supprimer "${collection.name}" ?`, () => onDeleteCollection(collection.id))} className="text-destructive">
                          <Trash2 className="mr-2 size-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Clickable card body → opens detail modal */}
                  <button
                    className="flex flex-col items-center gap-2 w-full pt-1.5"
                    onClick={() => setCollectionDetail(collection)}
                  >
                    <span className={cn(
                      "flex size-9 items-center justify-center rounded-xl shadow-xs ring-1 ring-black/5 transition-transform duration-200 group-hover:scale-105",
                      collectionColors[collection.color]
                    )}>
                      {collectionIcons[collection.icon] || <Package className="size-4 text-white" />}
                    </span>
                    {editingCollectionId === collection.id ? (
                      <div onClick={(e) => e.stopPropagation()} className="w-full px-1">
                        <Input
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter") { onRenameCollection(collection.id, renameValue.trim() || collection.name); setEditingCollectionId(null) }
                            if (ev.key === "Escape") setEditingCollectionId(null)
                          }}
                          autoFocus
                          className="h-6 text-center text-xs"
                        />
                      </div>
                    ) : (
                      <span className="text-center text-xs font-semibold text-foreground/90 leading-tight line-clamp-2 px-1">
                        {collection.name}
                      </span>
                    )}
                    <span className={cn(
                      "text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground/70 border border-border/30"
                    )}>
                      {collection.requests.length} {collection.requests.length === 1 ? "request" : "requests"}
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        )}

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

      {/* ── Collection detail modal (card click) ── */}
      {collectionDetail && (
        <Dialog open onOpenChange={(open) => !open && setCollectionDetail(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <span className={cn("flex size-7 items-center justify-center rounded-lg shadow-xs", collectionColors[collectionDetail.color])}>
                  {collectionIcons[collectionDetail.icon] || <Package className="size-3.5 text-white" />}
                </span>
                <span className="truncate text-base">{collectionDetail.name}</span>
                <span className="ml-auto shrink-0 text-xs font-medium text-muted-foreground/60 bg-muted/50 px-2 py-0.5 rounded-full">
                  {collectionDetail.requests.length} request{collectionDetail.requests.length !== 1 ? "s" : ""}
                </span>
              </DialogTitle>
            </DialogHeader>

            <div className="max-h-72 overflow-y-auto space-y-0.5 py-1 px-px">
              {collectionDetail.requests.length === 0 && (
                <div className="flex flex-col items-center py-8 text-center">
                  <div className="rounded-full bg-muted/20 p-3 mb-2">
                    <Package className="size-6 text-muted-foreground/20" />
                  </div>
                  <p className="text-sm text-muted-foreground/60">No requests in this collection</p>
                </div>
              )}
              {collectionDetail.requests.map((req) => {
                const reqKey = `${collectionDetail.id}::${req.id}`
                const isReqSelected = selectedRequestIds.has(reqKey)
                return (
                  <div
                    key={req.id}
                    className={cn(
                      "group flex items-center gap-2 rounded-lg px-3 py-2 transition-all duration-150",
                      "hover:bg-accent/60 hover:shadow-xs",
                      isReqSelected && "bg-primary/[0.04] ring-1 ring-primary/20"
                    )}
                  >
                    <button onClick={() => toggleSelectRequest(collectionDetail.id, req.id)} className="shrink-0 flex items-center justify-center">
                      {isReqSelected
                        ? <span className="flex size-4 items-center justify-center rounded bg-primary/10"><CheckSquare className="size-3 text-primary" /></span>
                        : <Square className="size-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/60 transition-colors" />}
                    </button>
                    <button
                      className="flex flex-1 items-center gap-2.5 min-w-0 text-left"
                      onClick={() => { onSelectRequest(req); setCollectionDetail(null) }}
                    >
                      <span className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide text-white shadow-xs", methodBadgeColors[req.method])}>
                        {req.method}
                      </span>
                      <span className="truncate text-sm font-medium text-foreground/90 group-hover:text-foreground transition-colors">{req.name}</span>
                      <span className="ml-auto shrink-0 truncate text-xs text-muted-foreground/50 max-w-[140px] font-mono">{req.endpoint}</span>
                    </button>
                    {onSelectAndSendRequest && (
                      <Button
                        variant="ghost" size="sm"
                        className="size-6 p-0 text-emerald-500 opacity-0 group-hover:opacity-100 hover:text-emerald-500 hover:bg-emerald-500/10 transition-all duration-150"
                        title="Load & Send"
                        onClick={() => { onSelectAndSendRequest(req); setCollectionDetail(null) }}
                      >
                        <Play className="size-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="sm"
                      className="size-6 p-0 text-muted-foreground/30 hover:text-destructive opacity-0 group-hover:opacity-100 transition-all duration-150"
                      onClick={() => confirmDelete(
                        `Remove "${req.name}" from "${collectionDetail.name}"?`,
                        () => { onRemoveRequestFromCollection(collectionDetail.id, req.id); setCollectionDetail(null) }
                      )}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                )
              })}
            </div>

            {onRunCollection && (
              <div className="flex items-center justify-between border-t border-border/60 px-4 py-3 bg-muted/10">
                <span className="text-xs text-muted-foreground/60">Run all requests sequentially</span>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 text-xs font-medium gap-1.5"
                  onClick={() => {
                    onRunCollection(collectionDetail)
                    setCollectionDetail(null)
                  }}
                >
                  <Play className="size-3" />
                  Run collection
                </Button>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setCollectionDetail(null)} className="text-xs">Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

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
