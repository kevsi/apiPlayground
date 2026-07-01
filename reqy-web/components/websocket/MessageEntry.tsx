"use client"

import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { WsMessage } from "@/types/websocket"

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}.${d.getMilliseconds().toString().padStart(3, "0")}`
}

function formatJson(raw: string): { formatted: string; isValid: boolean } {
  try {
    const parsed = JSON.parse(raw)
    return { formatted: JSON.stringify(parsed, null, 2), isValid: true }
  } catch {
    return { formatted: raw, isValid: false }
  }
}

interface MessageEntryProps {
  message: WsMessage
}

export function MessageEntry({ message }: MessageEntryProps) {
  const [expanded, setExpanded] = useState(false)
  const isSent = message.direction === "sent"
  const { formatted, isValid } = formatJson(message.content)
  const showExpand = isValid && message.content.length > 80

  return (
    <div
      className={cn(
        "group/message flex flex-col gap-1 rounded-lg border p-3 transition-all duration-200 cursor-pointer",
        isSent
          ? "border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10"
          : "border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10"
      )}
      onClick={() => showExpand && setExpanded((e) => !e)}
      title={`${message.byteSize} bytes`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "text-xs font-bold font-mono px-1.5 py-0",
              isSent
                ? "border-blue-500/30 text-blue-500 bg-blue-500/10"
                : "border-emerald-500/30 text-emerald-500 bg-emerald-500/10"
            )}
          >
            {isSent ? "\u2191" : "\u2193"}
          </Badge>
          <span className="text-xs font-mono text-muted-foreground/50">
            {formatTimestamp(message.timestamp)}
          </span>
          <span className="text-[11px] font-mono text-muted-foreground/30">
            {message.byteSize} B
          </span>
        </div>
      </div>
      <pre
        className={cn(
          "text-xs font-mono leading-relaxed text-foreground whitespace-pre-wrap break-all",
          !expanded && showExpand && "line-clamp-3"
        )}
      >
        {formatted}
      </pre>
      {showExpand && (
        <button
          onClick={(e) => { e.stopPropagation(); setExpanded((e) => !e) }}
          className="text-xs font-medium text-muted-foreground/50 hover:text-foreground self-start mt-0.5"
        >
          {expanded ? "Collapse" : "Expand"}
        </button>
      )}
    </div>
  )
}
