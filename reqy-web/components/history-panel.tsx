"use client"

import { useState } from "react"
import { Clock, Trash2, Search, RotateCcw, CheckCircle2, XCircle, AlertCircle, Sparkles, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { HistoryItem, HttpMethod } from "@/hooks/use-request-store"

const methodColors: Record<HttpMethod, string> = {
  GET: "bg-emerald-500/20 text-emerald-600 border-emerald-500/30",
  POST: "bg-blue-500/20 text-blue-600 border-blue-500/30",
  PUT: "bg-amber-500/20 text-amber-600 border-amber-500/30",
  PATCH: "bg-purple-500/20 text-purple-600 border-purple-500/30",
  DELETE: "bg-red-500/20 text-red-600 border-red-500/30",
  HEAD: "bg-slate-500/20 text-slate-600 border-slate-500/30",
  OPTIONS: "bg-slate-500/20 text-slate-600 border-slate-500/30",
  GRAPHQL: "bg-pink-500/20 text-pink-600 border-pink-500/30",
}

interface HistoryPanelProps {
  history: HistoryItem[]
  onSelectRequest: (item: HistoryItem) => void
  onClearHistory: () => void
  onRemoveItem: (id: string) => void
  onGenerateFollowUp?: (item: HistoryItem) => void
  generatingFollowUpId?: string | null
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return "Just now"
}

function getStatusIcon(status?: number) {
  if (!status) return <Clock className="size-3.5 text-muted-foreground" />
  if (status >= 200 && status < 300) return <CheckCircle2 className="size-3.5 text-emerald-500" />
  if (status >= 400 && status < 500) return <XCircle className="size-3.5 text-amber-500" />
  if (status >= 500) return <AlertCircle className="size-3.5 text-red-500" />
  return <Clock className="size-3.5 text-muted-foreground" />
}

function getStatusColor(status?: number) {
  if (!status) return "text-muted-foreground"
  if (status >= 200 && status < 300) return "text-emerald-500"
  if (status >= 400 && status < 500) return "text-amber-500"
  if (status >= 500) return "text-red-500"
  return "text-muted-foreground"
}

export function HistoryPanel({
  history,
  onSelectRequest,
  onClearHistory,
  onRemoveItem,
  onGenerateFollowUp,
  generatingFollowUpId,
}: HistoryPanelProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [methodFilter, setMethodFilter] = useState<HttpMethod[]>([])
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const ALL_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]

  const toggleMethodFilter = (method: HttpMethod) => {
    setMethodFilter((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]
    )
  }

  const filteredHistory = history.filter((item) => {
    // Text search
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const matchesSearch =
        item.name.toLowerCase().includes(q) ||
        item.endpoint.toLowerCase().includes(q) ||
        item.method.toLowerCase().includes(q) ||
        String(item.responseStatus || "").includes(q)
      if (!matchesSearch) return false
    }

    // Method filter
    if (methodFilter.length > 0 && !methodFilter.includes(item.method)) return false

    // Status filter
    if (statusFilter) {
      const s = item.responseStatus
      if (statusFilter === "2xx" && (!s || s < 200 || s >= 300)) return false
      if (statusFilter === "4xx" && (!s || s < 400 || s >= 500)) return false
      if (statusFilter === "5xx" && (!s || s < 500)) return false
      if (statusFilter === "error" && (s && s < 400)) return false
    }

    return true
  })

  // Pagination
  const PAGE_SIZE = 50
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const paginatedHistory = filteredHistory.slice(0, visibleCount)
  const hasMore = visibleCount < filteredHistory.length

  // Group by date
  const groupedHistory = paginatedHistory.reduce((acc, item) => {
    const date = new Date(item.executedAt)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - today.getDay())

    let key: string
    if (date.toDateString() === today.toDateString()) {
      key = "Today"
    } else if (date.toDateString() === yesterday.toDateString()) {
      key = "Yesterday"
    } else if (date >= startOfWeek) {
      key = "This Week"
    } else {
      key = date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    }

    if (!acc[key]) acc[key] = []
    acc[key].push(item)
    return acc
  }, {} as Record<string, HistoryItem[]>)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">History</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowClearConfirm(true)}
          className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
          Clear
        </Button>
      </div>

      {/* Search + Filters */}
      <div className="border-b border-border p-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, URL, method, status..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>

        {/* Method filter chips */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {ALL_METHODS.map((method) => {
            const active = methodFilter.includes(method)
            return (
              <button
                key={method}
                onClick={() => toggleMethodFilter(method)}
                className={cn(
                  "h-6 rounded px-2 text-[10px] font-bold border transition-colors",
                  active
                    ? methodColors[method]
                    : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                )}
              >
                {method}
              </button>
            )
          })}

          <span className="w-px h-4 bg-border mx-1" />

          {/* Status filter chips */}
          {[
            { label: "2xx", value: "2xx" },
            { label: "4xx", value: "4xx" },
            { label: "5xx", value: "5xx" },
            { label: "Errors", value: "error" },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(statusFilter === f.value ? "" : f.value)}
              className={cn(
                "h-6 rounded px-2 text-[10px] font-medium border transition-colors",
                statusFilter === f.value
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}

          {/* Clear all filters */}
          {(methodFilter.length > 0 || statusFilter || searchQuery) && (
            <button
              onClick={() => { setMethodFilter([]); setStatusFilter(""); setSearchQuery("") }}
              className="h-6 rounded px-2 text-[10px] font-medium text-muted-foreground hover:text-destructive transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-y-auto hide-scrollbar p-2">
        {Object.entries(groupedHistory).map(([date, items]) => (
          <div key={date} className="mb-4">
            <h4 className="mb-2 px-2 text-xs font-medium text-muted-foreground">
              {date}
            </h4>
            <div className="space-y-0.5">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-accent"
                >
                  <button
                    onClick={() => onSelectRequest(item)}
                    className="flex flex-1 items-center gap-2"
                  >
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-5 shrink-0 px-1.5 text-[10px] font-bold",
                        methodColors[item.method]
                      )}
                    >
                      {item.method}
                    </Badge>
                    <div className="flex flex-1 flex-col items-start overflow-hidden">
                      <span className="w-full truncate text-left text-sm text-foreground">
                        {item.name}
                      </span>
                      <span className="w-full truncate text-left text-xs text-muted-foreground">
                        {item.endpoint}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {getStatusIcon(item.responseStatus)}
                      <span className={cn("text-xs font-medium", getStatusColor(item.responseStatus))}>
                        {item.responseStatus || "-"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(item.executedAt)}
                      </span>
                    </div>
                  </button>
                  <div className="hidden shrink-0 items-center gap-1 group-hover:flex">
                    {onGenerateFollowUp && item.responseBody && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onGenerateFollowUp(item)}
                        disabled={generatingFollowUpId === item.id}
                        className="size-6 p-0"
                        title="Générer une requête de suivi (IA)"
                      >
                        {generatingFollowUpId === item.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Sparkles className="size-3 text-primary" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSelectRequest(item)}
                      className="size-6 p-0"
                      title="Replay request"
                    >
                      <RotateCcw className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveItem(item.id)}
                      className="size-6 p-0 text-muted-foreground hover:text-destructive"
                      title="Remove from history"
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {hasMore && (
          <div className="flex justify-center py-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
              className="h-8 gap-1.5 text-xs font-medium"
            >
              Load more ({filteredHistory.length - visibleCount} remaining)
            </Button>
          </div>
        )}

        {filteredHistory.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full bg-muted/30 p-3 mb-2">
              <Clock className="size-8 text-muted-foreground/30" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {searchQuery ? "No matching requests" : "No history yet"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {searchQuery ? "Try a different search or clear filters" : "Run a request to see it here"}
            </p>
            {!searchQuery && (
              <p className="text-xs text-muted-foreground/60 mt-2 max-w-[220px]">
                Requests you execute will appear here for quick replay
              </p>
            )}
          </div>
        )}
      </div>

        <Dialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Clear all history?</DialogTitle>
              <DialogDescription>
                This action cannot be undone. All request history will be permanently removed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" size="sm" onClick={() => setShowClearConfirm(false)}>Cancel</Button>
              <Button
                variant="default"
                size="sm"
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  onClearHistory()
                  setShowClearConfirm(false)
                }}
              >
                Clear
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  )
}
