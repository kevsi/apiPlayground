"use client"

import {
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Package,
  Trash2,
  Edit2,
  Download,
  CheckSquare,
  Square,
  Copy,
  Play,
} from "lucide-react"
import { cn, downloadJson } from "@/lib/utils"
import { methodBadge } from "@/lib/http-method-colors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/hooks/use-toast"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Collection, RequestItem } from "@/hooks/use-request-store"
import { collectionColors, collectionIcons, safeColor } from "@/lib/collection-utils"
import type { PendingDelete } from "@/components/collections-delete-dialog"

interface RequestRowProps {
  req: RequestItem
  collectionId: string
  isReqSelected: boolean
  onToggleSelectRequest: (colId: string, reqId: string) => void
  onSelectRequest: (req: RequestItem) => void
  onSelectAndSendRequest?: (req: RequestItem) => void
  onConfirmDelete: (label: string, onConfirm: () => void) => void
  onRemoveRequest: (collectionId: string, requestId: string) => void
}

function RequestRow({
  req,
  collectionId,
  isReqSelected,
  onToggleSelectRequest,
  onSelectRequest,
  onSelectAndSendRequest,
  onConfirmDelete,
  onRemoveRequest,
}: RequestRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 py-1.5 px-3 pl-14 text-sm",
        isReqSelected && "bg-primary/[0.03]",
        "hover:bg-muted/20"
      )}
    >
      <button
        onClick={() => onToggleSelectRequest(collectionId, req.id)}
        className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground/60"
      >
        {isReqSelected ? (
          <CheckSquare className="size-3 text-primary" />
        ) : (
          <Square className="size-3" />
        )}
      </button>
      <span className={cn("shrink-0 rounded px-1 py-0.5 text-[10px] font-bold text-white", methodBadge[req.method])}>
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
        onClick={() => onConfirmDelete(`Remove "${req.name}"?`, () => onRemoveRequest(collectionId, req.id))}
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  )
}

interface CollectionRowProps {
  collection: Collection
  isExpanded: boolean
  isSelected: boolean
  editingCollectionId: string | null
  renameValue: string
  selectedRequestIds: Set<string>
  onToggleExpand: (id: string) => void
  onToggleSelect: (id: string) => void
  onToggleSelectRequest: (colId: string, reqId: string) => void
  onSelectRequest: (req: RequestItem) => void
  onSelectAndSendRequest?: (req: RequestItem) => void
  onRenameStart: (id: string, currentName: string) => void
  onRenameConfirm: (id: string) => void
  onRenameChange: (value: string) => void
  onRenameCancel: () => void
  onAddRequest: (collectionId: string) => void
  onExportCollection: (collection: Collection) => void
  onDuplicateCollection?: (id: string) => void
  onRunCollection?: (collection: Collection) => void
  onConfirmDelete: (label: string, onConfirm: () => void) => void
  onDeleteCollection: (id: string) => void
  onRemoveRequest: (collectionId: string, requestId: string) => void
}

export function CollectionRow({
  collection,
  isExpanded,
  isSelected,
  editingCollectionId,
  renameValue,
  selectedRequestIds,
  onToggleExpand,
  onToggleSelect,
  onToggleSelectRequest,
  onSelectRequest,
  onSelectAndSendRequest,
  onRenameStart,
  onRenameConfirm,
  onRenameChange,
  onRenameCancel,
  onAddRequest,
  onExportCollection,
  onDuplicateCollection,
  onRunCollection,
  onConfirmDelete,
  onDeleteCollection,
  onRemoveRequest,
}: CollectionRowProps) {
  return (
    <div>
      <div className={cn(
        "flex items-center gap-3 px-3 py-2.5",
        isSelected && "bg-primary/[0.03]"
      )}>
        <button
          onClick={() => onToggleSelect(collection.id)}
          className="shrink-0 text-muted-foreground/40 hover:text-muted-foreground/60"
        >
          {isSelected ? (
            <CheckSquare className="size-3.5 text-primary" />
          ) : (
            <Square className="size-3.5" />
          )}
        </button>
        <button
          onClick={() => onToggleExpand(collection.id)}
          className="shrink-0 text-muted-foreground/50"
        >
          {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
        <span className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded",
          collectionColors[safeColor(collection.color)]
        )}>
          {collectionIcons[collection.icon] ?? <Package className="size-2.5 text-white" />}
        </span>
        {editingCollectionId === collection.id ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Input
              value={renameValue}
              onChange={(e) => onRenameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { onRenameConfirm(collection.id) }
                if (e.key === "Escape") onRenameCancel()
              }}
              autoFocus
              className="h-7 text-sm w-48"
            />
            <Button variant="ghost" size="sm" onClick={() => onRenameConfirm(collection.id)} className="h-7 px-2 text-xs font-medium text-primary">OK</Button>
          </div>
        ) : (
          <span
            className="flex-1 min-w-0 truncate text-sm font-medium text-foreground/90 cursor-pointer"
            onClick={() => onToggleExpand(collection.id)}
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
              <DropdownMenuItem onClick={() => onAddRequest(collection.id)}><Plus className="mr-2 size-3.5" /> Add request</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onRenameStart(collection.id, collection.name)}><Edit2 className="mr-2 size-3.5" /> Rename</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExportCollection(collection)}><Download className="mr-2 size-3.5" /> Export</DropdownMenuItem>
              {onDuplicateCollection && <DropdownMenuItem onClick={() => onDuplicateCollection(collection.id)}><Copy className="mr-2 size-3.5" /> Duplicate</DropdownMenuItem>}
              {onRunCollection && <DropdownMenuItem onClick={() => onRunCollection(collection)}><Play className="mr-2 size-3.5" /> Run all</DropdownMenuItem>}
              <DropdownMenuItem onClick={() => onConfirmDelete(`Delete "${collection.name}"?`, () => onDeleteCollection(collection.id))} className="text-destructive"><Trash2 className="mr-2 size-3.5" /> Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {isExpanded && collection.requests.length > 0 && (
        <div className="border-t border-border/20">
          {collection.requests.map((req) => (
            <RequestRow
              key={req.id}
              req={req}
              collectionId={collection.id}
              isReqSelected={selectedRequestIds.has(`${collection.id}::${req.id}`)}
              onToggleSelectRequest={onToggleSelectRequest}
              onSelectRequest={onSelectRequest}
              onSelectAndSendRequest={onSelectAndSendRequest}
              onConfirmDelete={onConfirmDelete}
              onRemoveRequest={onRemoveRequest}
            />
          ))}
        </div>
      )}
    </div>
  )
}
