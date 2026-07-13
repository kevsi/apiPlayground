"use client"

import { Package, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"

interface EmptyStateProps {
  searchQuery: string
  onCreateCollection: () => void
}

export function CollectionsEmptyState({ searchQuery, onCreateCollection }: EmptyStateProps) {
  return (
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
          onClick={onCreateCollection}
          className="mt-5 h-8 gap-1.5 text-xs font-medium shadow-xs"
        >
          <Plus className="size-3.5" />
          Create Collection
        </Button>
      )}
    </div>
  )
}
