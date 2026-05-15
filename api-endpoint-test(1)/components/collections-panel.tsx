"use client"

import { useState, useRef } from "react"
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
} from "lucide-react"
import { cn, downloadJson } from "@/lib/utils"
import { invoke } from "@tauri-apps/api/core"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
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
import type { Collection, RequestItem, HttpMethod } from "@/hooks/use-request-store"

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
}

const methodBadgeColors: Record<HttpMethod, string> = {
  GET: "bg-emerald-500 text-white",
  POST: "bg-blue-500 text-white",
  PUT: "bg-amber-500 text-white",
  PATCH: "bg-purple-500 text-white",
  DELETE: "bg-red-500 text-white",
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
  onAddCollection: (data?: any) => string
  onDeleteCollection: (id: string) => void
  onRenameCollection: (id: string, name: string) => void
  onAddRequestToCollection: (collectionId: string, request?: any) => void
  onRemoveRequestFromCollection: (collectionId: string, requestId: string) => void
}

export function CollectionsPanel({
  collections,
  onSelectRequest,
  onSelectAndSendRequest,
  onAddCollection,
  onDeleteCollection,
  onRenameCollection,
  onAddRequestToCollection,
  onRemoveRequestFromCollection,
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

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const data = JSON.parse(text)
      
      const processCollection = (colData: any) => {
        const colId = onAddCollection({
          name: colData.name || "Imported Collection",
          color: colData.color || "emerald",
          icon: colData.icon || "package",
        })
        
        if (colData.requests && Array.isArray(colData.requests)) {
          colData.requests.forEach((req: any) => {
            if (onAddRequestToCollection) {
               onAddRequestToCollection(colId, req)
            }
          })
        }
      }

      if (data.type === "collection" || data.requests) {
        processCollection(data)
        toast.success(`Collection importée`)
      } else if (data.collections && Array.isArray(data.collections)) {
        data.collections.forEach(processCollection)
        toast.success(`${data.collections.length} collections importées`)
      } else {
         toast.error("Format non reconnu")
      }
      
    } catch (err) {
      toast.error("Fichier JSON invalide")
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
    const isTauri = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__

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
        const savedPath = await invoke<string>("export_json", {
          content: JSON.stringify(exportData, null, 2),
          defaultName,
        })
        toast.success(`Exporté : ${savedPath}`)
        clearSelection()
      } catch (error: any) {
        if (error === "cancelled") return
        toast.error(`Erreur export : ${String(error)}`)
        downloadJson(exportData, defaultName)
      }
    } else {
      downloadJson(exportData, defaultName)
      toast.success("Export téléchargé")
      clearSelection()
    }
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
    const isTauri = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__
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
        const savedPath = await invoke<string>("export_json", {
          content: JSON.stringify(exportData, null, 2),
          defaultName: `${safeName}_collection.json`,
        })
        toast.success(`Sauvegardé : ${savedPath}`)
      } catch (error: any) {
        if (error === "cancelled") return
        toast.error(`Erreur : ${String(error)}`)
        downloadJson(exportData, `${safeName}_collection.json`)
      }
    } else {
      downloadJson(exportData, `${safeName}_collection.json`)
    }
  }

  const filteredCollections = collections
    .map((collection) => ({
      ...collection,
      requests: collection.requests.filter(
        (req) =>
          (req.name ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
          (req.endpoint ?? "").toLowerCase().includes(searchQuery.toLowerCase())
      ),
    }))
    .filter(
      (collection) =>
        searchQuery === "" ||
        collection.requests.length > 0 ||
        collection.name.toLowerCase().includes(searchQuery.toLowerCase())
    )

  const totalSelected = selectedCollectionIds.size + selectedRequestIds.size

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3 shrink-0">
        <h3 className="text-sm font-semibold text-foreground">Collections</h3>
        <div className="flex items-center gap-1">
          {/* View toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode("list")}
            className={cn("h-7 w-7 p-0", viewMode === "list" && "bg-accent")}
            title="Vue liste"
          >
            <List className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode("card")}
            className={cn("h-7 w-7 p-0", viewMode === "card" && "bg-accent")}
            title="Vue carte"
          >
            <LayoutGrid className="size-3.5" />
          </Button>
          <div className="mx-1 h-4 w-px bg-border" />
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
            className="h-7 gap-1 px-2 text-xs"
            title="Importer JSON"
          >
            <Import className="size-3.5" />
            Import
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onAddCollection}
            className="h-7 gap-1 px-2 text-xs"
          >
            <FolderPlus className="size-3.5" />
            New
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-border p-3 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search collections & requests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      {/* Selection toolbar */}
      {isSelecting && (
        <div className="flex items-center gap-2 border-b border-border bg-accent/50 px-4 py-2 shrink-0 animate-in slide-in-from-top-2 duration-150">
          <CheckSquare className="size-4 text-primary shrink-0" />
          <span className="text-xs font-medium text-foreground flex-1">
            {totalSelected} sélectionné(s)
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={selectAllCollections}
          >
            <Layers className="size-3" />
            Tout
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-primary"
            onClick={bulkExport}
          >
            <Download className="size-3" />
            Exporter
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs text-destructive hover:text-destructive"
            onClick={bulkDelete}
          >
            <Trash2 className="size-3" />
            Supprimer
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={clearSelection}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      {/* Collections content */}
      <div className="flex-1 overflow-y-auto hide-scrollbar p-2">
        {viewMode === "list" ? (
          // ── LIST VIEW ──────────────────────────────────────────────────
          <div className="space-y-1">
            {filteredCollections.map((collection) => {
              const isExpanded = expandedCollections.has(collection.id)
              const isSelected = selectedCollectionIds.has(collection.id)

              return (
                <div
                  key={collection.id}
                  className={cn(
                    "mb-1 rounded-lg border transition-colors",
                    isSelected
                      ? "border-primary/50 bg-primary/5"
                      : "border-transparent"
                  )}
                >
                  {/* Collection row */}
                  <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleSelectCollection(collection.id)}
                      className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                    >
                      {isSelected ? (
                        <CheckSquare className="size-4 text-primary" />
                      ) : (
                        <Square className="size-4 opacity-40 group-hover:opacity-100" />
                      )}
                    </button>

                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => toggleCollection(collection.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleCollection(collection.id) } }}
                      className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                    >
                      {isExpanded ? (
                        <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                      )}
                      <span
                        className={cn(
                          "flex size-5 shrink-0 items-center justify-center rounded",
                          collectionColors[collection.color]
                        )}
                      >
                        {collectionIcons[collection.icon] || <Package className="size-3 text-white" />}
                      </span>

                      {editingCollectionId === collection.id ? (
                        <div className="flex w-full items-center gap-2" onClick={(e) => e.stopPropagation()}>
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
                            className="h-7 px-2 text-xs"
                          >
                            OK
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate text-sm font-medium text-foreground">
                            {collection.name}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            ({collection.requests.length})
                          </span>
                        </div>
                      )}
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="size-6 p-0 opacity-0 group-hover:opacity-100"
                        >
                          <MoreHorizontal className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => onAddRequestToCollection(collection.id)}>
                          <Plus className="mr-2 size-3.5" /> Add Request
                        </DropdownMenuItem>
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
                        <DropdownMenuItem
                          onClick={() => onDeleteCollection(collection.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 size-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Requests */}
                  {isExpanded && (
                    <div className="ml-8 mt-0.5 space-y-0.5 border-l border-border pl-3 pb-1">
                      {collection.requests.map((request) => {
                        const reqKey = `${collection.id}::${request.id}`
                        const isReqSelected = selectedRequestIds.has(reqKey)
                        return (
                          <div
                            key={request.id}
                            className={cn(
                              "group flex w-full items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-accent",
                              isReqSelected && "bg-primary/5"
                            )}
                          >
                            {/* Request checkbox */}
                            <button
                              onClick={() => toggleSelectRequest(collection.id, request.id)}
                              className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                            >
                              {isReqSelected ? (
                                <CheckSquare className="size-3.5 text-primary" />
                              ) : (
                                <Square className="size-3.5 opacity-40 group-hover:opacity-100" />
                              )}
                            </button>
                            <button
                              onClick={() => onSelectRequest(request)}
                              className="flex flex-1 items-center gap-2 text-left min-w-0"
                            >
                              <Badge
                                variant="outline"
                                className={cn(
                                  "h-5 shrink-0 px-1.5 text-[10px] font-bold",
                                  methodColors[request.method]
                                )}
                              >
                                {request.method}
                              </Badge>
                              <span className="truncate text-sm text-foreground">{request.name}</span>
                            </button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                confirmDelete(
                                  `Retirer "${request.name}" de "${collection.name}" ?`,
                                  () => onRemoveRequestFromCollection(collection.id, request.id)
                                )
                              }
                              className="size-6 p-0 text-destructive opacity-0 group-hover:opacity-100 hover:text-destructive"
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        )
                      })}
                      {collection.requests.length === 0 && (
                        <p className="px-2 py-2 text-xs text-muted-foreground">No requests yet</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          // ── CARD VIEW ──────────────────────────────────────────────────
          <div className="grid grid-cols-4 gap-2 p-1">
            {filteredCollections.map((collection) => {
              const isSelected = selectedCollectionIds.has(collection.id)
              return (
                <div
                  key={collection.id}
                  className={cn(
                    "group relative flex flex-col items-center rounded-xl border p-3 transition-all cursor-default gap-2",
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm shadow-primary/20"
                      : cn("hover:border-border/80 hover:shadow-md", collectionBorderColors[collection.color])
                  )}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleSelectCollection(collection.id)}
                    className="absolute top-2 left-2 text-muted-foreground hover:text-primary transition-colors z-10"
                  >
                    {isSelected ? (
                      <CheckSquare className="size-3.5 text-primary" />
                    ) : (
                      <Square className="size-3.5 opacity-0 group-hover:opacity-70" />
                    )}
                  </button>

                  {/* Menu */}
                  <div className="absolute top-1.5 right-1.5 z-10">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="size-5 p-0 opacity-0 group-hover:opacity-100">
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
                        <DropdownMenuItem onClick={() => confirmDelete(`Supprimer "${collection.name}" ?`, () => onDeleteCollection(collection.id))} className="text-destructive">
                          <Trash2 className="mr-2 size-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Clickable card body → opens detail modal */}
                  <button
                    className="flex flex-col items-center gap-1.5 w-full pt-2"
                    onClick={() => setCollectionDetail(collection)}
                  >
                    <span className={cn("flex size-8 items-center justify-center rounded-lg", collectionColors[collection.color])}>
                      {collectionIcons[collection.icon] || <Package className="size-3.5 text-white" />}
                    </span>
                    {editingCollectionId === collection.id ? (
                      <div onClick={(e) => e.stopPropagation()} className="w-full">
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
                      <span className="text-center text-xs font-semibold text-foreground leading-tight line-clamp-2">
                        {collection.name}
                      </span>
                    )}
                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", collectionColors[collection.color], "text-white opacity-90")}>
                      {collection.requests.length} req
                    </span>
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {filteredCollections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Package className="size-8 text-muted-foreground/40" />
            <p className="mt-2 text-sm text-muted-foreground">No collections found</p>
          </div>
        )}
      </div>

      {/* ── Collection detail modal (card click) ── */}
      {collectionDetail && (
        <AlertDialog open onOpenChange={(open) => !open && setCollectionDetail(null)}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <span className={cn("flex size-6 items-center justify-center rounded", collectionColors[collectionDetail.color])}>
                  {collectionIcons[collectionDetail.icon] || <Package className="size-3 text-white" />}
                </span>
                {collectionDetail.name}
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {collectionDetail.requests.length} requête{collectionDetail.requests.length !== 1 ? "s" : ""}
                </span>
              </AlertDialogTitle>
            </AlertDialogHeader>

            <div className="max-h-72 overflow-y-auto space-y-1 py-1">
              {collectionDetail.requests.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">Aucune requête dans cette collection.</p>
              )}
              {collectionDetail.requests.map((req) => {
                const reqKey = `${collectionDetail.id}::${req.id}`
                const isReqSelected = selectedRequestIds.has(reqKey)
                return (
                  <div
                    key={req.id}
                    className={cn(
                      "group flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-accent",
                      isReqSelected && "bg-primary/5"
                    )}
                  >
                    <button onClick={() => toggleSelectRequest(collectionDetail.id, req.id)} className="shrink-0">
                      {isReqSelected
                        ? <CheckSquare className="size-3.5 text-primary" />
                        : <Square className="size-3.5 text-muted-foreground opacity-40 group-hover:opacity-80" />}
                    </button>
                    <button
                      className="flex flex-1 items-center gap-2 min-w-0 text-left"
                      onClick={() => { onSelectRequest(req); setCollectionDetail(null) }}
                    >
                      <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-white", methodBadgeColors[req.method])}>
                        {req.method}
                      </span>
                      <span className="truncate text-sm font-medium text-foreground">{req.name}</span>
                      <span className="ml-auto shrink-0 truncate text-xs text-muted-foreground max-w-[140px]">{req.endpoint}</span>
                    </button>
                    {onSelectAndSendRequest && (
                      <Button
                        variant="ghost" size="sm"
                        className="size-6 p-0 text-emerald-500 opacity-0 group-hover:opacity-100 hover:text-emerald-600 hover:bg-emerald-50"
                        title="Load & Send"
                        onClick={() => { onSelectAndSendRequest(req); setCollectionDetail(null) }}
                      >
                        <Play className="size-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost" size="sm"
                      className="size-6 p-0 text-destructive opacity-0 group-hover:opacity-100"
                      onClick={() => confirmDelete(
                        `Retirer "${req.name}" de "${collectionDetail.name}" ?`,
                        () => { onRemoveRequestFromCollection(collectionDetail.id, req.id); setCollectionDetail(null) }
                      )}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                )
              })}
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>Fermer</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* ── Delete confirmation modal ── */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="size-5 text-destructive" />
              Confirmer la suppression
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.label}
              <br />
              <span className="font-medium text-foreground">Cette action est irréversible.</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                pendingDelete?.onConfirm()
                setPendingDelete(null)
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
