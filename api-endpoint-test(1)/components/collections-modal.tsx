"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { CollectionsPanel } from "@/components/collections-panel"
import type { Collection, RequestItem } from "@/hooks/use-request-store"

interface CollectionsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  collections: Collection[]
  onSelectRequest: (request: RequestItem) => void
  onSelectAndSendRequest?: (request: RequestItem) => void
  onAddCollection: (data?: any) => string
  onDeleteCollection: (id: string) => void
  onRenameCollection: (id: string, name: string) => void
  onAddRequestToCollection: (collectionId: string, request: any) => void
  onRemoveRequestFromCollection: (collectionId: string, requestId: string) => void
}

export function CollectionsModal({
  open,
  onOpenChange,
  collections,
  onSelectRequest,
  onSelectAndSendRequest,
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
