"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CollectionsPanel, type NewCollectionInput, type NewRequestInput } from "@/components/collections-panel"
import type { Collection, RequestItem } from "@/hooks/use-request-store"

interface CollectionsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  collections: Collection[]
  onSelectRequest: (request: RequestItem) => void
  onRunCollection?: (collection: Collection) => void
  onAddCollection: (data?: NewCollectionInput) => string
  onDeleteCollection: (id: string) => void
  onDuplicateCollection?: (id: string) => void
  onReorderCollections?: (orderedIds: string[]) => void
  onRenameCollection: (id: string, name: string) => void
  onAddRequestToCollection: (collectionId: string, request?: NewRequestInput) => void
  onRemoveRequestFromCollection: (collectionId: string, requestId: string) => void
  onAddFolder?: (collectionId: string, name: string, parentId: string | null) => string
  onRenameFolder?: (collectionId: string, folderId: string, name: string) => void
  onDeleteFolder?: (collectionId: string, folderId: string) => void
  onMoveRequestToFolder?: (collectionId: string, requestId: string, folderId: string | null) => void
  onMoveFolder?: (collectionId: string, folderId: string, newParentId: string | null) => void
}

export function CollectionsModal({
  open,
  onOpenChange,
  collections,
  onSelectRequest,
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
}: CollectionsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] p-0 gap-0">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Collections</DialogTitle>
        </DialogHeader>
        <div className="overflow-auto">
          <CollectionsPanel
            collections={collections}
            onSelectRequest={(request) => {
              onSelectRequest(request)
              onOpenChange(false)
            }}
            onAddCollection={onAddCollection}
            onDeleteCollection={onDeleteCollection}
            onDuplicateCollection={onDuplicateCollection}
            onReorderCollections={onReorderCollections}
            onRenameCollection={onRenameCollection}
            onAddRequestToCollection={onAddRequestToCollection}
            onRemoveRequestFromCollection={onRemoveRequestFromCollection}
            onAddFolder={onAddFolder}
            onRenameFolder={onRenameFolder}
            onDeleteFolder={onDeleteFolder}
            onMoveRequestToFolder={onMoveRequestToFolder}
            onMoveFolder={onMoveFolder}
            onRunCollection={onRunCollection ? ((collection) => {
              onRunCollection(collection)
              onOpenChange(false)
            }) : undefined}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}