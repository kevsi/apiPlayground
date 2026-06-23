"use client"

import { useState, useCallback, useRef } from "react"
import { useCaptureProxy, type CapturedRequest } from "@/hooks/use-capture-proxy"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Loader2,
  Trash2,
  Play,
  Square,
  ExternalLink,
  AlertCircle,
  Network,
  Clock,
} from "lucide-react"
import { cn } from "@/lib/utils"

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const hh = d.getHours().toString().padStart(2, "0")
  const mm = d.getMinutes().toString().padStart(2, "0")
  const ss = d.getSeconds().toString().padStart(2, "0")
  return `${hh}:${mm}:${ss}`
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—"
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function statusColor(status: number | null): string {
  if (status === null) return "bg-slate-500/10 text-slate-500 border-slate-500/20"
  if (status < 200) return "bg-slate-500/10 text-slate-500 border-slate-500/20"
  if (status < 300) return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
  if (status < 400) return "bg-blue-500/10 text-blue-500 border-blue-500/20"
  if (status < 500) return "bg-amber-500/10 text-amber-500 border-amber-500/20"
  return "bg-red-500/10 text-red-500 border-red-500/20"
}

function methodColor(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "text-emerald-500"
    case "POST":
      return "text-blue-500"
    case "PUT":
      return "text-amber-500"
    case "PATCH":
      return "text-purple-500"
    case "DELETE":
      return "text-red-500"
    default:
      return "text-slate-500"
  }
}

