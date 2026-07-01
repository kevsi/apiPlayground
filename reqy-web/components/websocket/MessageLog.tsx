"use client"

import { useRef, useMemo, useCallback, useEffect } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { MessageEntry } from "./MessageEntry"
import { Wifi, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { WsMessage, WsDirection } from "@/types/websocket"

interface MessageLogProps {
  messages: WsMessage[]
  filter: "all" | "sent" | "received"
  onFilterChange: (f: "all" | "sent" | "received") => void
  onClear: () => void
}

export function MessageLog({ messages, filter, onFilterChange, onClear }: MessageLogProps) {
  const parentRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)

  const filtered = useMemo(() => {
    if (filter === "all") return messages
    return messages.filter((m) => m.direction === filter)
  }, [messages, filter])

  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 10,
  })

  // Auto-scroll to bottom when new messages arrive if already near bottom
  useEffect(() => {
    const el = parentRef.current
    if (el && isNearBottomRef.current && filtered.length > 0) {
      el.scrollTop = el.scrollHeight
    }
  }, [filtered.length])

  // Track if user is near the bottom of the scroll area
  const handleScroll = useCallback(() => {
    const el = parentRef.current
    if (!el) return
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100
  }, [])

  const totalBytes = useMemo(() => messages.reduce((s, m) => s + m.byteSize, 0), [messages])

  const handleClear = useCallback(() => {
    if (messages.length > 0) onClear()
  }, [messages.length, onClear])

  return (
    <div className="flex flex-1 min-h-0 flex-col px-3 pb-2">
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/50">
            Messages
            {messages.length > 0 && (
              <span className="ml-1.5 font-mono text-muted-foreground/30">({messages.length})</span>
            )}
          </span>
          <div className="flex items-center gap-0.5 ml-2">
            {(["all", "sent", "received"] as const).map((f) => (
              <button
                key={f}
                onClick={() => onFilterChange(f)}
                className={cn(
                  "px-1.5 py-0.5 text-xs font-medium rounded transition-colors",
                  filter === f
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground/50 hover:text-muted-foreground"
                )}
              >
                {f === "all" ? "All" : f === "sent" ? "Sent" : "Recv"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalBytes > 0 && (
            <span className="text-xs font-mono text-muted-foreground/30">
              {(totalBytes / 1024).toFixed(1)} KB
            </span>
          )}
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-6 gap-1 text-xs font-medium text-muted-foreground/50 hover:text-destructive"
            >
              <Trash2 className="size-3" />
              Clear
            </Button>
          )}
        </div>
      </div>

      <div ref={parentRef} onScroll={handleScroll} className="flex-1 min-h-0 overflow-auto border border-border rounded-lg bg-muted/10">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-xs text-muted-foreground/50">
            <Wifi className="size-8 mb-2 text-muted-foreground/20" />
            <span>{messages.length === 0 ? "Enter a WebSocket URL and click Connect to start." : "No matching messages"}</span>
          </div>
        ) : (
          <div
            className="relative w-full"
            style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
          >
            <div
              className="absolute left-0 right-0 top-0"
              style={{ transform: `translateY(${rowVirtualizer.getVirtualItems()[0]?.start ?? 0}px)` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => (
                <div
                  key={filtered[virtualRow.index].id}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className="px-3 py-1"
                >
                  <MessageEntry message={filtered[virtualRow.index]} />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
