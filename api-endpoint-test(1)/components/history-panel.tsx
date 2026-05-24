"use client"

import { useState } from "react"
import { Clock, Trash2, Search, RotateCcw, CheckCircle2, XCircle, AlertCircle, Sparkles, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { HistoryItem, HttpMethod } from "@/hooks/use-request-store"

const methodColors: Record<HttpMethod, string> = {
  GET: "bg-emerald-500/20 text-emerald-600 border-emerald-500/30",
  POST: "bg-blue-500/20 text-blue-600 border-blue-500/30",
  PUT: "bg-amber-500/20 text-amber-600 border-amber-500/30",
  PATCH: "bg-purple-500/20 text-purple-600 border-purple-500/30",
  DELETE: "bg-red-500/20 text-red-600 border-red-500/30",
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

  const filteredHistory = history.filter(
    (item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.endpoint.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Group by date
  const groupedHistory = filteredHistory.reduce((acc, item) => {
    const date = new Date(item.executedAt)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    let key: string
    if (date.toDateString() === today.toDateString()) {
      key = "Today"
    } else if (date.toDateString() === yesterday.toDateString()) {
      key = "Yesterday"
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
          onClick={onClearHistory}
          className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
          Clear
        </Button>
      </div>

      {/* Search */}
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search history..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
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
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
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

        {filteredHistory.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Clock className="size-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              {searchQuery ? "No matching requests" : "No history yet"}
            </p>
            <p className="text-xs text-muted-foreground">
              {searchQuery ? "Try a different search" : "Run a request to see it here"}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
