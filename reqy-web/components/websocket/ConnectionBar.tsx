"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Wifi, WifiOff, Loader2, Save } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { WsStatus } from "@/types/websocket"

interface ConnectionBarProps {
  url: string
  status: WsStatus
  connectedAt?: number
  onUrlChange: (url: string) => void
  onConnect: () => void
  onDisconnect: () => void
  onSave: () => void
}

const STATUS_CONFIG: Record<WsStatus, { label: string; className: string }> = {
  idle:         { label: "Disconnected", className: "bg-slate-500/10 text-slate-500 border-slate-500/20" },
  connecting:   { label: "Connecting",   className: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  connected:    { label: "Connected",    className: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
  disconnecting:{ label: "Disconnecting",className: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  disconnected: { label: "Disconnected", className: "bg-slate-500/10 text-slate-500 border-slate-500/20" },
  error:        { label: "Error",        className: "bg-red-500/10 text-red-500 border-red-500/20" },
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
  return `${m}:${String(s).padStart(2, "0")}`
}

export function ConnectionBar({ url, status, connectedAt, onUrlChange, onConnect, onDisconnect, onSave }: ConnectionBarProps) {
  const [urlError, setUrlError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (status === "connected") {
      timerRef.current = setInterval(() => setNow(Date.now()), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [status])

  const cfg = STATUS_CONFIG[status]

  const handleConnect = useCallback(() => {
    const trimmed = url.trim()
    if (!trimmed.startsWith("ws://") && !trimmed.startsWith("wss://")) {
      setUrlError("URL must start with ws:// or wss://")
      return
    }
    setUrlError(null)
    onConnect()
  }, [url, onConnect])

  const isBusy = status === "connecting" || status === "disconnecting"

  return (
    <div className="p-3 pb-1">
      <div className="flex items-center gap-2 rounded-lg border border-input/50 px-3 py-1.5 transition-all duration-200">
        <Badge variant="outline" className={cn("shrink-0 gap-1.5 py-0.5 px-2 text-xs font-semibold", cfg.className)}>
          {status === "connecting" || status === "disconnecting" ? (
            <Loader2 className="size-3 animate-spin" />
          ) : status === "connected" ? (
            <Wifi className="size-3" />
          ) : (
            <WifiOff className="size-3" />
          )}
          {status === "connected" && connectedAt
            ? formatDuration(now - connectedAt)
            : cfg.label}
        </Badge>

        <div className="relative flex-1">
          <input
            type="text"
            value={url}
            onChange={(e) => { onUrlChange(e.target.value); setUrlError(null) }}
            placeholder="wss://echo.websocket.org"
            disabled={status === "connected" || isBusy}
            className="w-full bg-transparent px-1 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/40 outline-none disabled:opacity-50"
          />
        </div>

        {status === "connected" || isBusy ? (
          <Button
            variant="outline"
            size="sm"
            disabled={isBusy}
            onClick={onDisconnect}
            className="h-7 gap-1.5 px-3 text-xs font-semibold shrink-0 border-red-500/30 text-red-500 hover:bg-red-500/10 hover:border-red-500/50"
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
            className="h-7 gap-1.5 px-3 text-xs font-semibold shrink-0 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 hover:border-emerald-500/50"
          >
            <Wifi className="size-3.5" />
            Connect
          </Button>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onSave}
              disabled={true}
              aria-label="Save connection"
              className="h-7 gap-1.5 px-2 text-xs font-medium text-muted-foreground/50 cursor-not-allowed opacity-50"
            >
              <Save className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">Save not implemented yet</p>
          </TooltipContent>
        </Tooltip>
      </div>
      {urlError && (
        <p className="mt-1.5 text-xs font-medium text-red-500 px-1">{urlError}</p>
      )}
    </div>
  )
}
