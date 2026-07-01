"use client"

import { useState, useEffect, useMemo } from "react"
import { GitCompare, Copy, Check, ArrowLeftRight, LayoutPanelLeft, Minus, Plus, Search } from "lucide-react"
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
import { DiffViewer } from "@/components/diff-viewer"
import type { HistoryItem } from "@/lib/types"
import { Badge } from "@/components/ui/badge"

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
  const historyWithResponses = history.filter(
    (item) => item.responseBody && item.responseBody !== currentResponse
  )

  const [leftId, setLeftId] = useState<string>("")
  const [rightId, setRightId] = useState<string>("")
  const [viewMode, setViewMode] = useState<"unified" | "split">("unified")
  const [copiedLeft, setCopiedLeft] = useState(false)
  const [copiedRight, setCopiedRight] = useState(false)

  useEffect(() => {
    if (open) {
      if (currentResponse) {
        setLeftId("__current__")
      }
      const mostRecent = historyWithResponses[0]
      if (mostRecent) {
        setRightId(mostRecent.id)
      }
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const leftOptions = [
    ...(currentResponse
      ? [
          {
            id: "__current__",
            label: "Current response",
            status: currentResponseStatus,
            responseBody: currentResponse,
            time: null,
            method: null,
            url: null,
          },
        ]
      : []),
    ...historyWithResponses.map((item) => ({
      id: item.id,
      label: `${item.method} ${item.url}`,
      status: item.responseStatus,
      responseBody: typeof item.responseBody === "string" ? item.responseBody : "",
      time: new Date(item.executedAt).toLocaleTimeString(),
      method: item.method,
      url: item.url,
    })),
  ]

  const rightOptions = historyWithResponses.map((item) => ({
    id: item.id,
    label: `${item.method} ${item.url}`,
    status: item.responseStatus,
    responseBody: typeof item.responseBody === "string" ? item.responseBody : "",
    time: new Date(item.executedAt).toLocaleTimeString(),
    method: item.method,
    url: item.url,
  }))

  const getLeftContent = () => {
    if (leftId === "__current__") return currentResponse ?? ""
    const item = history.find((h) => h.id === leftId)
    return item ? (typeof item.responseBody === "string" ? item.responseBody : "") : ""
  }

  const getRightContent = () => {
    const item = history.find((h) => h.id === rightId)
    return item ? (typeof item.responseBody === "string" ? item.responseBody : "") : ""
  }

  const leftMeta = leftOptions.find((o) => o.id === leftId)
  const rightMeta = rightOptions.find((o) => o.id === rightId)

  const handleCopy = (side: "left" | "right") => {
    const content = side === "left" ? getLeftContent() : getRightContent()
    navigator.clipboard?.writeText(content)
    if (side === "left") {
      setCopiedLeft(true)
      setTimeout(() => setCopiedLeft(false), 1500)
    } else {
      setCopiedRight(true)
      setTimeout(() => setCopiedRight(false), 1500)
    }
  }

  const handleSwap = () => {
    const tmp = leftId
    setLeftId(rightId)
    setRightId(tmp)
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setLeftId("")
      setRightId("")
    }
    onOpenChange(newOpen)
  }

  const statusColor = (status?: number | null) => {
    if (!status) return "bg-muted text-muted-foreground"
    if (status < 300) return "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
    if (status < 400) return "bg-blue-500/15 text-blue-600 border-blue-500/30"
    if (status < 500) return "bg-amber-500/15 text-amber-600 border-amber-500/30"
    return "bg-red-500/15 text-red-600 border-red-500/30"
  }

  const hasSelection = leftId && rightId
  const leftContent = getLeftContent()
  const rightContent = getRightContent()

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="!max-w-[85vw] !w-[85vw] h-[92vh] flex flex-col p-0 gap-0 overflow-hidden rounded-2xl border-border">
        {/* ── Header ──────────────────────────────────────────── */}
        <DialogHeader className="px-6 py-4 border-b border-border bg-card shrink-0">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
                <GitCompare className="size-4 text-primary" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">Response Diff</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Compare two API responses side by side
                </DialogDescription>
              </div>
            </div>

            {/* View mode toggle */}
            <div className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/40 p-1">
              <button
                onClick={() => setViewMode("unified")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                  viewMode === "unified"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Search className="size-3" />
                Unified
              </button>
              <button
                onClick={() => setViewMode("split")}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                  viewMode === "split"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <LayoutPanelLeft className="size-3" />
                Split
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* ── Selector row ─────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-muted/10 shrink-0">
          {/* Left selector */}
          <div className="flex flex-1 flex-col gap-1.5 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="flex size-5 items-center justify-center rounded-full bg-red-500/15 text-[10px] font-bold text-red-500">L</span>
              <span className="text-xs font-medium text-muted-foreground">Base</span>
              {leftMeta?.status && (
                <Badge
                  variant="outline"
                  className={cn("h-4 px-1.5 text-[10px] font-semibold border", statusColor(leftMeta.status))}
                >
                  {leftMeta.status}
                </Badge>
              )}
              {leftMeta?.time && (
                <span className="text-[10px] text-muted-foreground/60 ml-auto">{leftMeta.time}</span>
              )}
            </div>
            <Select value={leftId} onValueChange={setLeftId}>
              <SelectTrigger className="h-8 text-xs border-red-500/20 focus:ring-red-500/20 bg-red-500/5">
                <SelectValue placeholder="Select base response..." />
              </SelectTrigger>
              <SelectContent>
                {leftOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id} className="text-xs">
                    <div className="flex items-center gap-2">
                      {opt.status && (
                        <span className={cn("rounded px-1 py-0.5 text-[10px] font-bold border", statusColor(opt.status))}>
                          {opt.status}
                        </span>
                      )}
                      <span className="truncate">{opt.label}</span>
                      {opt.time && <span className="text-muted-foreground/50">{opt.time}</span>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Swap button */}
          <button
            onClick={handleSwap}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
            title="Swap sides"
          >
            <ArrowLeftRight className="size-3.5" />
          </button>

          {/* Right selector */}
          <div className="flex flex-1 flex-col gap-1.5 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500/15 text-[10px] font-bold text-emerald-500">R</span>
              <span className="text-xs font-medium text-muted-foreground">Compare</span>
              {rightMeta?.status && (
                <Badge
                  variant="outline"
                  className={cn("h-4 px-1.5 text-[10px] font-semibold border", statusColor(rightMeta.status))}
                >
                  {rightMeta.status}
                </Badge>
              )}
              {rightMeta?.time && (
                <span className="text-[10px] text-muted-foreground/60 ml-auto">{rightMeta.time}</span>
              )}
            </div>
            <Select value={rightId} onValueChange={setRightId}>
              <SelectTrigger className="h-8 text-xs border-emerald-500/20 focus:ring-emerald-500/20 bg-emerald-500/5">
                <SelectValue placeholder="Select response to compare..." />
              </SelectTrigger>
              <SelectContent>
                {rightOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id} className="text-xs">
                    <div className="flex items-center gap-2">
                      {opt.status && (
                        <span className={cn("rounded px-1 py-0.5 text-[10px] font-bold border", statusColor(opt.status))}>
                          {opt.status}
                        </span>
                      )}
                      <span className="truncate">{opt.label}</span>
                      {opt.time && <span className="text-muted-foreground/50">{opt.time}</span>}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ── Diff content ─────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {hasSelection ? (
            <DiffViewer
              left={leftContent}
              right={rightContent}
              leftLabel={leftMeta?.label ?? "Left"}
              rightLabel={rightMeta?.label ?? "Right"}
              leftStatus={leftMeta?.status ?? undefined}
              rightStatus={rightMeta?.status ?? undefined}
              viewMode={viewMode}
              onCopyLeft={() => handleCopy("left")}
              onCopyRight={() => handleCopy("right")}
              copiedLeft={copiedLeft}
              copiedRight={copiedRight}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/40 border border-border">
                <GitCompare className="size-7 text-muted-foreground/40" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground/80">Select two responses to compare</p>
                <p className="mt-1 text-xs text-muted-foreground/60 max-w-[260px]">
                  Choose a base and a comparison response from the dropdowns above to visualize the diff.
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}