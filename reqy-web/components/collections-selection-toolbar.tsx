"use client"

import { X, Download, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface SelectionToolbarProps {
  selectedCollectionCount: number
  selectedRequestCount: number
  exporting: boolean
  onClear: () => void
  onBulkExport: () => void
  onBulkDelete: () => void
}

export function SelectionToolbar({
  selectedCollectionCount,
  selectedRequestCount,
  exporting,
  onClear,
  onBulkExport,
  onBulkDelete,
}: SelectionToolbarProps) {
  if (selectedCollectionCount === 0 && selectedRequestCount === 0) return null

  return (
    <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5 shrink-0 bg-primary/5 border-t-0">
      <span className="text-sm font-medium text-foreground/70">
        {selectedCollectionCount > 0 && `${selectedCollectionCount} collection${selectedCollectionCount > 1 ? "s" : ""}`}
        {selectedCollectionCount > 0 && selectedRequestCount > 0 && " + "}
        {selectedRequestCount > 0 && `${selectedRequestCount} requête${selectedRequestCount > 1 ? "s" : ""}`}
        {" sélectionné"}
      </span>
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-8 px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5 mr-1.5" />
          Clear
        </Button>
        <div className="w-px h-4 bg-border/40 mx-0.5" />
        <Button
          variant="ghost"
          size="sm"
          onClick={onBulkExport}
          disabled={exporting}
          className="h-8 px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {exporting ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Download className="size-3.5 mr-1.5" />}
          Export
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onBulkDelete}
          className="h-8 px-3 text-xs font-medium text-red-600 hover:text-red-600 hover:bg-red-500/10"
        >
          <Trash2 className="size-3.5 mr-1.5" />
          Delete
        </Button>
      </div>
    </div>
  )
}