function RequestItem({ request }: { request: CapturedRequest }) {
  const [expanded, setExpanded] = useState(false)

  const handleReplay = useCallback(() => {
    // Open the URL in a new tab
    window.open(request.url, "_blank", "noopener,noreferrer")
  }, [request.url])

  return (
    <div
      className={cn(
        "group/request flex flex-col gap-2 rounded-lg border border-border/50 p-3 transition-all duration-200",
        "hover:border-border hover:bg-muted/20"
      )}
    >
      {/* Row 1: method, URL, status, duration, actions */}
      <div className="flex items-center gap-2 min-w-0">
        <span className={cn("shrink-0 text-xs font-bold font-mono", methodColor(request.method))}>
          {request.method}
        </span>

        <span
          className="flex-1 min-w-0 truncate text-xs font-mono text-foreground/80"
          title={request.url}
        >
          {request.url}
        </span>

        {request.status !== null && (
          <Badge
            variant="outline"
            className={cn("shrink-0 text-[10px] font-bold font-mono px-1.5 py-0", statusColor(request.status))}
          >
            {request.status}
          </Badge>
        )}

        <span className="shrink-0 text-[10px] font-mono text-muted-foreground/50">
          {formatDuration(request.durationMs)}
        </span>

        <span className="shrink-0 text-[10px] font-mono text-muted-foreground/30">
          {formatTimestamp(request.timestamp)}
        </span>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover/request:opacity-100 transition-opacity duration-200">
          <button
            onClick={handleReplay}
            title="Open in new tab"
            className="flex size-6 items-center justify-center rounded text-muted-foreground/50 hover:text-foreground transition-colors duration-150"
          >
            <ExternalLink className="size-3" />
          </button>
          <button
            onClick={() => setExpanded((e) => !e)}
            title={expanded ? "Collapse" : "Expand"}
            className="flex size-6 items-center justify-center rounded text-muted-foreground/50 hover:text-foreground transition-colors duration-150"
          >
            <span className="text-[10px] font-mono">{expanded ? "▲" : "▼"}</span>
          </button>
        </div>
      </div>

      {/* Error banner */}
      {request.error && (
        <div className="flex items-center gap-1.5 rounded bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-500">
          <AlertCircle className="size-3 shrink-0" />
          {request.error}
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div className="flex flex-col gap-3 pt-1 border-t border-border/30">
          {/* Request headers */}
          {request.headers.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40">
                Request Headers
              </span>
              <div className="flex flex-col gap-0.5">
                {request.headers.map(([k, v], i) => (
                  <div key={i} className="flex gap-2 text-[10px] font-mono">
                    <span className="shrink-0 text-muted-foreground/60">{k}:</span>
                    <span className="truncate text-foreground/70">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Request body */}
          {request.body && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40">
                Request Body
              </span>
              <pre className="overflow-x-auto rounded bg-muted/30 p-2 text-[10px] font-mono leading-relaxed text-foreground/80 whitespace-pre-wrap break-all">
                {request.body}
              </pre>
            </div>
          )}

          {/* Response headers */}
          {request.responseHeaders && request.responseHeaders.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40">
                Response Headers
              </span>
              <div className="flex flex-col gap-0.5">
                {request.responseHeaders.map(([k, v], i) => (
                  <div key={i} className="flex gap-2 text-[10px] font-mono">
                    <span className="shrink-0 text-muted-foreground/60">{k}:</span>
                    <span className="truncate text-foreground/70">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Response body */}
          {request.responseBody && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/40">
                Response Body
              </span>
              <pre className="overflow-x-auto rounded bg-muted/30 p-2 text-[10px] font-mono leading-relaxed text-foreground/80 whitespace-pre-wrap break-all">
                {request.responseBody.length > 2000
                  ? request.responseBody.slice(0, 2000) + "\n... (truncated)"
                  : request.responseBody}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function CaptureProxyPanel() {
  const { isRunning, port, capturedRequests, error, start, stop, clear } =
    useCaptureProxy()
  const [portInput, setPortInput] = useState(String(port))
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)

  const handleStart = useCallback(async () => {
    const p = parseInt(portInput, 10)
    if (isNaN(p) || p < 1024 || p > 65535) return
    setStarting(true)
    try {
      await start(p)
    } finally {
      setStarting(false)
    }
  }, [portInput, start])

  const handleStop = useCallback(async () => {
    setStopping(true)
    try {
      await stop()
    } finally {
      setStopping(false)
    }
  }, [stop])

  return (
    <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
      {/* Connection Bar */}
      <div className="p-3 pb-1">
        <div className="flex items-center gap-2 rounded-lg border border-input/50 px-3 py-1.5 transition-all duration-200">
          {/* Status badge */}
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 gap-1.5 py-0.5 px-2 text-[11px] font-semibold",
              isRunning
                ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                : "bg-slate-500/10 text-slate-500 border-slate-500/20"
            )}
          >
            {starting ? (
              <Loader2 className="size-3 animate-spin" />
            ) : isRunning ? (
              <Network className="size-3" />
            ) : (
              <Network className="size-3 opacity-50" />
            )}
            {starting ? "Starting..." : isRunning ? `Running :${port}` : "Idle"}
          </Badge>

          {/* Port input */}
          <div className="relative flex-1">
            <input
              type="number"
              min={1024}
              max={65535}
              value={portInput}
              onChange={(e) => setPortInput(e.target.value)}
              disabled={isRunning}
              placeholder="8899"
              className="w-full bg-transparent px-1 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/40 outline-none disabled:opacity-50"
            />
          </div>

          {/* Start / Stop button */}
          {isRunning ? (
            <Button
              variant="outline"
              size="sm"
              disabled={stopping}
              onClick={handleStop}
              className="h-7 gap-1.5 px-3 text-xs font-semibold shrink-0 border-red-500/30 text-red-500 hover:bg-red-500/10 hover:border-red-500/50 transition-all duration-200"
            >
              {stopping ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Square className="size-3.5" />
              )}
              Stop
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={starting || !portInput.trim()}
              onClick={handleStart}
              className="h-7 gap-1.5 px-3 text-xs font-semibold shrink-0 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 hover:border-emerald-500/50 transition-all duration-200"
            >
              {starting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              Start
            </Button>
          )}

          {/* Clear button */}
          {capturedRequests.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clear}
              className="h-7 gap-1.5 px-2 text-xs font-medium text-muted-foreground/50 hover:text-destructive transition-all duration-200"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>

        {/* Proxy URL hint */}
        {isRunning && (
          <p className="mt-1.5 text-[10px] text-muted-foreground/40">
            Configure your browser or app to use HTTP proxy{" "}
            <span className="font-mono text-muted-foreground/60">127.0.0.1:{port}</span>
          </p>
        )}

        {/* Error */}
        {error && (
          <div className="mt-1.5 flex items-center gap-1.5 rounded bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-500">
            <AlertCircle className="size-3 shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Requests List */}
      <div className="flex-1 min-h-0 px-3 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
            Captured Requests
            {capturedRequests.length > 0 && (
              <span className="ml-1.5 font-mono text-muted-foreground/30">
                ({capturedRequests.length})
              </span>
            )}
          </span>
        </div>

        <ScrollArea className="flex-1 min-h-0 h-[calc(100vh-280px)] border border-border rounded-lg bg-muted/10">
          <div className="flex flex-col gap-2 p-3">
            {capturedRequests.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-xs text-muted-foreground/50">
                <Network className="size-8 mb-2 text-muted-foreground/20" />
                <span>No requests captured yet</span>
                <span className="text-[10px] text-muted-foreground/30 mt-1">
                  {isRunning
                    ? "Make HTTP requests through the proxy to see them here"
                    : "Start the proxy and configure your browser to capture requests"}
                </span>
              </div>
            )}
            {[...capturedRequests].reverse().map((req) => (
              <RequestItem key={req.id} request={req} />
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}