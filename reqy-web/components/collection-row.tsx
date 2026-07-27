"use client";

import React, { useMemo } from "react";
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
  FolderPlus,
} from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Collection, RequestItem } from "@/hooks/request-types";
import { collectionColors, collectionIcons, safeColor } from "@/lib/collection-utils";
import type { PendingDelete } from "@/components/collections-delete-dialog";
import { DraggableRequestRow } from "@/components/drag-and-drop/draggable-request-row";
import { collectionDropId, requestId } from "@/hooks/use-request-dnd";
import { CollectionsFolderTree } from "@/components/collections-folder-tree";

interface CollectionRowProps {
  collection: Collection;
  isExpanded: boolean;
  isSelected: boolean;
  editingCollectionId: string | null;
  renameValue: string;
  selectedRequestIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onToggleSelectRequest: (colId: string, reqId: string) => void;
  onSelectRequest: (req: RequestItem) => void;
  onSelectAndSendRequest?: (req: RequestItem) => void;
  onRenameStart: (id: string, currentName: string) => void;
  onRenameConfirm: (id: string) => void;
  onRenameChange: (value: string) => void;
  onRenameCancel: () => void;
  onAddRequest: (collectionId: string) => void;
  onExportCollection: (collection: Collection) => void;
  onDuplicateCollection?: (id: string) => void;
  onRunCollection?: (collection: Collection) => void;
  onConfirmDelete: (label: string, onConfirm: () => void) => void;
  onDeleteCollection: (id: string) => void;
  onRemoveRequest: (collectionId: string, requestId: string) => void;
  // Folder callbacks
  onAddFolder?: (collectionId: string, name: string, parentId: string | null) => string;
  onRenameFolder?: (collectionId: string, folderId: string, name: string) => void;
  onDeleteFolder?: (collectionId: string, folderId: string) => void;
  onMoveRequestToFolder?: (collectionId: string, requestId: string, folderId: string | null) => void;
  onMoveFolder?: (collectionId: string, folderId: string, newParentId: string | null) => void;
  onReorderRequestsInCollection?: (collectionId: string, folderId: string | null, orderedRequestIds: string[]) => void;
  onReorderFolders?: (collectionId: string, parentFolderId: string | null, orderedFolderIds: string[]) => void;
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
  onAddFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveRequestToFolder,
  onMoveFolder,
  onReorderRequestsInCollection,
  onReorderFolders,
}: CollectionRowProps) {
  // ── Droppable for cross-collection moves ──
  const { setNodeRef: dropRef, isOver } = useDroppable({
    id: collectionDropId(collection.id),
    data: { type: "collection" as const, collectionId: collection.id },
  });

  const hasFolders = (collection.folders ?? []).length > 0;

  // Sortable request IDs (only for flat mode — folder tree handles its own DnD)
  const flatRequestIds = collection.requests.map((r) => requestId(r.id));

  // Uncategorized requests (used when folders exist)
  const uncategorizedRequests = useMemo(
    () => collection.requests.filter((r) => !r.folderId),
    [collection.requests],
  );

  return (
    <div ref={dropRef} className={cn(isOver && "bg-primary/[0.04]")}>
      {/* ── Collection header ── */}
      <div className={cn("flex items-center gap-3 px-3 py-2.5", isSelected && "bg-primary/[0.03]")}>
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
          {isExpanded ? (
            <ChevronDown className="size-3.5" />
          ) : (
            <ChevronRight className="size-3.5" />
          )}
        </button>
        <span
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded",
            collectionColors[safeColor(collection.color)],
          )}
        >
          {collectionIcons[collection.icon] ?? <Package className="size-2.5 text-white" />}
        </span>
        {editingCollectionId === collection.id ? (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <Input
              value={renameValue}
              onChange={(e) => onRenameChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRenameConfirm(collection.id);
                if (e.key === "Escape") onRenameCancel();
              }}
              autoFocus
              className="h-7 text-sm w-48"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRenameConfirm(collection.id)}
              className="h-7 px-2 text-xs font-medium text-primary"
            >
              OK
            </Button>
          </div>
        ) : (
          <span
            className="flex-1 min-w-0 truncate text-sm font-medium text-foreground/90 cursor-pointer"
            onClick={() => onToggleExpand(collection.id)}
          >
            {collection.name}
          </span>
        )}
        <span className="shrink-0 text-xs text-muted-foreground/50 font-mono">
          {collection.requests.length} req
        </span>
        <div className="flex items-center gap-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="size-6 flex items-center justify-center rounded text-muted-foreground/30 hover:text-foreground hover:bg-accent">
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => onAddRequest(collection.id)}>
                <Plus className="mr-2 size-3.5" /> Add request
              </DropdownMenuItem>
              {onAddFolder && (
                <DropdownMenuItem onClick={() => onAddFolder!(collection.id, "New Folder", null)}>
                  <FolderPlus className="mr-2 size-3.5" /> New folder
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onRenameStart(collection.id, collection.name)}>
                <Edit2 className="mr-2 size-3.5" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onExportCollection(collection)}>
                <Download className="mr-2 size-3.5" /> Export
              </DropdownMenuItem>
              {onDuplicateCollection && (
                <DropdownMenuItem onClick={() => onDuplicateCollection(collection.id)}>
                  <Copy className="mr-2 size-3.5" /> Duplicate
                </DropdownMenuItem>
              )}
              {onRunCollection && (
                <DropdownMenuItem onClick={() => onRunCollection(collection)}>
                  <Play className="mr-2 size-3.5" /> Run all
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() =>
                  onConfirmDelete(`Delete "${collection.name}"?`, () =>
                    onDeleteCollection(collection.id),
                  )
                }
                className="text-destructive"
              >
                <Trash2 className="mr-2 size-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Expanded content ── */}
      {isExpanded && collection.requests.length > 0 && (
        <div className="border-t border-border/20">
          {hasFolders ? (
            <>
              {/* Folder tree */}
              <CollectionsFolderTree
                collection={collection}
                folders={collection.folders ?? []}
                requests={collection.requests}
                selectedRequestIds={selectedRequestIds}
                onToggleSelectRequest={onToggleSelectRequest}
                onSelectRequest={onSelectRequest}
                onSelectAndSendRequest={onSelectAndSendRequest}
                onRemoveRequestFromCollection={onRemoveRequest}
                onAddFolder={onAddFolder!}
                onRenameFolder={onRenameFolder!}
                onDeleteFolder={onDeleteFolder!}
                onMoveRequestToFolder={onMoveRequestToFolder!}
                onMoveFolder={onMoveFolder}
                onReorderRequests={
                  onReorderRequestsInCollection
                    ? (colId, folderId, orderedIds) =>
                        onReorderRequestsInCollection(colId, folderId, orderedIds)
                    : undefined
                }
                onReorderFolders={onReorderFolders}
                confirmDelete={onConfirmDelete}
              />
              {/* Uncategorized requests below the tree */}
              {uncategorizedRequests.length > 0 && (
                <div className="border-t border-border/10">
                  <SortableContext
                    items={uncategorizedRequests.map((r) => requestId(r.id))}
                    strategy={verticalListSortingStrategy}
                  >
                    {uncategorizedRequests.map((req) => (
                      <DraggableRequestRow
                        key={req.id}
                        request={req}
                        collectionId={collection.id}
                        isSelected={selectedRequestIds.has(`${collection.id}::${req.id}`)}
                        onSelect={() => onSelectRequest(req)}
                        onSend={
                          onSelectAndSendRequest
                            ? () => onSelectAndSendRequest(req)
                            : undefined
                        }
                        onRemove={() => onRemoveRequest(collection.id, req.id)}
                      />
                    ))}
                  </SortableContext>
                </div>
              )}
            </>
          ) : (
            /* Flat mode (no folders) */
            <SortableContext items={flatRequestIds} strategy={verticalListSortingStrategy}>
              {collection.requests.map((req) => (
                <DraggableRequestRow
                  key={req.id}
                  request={req}
                  collectionId={collection.id}
                  isSelected={selectedRequestIds.has(`${collection.id}::${req.id}`)}
                  onSelect={() => onSelectRequest(req)}
                  onSend={
                    onSelectAndSendRequest ? () => onSelectAndSendRequest(req) : undefined
                  }
                  onRemove={() => onRemoveRequest(collection.id, req.id)}
                />
              ))}
            </SortableContext>
          )}
        </div>
      )}
    </div>
  );
}
