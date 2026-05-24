"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CollectionsPanel, type NewCollectionInput, type NewRequestInput } from "@/components/collections-panel"
import type { Collection, RequestItem } from "@/hooks/use-request-store"

interface CollectionsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  collections: Collection[]
  onSelectRequest: (request: RequestItem) => void
  onSelectAndSendRequest?: (request: RequestItem) => void
  onRunCollection?: (collection: Collection) => void
  onRunCollectionBackground?: (collection: Collection) => void
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
  onSelectAndSendRequest,
  onRunCollection,
  onRunCollectionBackground,
  onAddCollection,
  onDeleteCollection,
  onRenameCollection,
  onAddRequestToCollection,
  onRemoveRequestFromCollection,
}: CollectionsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[85vh] p-0 gap-0 flex flex-col">
        <DialogHeader className="border-b px-6 py-4 shrink-0">
          <DialogTitle>Collections</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden">
          <CollectionsPanel
            collections={collections}
            onSelectRequest={(request) => {
              onSelectRequest(request)
              onOpenChange(false)
            }}
            onSelectAndSendRequest={onSelectAndSendRequest ? ((request) => {
              onSelectAndSendRequest(request)
              onOpenChange(false)
            }) : undefined}
            onRunCollection={onRunCollection ? ((collection) => {
              onRunCollection(collection)
              onOpenChange(false)
            }) : undefined}
            onRunCollectionBackground={onRunCollectionBackground ? ((collection) => {
              onRunCollectionBackground(collection)
              onOpenChange(false)
            }) : undefined}
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
