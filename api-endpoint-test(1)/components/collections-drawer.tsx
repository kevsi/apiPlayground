"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CollectionsPanel, type NewCollectionInput, type NewRequestInput } from "@/components/collections-panel"
import type { Collection, RequestItem } from "@/hooks/use-request-store"

interface CollectionsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  collections: Collection[]
  onSelectRequest: (request: RequestItem) => void
  onAddCollection: (data?: NewCollectionInput) => string
  onDeleteCollection: (id: string) => void
  onRenameCollection: (id: string, name: string) => void
  onAddRequestToCollection: (collectionId: string, request?: NewRequestInput) => void
  onRemoveRequestFromCollection: (collectionId: string, requestId: string) => void
}

export function CollectionsModal({
  open,
  onOpenChange,
  collections,
  onSelectRequest,
  onAddCollection,
  onDeleteCollection,
  onRenameCollection,
  onAddRequestToCollection,
  onRemoveRequestFromCollection,
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
            onRenameCollection={onRenameCollection}
            onAddRequestToCollection={onAddRequestToCollection}
            onRemoveRequestFromCollection={onRemoveRequestFromCollection}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
