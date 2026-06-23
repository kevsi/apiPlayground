"use client"

import { useState, useEffect } from "react"
import { GitCompare, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DiffViewer } from "@/components/diff-viewer"
import type { HistoryItem } from "@/lib/types"

interface DiffDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  history: HistoryItem[]
  currentResponse?: string
  currentResponseStatus?: number
}

export function DiffDialog({
  open,
  onOpenChange,
  history,
  currentResponse,
  currentResponseStatus,
}: DiffDialogProps) {
  // Build a list of history items that have a responseBody
  const historyWithResponses = history.filter((item) => item.responseBody && item.responseBody !== currentResponse)

  const [leftId, setLeftId] = useState<string>("")
  const [rightId, setRightId] = useState<string>("")

  // Auto-select current response as left, and most recent history item as right
  useEffect(() => {
    if (open && historyWithResponses.length > 0) {
      // Find most recent history item (excluding current)
      const mostRecent = historyWithResponses[0]
      if (mostRecent) {
        setRightId(mostRecent.id)
      }
    }
  }, [open, historyWithResponses])

  const leftItem = history.find((h) => h.id === leftId)
  const rightItem = history.find((h) => h.id === rightId)

  // Build selectable options — exclude current response from right select
  const leftOptions = [
    // Current response as option
    ...(currentResponse ? [{
      id: "__current__",
      label: `Current response ${currentResponseStatus ? `(${currentResponseStatus})` : ""}`,
      responseBody: currentResponse,
    }] : []),
    ...historyWithResponses.map((item) => ({
      id: item.id,
      label: `${item.method} ${item.url} - ${item.responseStatus ?? "?"} (${new Date(item.executedAt).toLocaleTimeString()})`,
      responseBody: typeof item.responseBody === "string" ? item.responseBody : "",
    })),
  ]

  const rightOptions = historyWithResponses.map((item) => ({
    id: item.id,
    label: `${item.method} ${item.url} - ${item.responseStatus ?? "?"} (${new Date(item.executedAt).toLocaleTimeString()})`,
    responseBody: typeof item.responseBody === "string" ? item.responseBody : "",
  }))

  const getLeftContent = () => {
    if (leftId === "__current__") return currentResponse ?? ""
    return leftItem ? (typeof leftItem.responseBody === "string" ? leftItem.responseBody : "") : ""
  }

  const getRightContent = () => {
    return rightItem ? (typeof rightItem.responseBody === "string" ? rightItem.responseBody : "") : ""
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setLeftId("")
      setRightId("")
    }
    onOpenChange(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-6xl w-[90vw] h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <GitCompare className="size-5 text-muted-foreground" />
            <DialogTitle>Compare Responses</DialogTitle>
          </div>
          <DialogDescription className="text-xs">
            Select two responses to compare side by side with a diff view.
          </DialogDescription>
        </DialogHeader>

        {/* Selection row */}
        <div className="flex items-center gap-4 px-6 py-3 border-b border-border bg-muted/20 shrink-0">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-xs font-medium text-muted-foreground shrink-0">Left:</span>
            <Select value={leftId} onValueChange={setLeftId}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="Select left response" />
              </SelectTrigger>
              <SelectContent>
                {leftOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <GitCompare className="size-4 text-muted-foreground shrink-0" />

          <div className="flex items-center gap-2 flex-1">
            <span className="text-xs font-medium text-muted-foreground shrink-0">Right:</span>
            <Select value={rightId} onValueChange={setRightId}>
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="Select right response" />
              </SelectTrigger>
              <SelectContent>
                {rightOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Diff viewer */}
        <div className="flex-1 min-h-0">
          {leftId && rightId ? (
            <DiffViewer
              left={getLeftContent()}
              right={getRightContent()}
              leftLabel={leftOptions.find((o) => o.id === leftId)?.label.split(" - ")[0] ?? "Left"}
              rightLabel={rightOptions.find((o) => o.id === rightId)?.label.split(" - ")[0] ?? "Right"}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              Select two responses to compare
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}