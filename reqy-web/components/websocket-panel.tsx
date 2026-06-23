"use client"

import { useState, useCallback, useRef } from "react"
import { useWebSocket, type WsMessage } from "@/hooks/use-websocket"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Send, Wifi, WifiOff, Loader2, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const hh = d.getHours().toString().padStart(2, "0")
  const mm = d.getMinutes().toString().padStart(2, "0")
  const ss = d.getSeconds().toString().padStart(2, "0")
  const ms = d.getMilliseconds().toString().padStart(3, "0")
  return `${hh}:${mm}:${ss}.${ms}`
}

function prettyPrintJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return raw
  }
}

function MessageItem({ message }: { message: WsMessage }) {
  const isIncoming = message.direction === "incoming"
  const formatted = prettyPrintJson(message.data)

  return (
    <div
      className={cn(
        "group/message flex flex-col gap-1 rounded-lg border p-3 transition-all duration-200",
        isIncoming
          ? "border-blue-500/20 bg-blue-500/5"
          : "border-emerald-500/20 bg-emerald-500/5"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] font-bold font-mono px-1.5 py-0",
              isIncoming
                ? "border-blue-500/30 text-blue-500 bg-blue-500/10"
                : "border-emerald-500/30 text-emerald-500 bg-emerald-500/10"
            )}
          >
            {isIncoming ? "IN" : "OUT"}
          </Badge>
          <span className="text-[10px] font-mono text-muted-foreground/50">
            {formatTimestamp(message.timestamp)}
          </span>
        </div>
      </div>
      <pre className="text-xs font-mono leading-relaxed text-foreground whitespace-pre-wrap break-all">
        {formatted}
      </pre>
    </div>
  )
}

export function WebSocketPanel() {
  const { status, messages, connect, disconnect, send, clearMessages } = useWebSocket()
  const [url, setUrl] = useState("wss://echo.websocket.org")
  const [sendInput, setSendInput] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const handleConnect = useCallback(() => {
    const trimmed = url.trim()
    if (!trimmed) return
    connect(trimmed)
  }, [url, connect])

  const handleDisconnect = useCallback(() => {
    disconnect()
  }, [disconnect])

  const handleSend = useCallback(() => {
    const trimmed = sendInput.trim()
    if (!trimmed) return
    send(trimmed)
    setSendInput("")
  }, [sendInput, send])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const statusConfig: Record<
    string,
    { label: string; className: string; icon: React.ReactNode }
  > = {
    idle: {
      label: "Idle",
      className: "bg-slate-500/10 text-slate-500 border-slate-500/20",
      icon: <Wifi className="size-3" />,
    },
    connecting: {
      label: "Connecting",
      className: "bg-amber-500/10 text-amber-500 border-amber-500/20",
      icon: <Loader2 className="size-3 animate-spin" />,
    },
    open: {
      label: "Open",
      className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
      icon: <Wifi className="size-3" />,
    },
    closed: {
      label: "Closed",
      className: "bg-slate-500/10 text-slate-500 border-slate-500/20",
      icon: <WifiOff className="size-3" />,
    },
    error: {
      label: "Error",
      className: "bg-red-500/10 text-red-500 border-red-500/20",
      icon: <WifiOff className="size-3" />,
    },
  }

  const currentStatus = statusConfig[status] ?? statusConfig.idle

  return (
    <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
      {/* Connection Bar */}
      <div className="p-3 pb-1">
        <div className="flex items-center gap-2 rounded-lg border border-input/50 px-3 py-1.5 transition-all duration-200">
          {/* Status badge */}
          <Badge
            variant="outline"
            className={cn("shrink-0 gap-1.5 py-0.5 px-2 text-[11px] font-semibold", currentStatus.className)}
          >
            {currentStatus.icon}
            {currentStatus.label}
          </Badge>

          {/* URL input */}
          <div className="relative flex-1">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="wss://echo.websocket.org"
              disabled={status === "open" || status === "connecting"}
              className="w-full bg-transparent px-1 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/40 outline-none disabled:opacity-50"
            />
          </div>

          {/* Connect / Disconnect button */}
          {status === "open" || status === "connecting" ? (
            <Button
              variant="outline"
              size="sm"
              disabled={status === "connecting"}
              onClick={handleDisconnect}
              className="h-7 gap-1.5 px-3 text-xs font-semibold shrink-0 border-red-500/30 text-red-500 hover:bg-red-500/10 hover:border-red-500/50 transition-all duration-200"
            >
              <WifiOff className="size-3.5" />
              Disconnect
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleConnect}
              disabled={!url.trim()}
              className="h-7 gap-1.5 px-3 text-xs font-semibold shrink-0 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 hover:border-emerald-500/50 transition-all duration-200"
            >
              <Wifi className="size-3.5" />
              Connect
            </Button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 min-h-0 px-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
            Messages
            {messages.length > 0 && (
              <span className="ml-1.5 font-mono text-muted-foreground/30">
                ({messages.length})
              </span>
            )}
          </span>
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearMessages}
              className="h-6 gap-1 text-[10px] font-medium text-muted-foreground/50 hover:text-destructive transition-colors duration-200"
            >
              <Trash2 className="size-3" />
              Clear
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 min-h-0 h-[calc(100vh-280px)] border border-border rounded-lg bg-muted/10">
          <div className="flex flex-col gap-2 p-3">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-xs text-muted-foreground/50">
                <Wifi className="size-8 mb-2 text-muted-foreground/20" />
                <span>No messages yet</span>
                <span className="text-[10px] text-muted-foreground/30 mt-1">
                  Connect to a WebSocket server to start
                </span>
              </div>
            )}
            {messages.map((msg) => (
              <MessageItem key={msg.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      </div>

      {/* Send Input */}
      <div className="px-3 pb-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 transition-all duration-200 focus-within:border-primary/30 focus-within:shadow-[0_0_0_2px] focus-within:shadow-primary/10">
          <Input
            type="text"
            value={sendInput}
            onChange={(e) => setSendInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Send a message..."
            disabled={status !== "open"}
            className="flex-1 h-7 border-0 bg-transparent px-0 py-0 text-sm font-mono placeholder:text-muted-foreground/30 outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50"
          />
          <Button
            size="icon"
            variant="ghost"
            disabled={status !== "open" || !sendInput.trim()}
            onClick={handleSend}
            className="size-7 shrink-0 text-muted-foreground hover:text-foreground transition-colors duration-200 disabled:opacity-50"
          >
            <Send className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}