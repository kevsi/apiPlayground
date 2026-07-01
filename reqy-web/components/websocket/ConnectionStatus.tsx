"use client"

import { cn } from "@/lib/utils"

interface ConnectionStatusProps {
  status: string
  className?: string
}

const PULSE_COLORS: Record<string, string> = {
  idle: "bg-slate-400",
  connecting: "bg-amber-400 animate-pulse",
  connected: "bg-emerald-400",
  disconnecting: "bg-amber-400 animate-pulse",
  disconnected: "bg-slate-400",
  error: "bg-red-400",
}

export function ConnectionStatus({ status, className }: ConnectionStatusProps) {
  return (
    <span
      className={cn(
        "inline-block size-2 rounded-full shrink-0",
        PULSE_COLORS[status] ?? "bg-slate-400",
        className
      )}
      title={status}
    />
  )
}
