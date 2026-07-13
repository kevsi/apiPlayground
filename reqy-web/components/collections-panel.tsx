"use client"

import { useState, useRef, useMemo } from "react"
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
  SlidersHorizontal,
  ArrowUpDown,
} from "lucide-react"
import { methodSubtle, methodBadge, methodBg } from "@/lib/http-method-colors"
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
import { collectionColors, collectionIcons, safeColor } from "@/lib/collection-utils"
import { DeleteConfirmDialog, type PendingDelete } from "@/components/collections-delete-dialog"
import { CollectionsEmptyState } from "@/components/collections-empty-state"
import { SearchFilterBar } from "@/components/collections-search-bar"
import { SelectionToolbar } from "@/components/collections-selection-toolbar"
import { CollectionRow } from "@/components/collection-row"

export type NewCollectionInput = {
  name?: string
  color?: string
  icon?: string
}

export type NewRequestInput = Omit<RequestItem, "id" | "createdAt" | "updatedAt">

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

  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(new Set())
  const [editingCollectionId, setEditingCollectionId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [methodFilter, setMethodFilter] = useState<Set<HttpMethod>>(new Set())
  const [sortBy, setSortBy] = useState<"name" | "updated" | "requests">("name")
  const [showFilters, setShowFilters] = useState(false)
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
      } else if (dataObj.collections && Array.isArray(dataObj.collections)) {
        dataObj.collections.forEach((c) => processCollection(c as Parameters<typeof processCollection>[0]))
        toast({ title: `${dataObj.collections.length} collections importées`, meta: { event: "importExport" } } as unknown as Parameters<typeof toast>[0])
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

  const allSelected = collections.length > 0 && selectedCollectionIds.size === collections.length

  const toggleSelectAll = () => {
    if (allSelected) {
      clearSelection()
    } else {
      setSelectedCollectionIds(new Set(collections.map((c) => c.id)))
    }
  }

  const toggleMethodFilter = (method: HttpMethod) => {
    setMethodFilter((prev) => {
      const next = new Set(prev)
      if (next.has(method)) next.delete(method)
      else next.add(method)
      return next
    })
  }

  // --- Bulk actions ---
  const bulkExport = async () => {
    setExporting(true)
    const isTauri = !!(window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ || !!(window as unknown as Record<string, unknown>).__TAURI__

    const cols = collections.filter((c) => selectedCollectionIds.has(c.id))

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
  const sortedCollections = useMemo(() => {
    const list = [...collections]
    if (sortBy === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name))
    } else if (sortBy === "updated") {
      list.sort((a, b) => b.updatedAt - a.updatedAt)
    } else if (sortBy === "requests") {
      list.sort((a, b) => b.requests.length - a.requests.length)
    }
    return list
  }, [collections, sortBy])

  const filteredCollections = sortedCollections
    .map((collection) => ({
      ...collection,
      requests: collection.requests.filter(
        (req) => {
          if (methodFilter.size > 0 && !methodFilter.has(req.method)) return false
          if (!searchQuery) return true
          return (
            (req.name ?? "").toLowerCase().includes(searchLower) ||
            (req.endpoint ?? "").toLowerCase().includes(searchLower) ||
            (req.url ?? "").toLowerCase().includes(searchLower) ||
            (req.method ?? "").toLowerCase().includes(searchLower)
          )
        }
      ),
    }))
    .filter(
      (collection) => {
        if (!searchQuery && methodFilter.size === 0) return true
        if (searchQuery && collection.name.toLowerCase().includes(searchLower)) return true
        if (collection.requests.length > 0) return true
        if (searchQuery && collection.folders?.some((f) =>
          f.name.toLowerCase().includes(searchLower)
        )) return true
        if (methodFilter.size > 0) {
          const originalCollection = collections.find((c) => c.id === collection.id)
          if (originalCollection?.requests.some((r) => methodFilter.has(r.method))) return true
        }
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

      {/* Search + Filters */}
      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        allSelected={allSelected}
        onToggleSelectAll={toggleSelectAll}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(!showFilters)}
        methodFilter={methodFilter}
        onToggleMethodFilter={toggleMethodFilter}
        sortBy={sortBy}
        onSortChange={(sort) => setSortBy(sort)}
      />

      {/* Selection toolbar */}
      <SelectionToolbar
        selectedCollectionCount={selectedCollectionIds.size}
        selectedRequestCount={selectedRequestIds.size}
        exporting={exporting}
        onClear={clearSelection}
        onBulkExport={bulkExport}
        onBulkDelete={bulkDelete}
      />

      {/* Collections content */}
      <div data-testid="collection-list" className="flex-1 overflow-y-auto">
        <div className="divide-y divide-border/40">
          {filteredCollections.map((collection) => (
            <CollectionRow
              key={collection.id}
              collection={collection}
              isExpanded={expandedCollections.has(collection.id)}
              isSelected={selectedCollectionIds.has(collection.id)}
              editingCollectionId={editingCollectionId}
              renameValue={renameValue}
              selectedRequestIds={selectedRequestIds}
              onToggleExpand={toggleCollection}
              onToggleSelect={toggleSelectCollection}
              onToggleSelectRequest={toggleSelectRequest}
              onSelectRequest={onSelectRequest}
              onSelectAndSendRequest={onSelectAndSendRequest}
              onRenameStart={(id, name) => { setEditingCollectionId(id); setRenameValue(name) }}
              onRenameConfirm={(id) => { onRenameCollection(id, renameValue.trim() || collections.find(c => c.id === id)?.name || ""); setEditingCollectionId(null) }}
              onRenameChange={setRenameValue}
              onRenameCancel={() => setEditingCollectionId(null)}
              onAddRequest={onAddRequestToCollection}
              onExportCollection={exportCollection}
              onDuplicateCollection={onDuplicateCollection}
              onRunCollection={onRunCollection}
              onConfirmDelete={confirmDelete}
              onDeleteCollection={onDeleteCollection}
              onRemoveRequest={onRemoveRequestFromCollection}
            />
          ))}
        </div>

        {filteredCollections.length === 0 && (
          <CollectionsEmptyState
            searchQuery={searchQuery}
            onCreateCollection={() => onAddCollection()}
          />
        )}
      </div>

      {/* Delete confirmation modal */}
      <DeleteConfirmDialog
        pendingDelete={pendingDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}
