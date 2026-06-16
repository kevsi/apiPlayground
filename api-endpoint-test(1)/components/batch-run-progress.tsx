"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Loader2, CheckCircle2, XCircle, Play, StopCircle, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { Collection, RequestItem, HttpMethod } from "@/hooks/use-request-store"

interface BatchRunProgressProps {
  collection: Collection
  isOpen: boolean
  onClose: () => void
  onRunRequest: (request: RequestItem, index: number) => Promise<{ success: boolean; status?: number; time?: number; error?: string }>
}

type RequestStatus = "pending" | "running" | "success" | "error"

interface RequestRunState {
  request: RequestItem
  status: RequestStatus
  statusCode?: number
  timeMs?: number
  error?: string
}

const methodBadgeColors: Record<HttpMethod, string> = {
  GET: "bg-emerald-500 text-white",
  POST: "bg-blue-500 text-white",
  PUT: "bg-amber-500 text-white",
  PATCH: "bg-purple-500 text-white",
  DELETE: "bg-red-500 text-white",
}

export function BatchRunProgress({
  collection,
  isOpen,
  onClose,
  onRunRequest,
}: BatchRunProgressProps) {
  const [runStates, setRunStates] = useState<RequestRunState[]>(() =>
    collection.requests.map((r) => ({ request: r, status: "pending" as RequestStatus }))
  )
  const [isRunning, setIsRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [cancelled, setCancelled] = useState(false)
  const cancelledRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const total = collection.requests.length
  const completed = runStates.filter((s) => s.status === "success" || s.status === "error").length
  const successCount = runStates.filter((s) => s.status === "success").length
  const errorCount = runStates.filter((s) => s.status === "error").length
  const progress = total > 0 ? (completed / total) * 100 : 0

  const runAll = useCallback(async (requests: RequestItem[]) => {
    for (let i = 0; i < requests.length; i++) {
      if (cancelledRef.current) break

      setRunStates((prev) =>
        prev.map((s, idx) => (idx === i ? { ...s, status: "running" } : s))
      )

      if (cancelledRef.current) break

      const result = await onRunRequest(requests[i], i)

      if (cancelledRef.current) break

      setRunStates((prev) =>
        prev.map((s, idx) =>
          idx === i
            ? {
                ...s,
                status: result.success ? "success" : "error",
                statusCode: result.status,
                timeMs: result.time,
                error: result.error,
              }
            : s
        )
      )
    }

    setIsRunning(false)
    if (timerRef.current) clearInterval(timerRef.current)
  }, [onRunRequest])

  // Reset and start when dialog opens
  useEffect(() => {
    if (!isOpen) {
      const resetTimeout = window.setTimeout(() => {
        setIsRunning(false)
        cancelledRef.current = false
        setCancelled(false)
        if (timerRef.current) clearInterval(timerRef.current)
      }, 0)

      return () => window.clearTimeout(resetTimeout)
    }

    const initializeTimeout = window.setTimeout(() => {
      setRunStates(collection.requests.map((r) => ({ request: r, status: "pending" as RequestStatus })))
      setElapsed(0)
      cancelledRef.current = false
      setCancelled(false)
      timerRef.current = window.setInterval(() => {
        setElapsed((prev) => prev + 1)
      }, 1000)
      setIsRunning(true)
      void runAll(collection.requests)
    }, 0)

    return () => {
      window.clearTimeout(initializeTimeout)
      cancelledRef.current = true
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, collection.id])

  const handleCancel = () => {
    cancelledRef.current = true
    setCancelled(true)
    setIsRunning(false)
    if (timerRef.current) clearInterval(timerRef.current)
  }

  const handleClose = () => {
    cancelledRef.current = true
    setCancelled(true)
    setIsRunning(false)
    if (timerRef.current) clearInterval(timerRef.current)
    onClose()
  }

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const formatElapsed = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m > 0 ? `${m}m ${s}s` : `${s}s`
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="size-4 text-primary" />
            Batch: {collection.name}
          </DialogTitle>
        </DialogHeader>

        {/* Progress bar & summary */}
        <div className="space-y-3 px-1">
          {/* Progress bar */}
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                isRunning ? "bg-primary" : errorCount > 0 ? "bg-amber-500" : "bg-emerald-500"
              )}
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Stats row */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground">
                {completed}/{total} requests
              </span>
              {successCount > 0 && (
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="size-3.5" />
                  {successCount}
                </span>
              )}
              {errorCount > 0 && (
                <span className="flex items-center gap-1 text-red-600">
                  <XCircle className="size-3.5" />
                  {errorCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {formatElapsed(elapsed)}
              </span>
              {isRunning && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  className="h-7 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50"
                >
                  <StopCircle className="size-3.5" />
                  Cancel
                </Button>
              )}
              {!isRunning && completed > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClose}
                  className="h-7 text-xs"
                >
                  Close
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Request list */}
        <div className="flex-1 overflow-y-auto mt-3 space-y-1 border rounded-lg divide-y">
          {runStates.map((state) => (
            <div
              key={state.request.id}
              className={cn(
                "flex items-center gap-3 px-3 py-2 transition-colors",
                state.status === "running" && "bg-primary/5",
                state.status === "success" && "bg-emerald-50/50",
                state.status === "error" && "bg-red-50/50",
              )}
            >
              {/* Status icon */}
              <div className="w-5 flex justify-center">
                {state.status === "pending" && (
                  <div className="size-4 rounded-full border-2 border-muted-foreground/30" />
                )}
                {state.status === "running" && (
                  <Loader2 className="size-4 animate-spin text-primary" />
                )}
                {state.status === "success" && (
                  <CheckCircle2 className="size-4 text-emerald-500" />
                )}
                {state.status === "error" && (
                  <XCircle className="size-4 text-red-500" />
                )}
              </div>

              {/* Method badge */}
              <span
                className={cn(
                  "inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold leading-none",
                  methodBadgeColors[state.request.method]
                )}
              >
                {state.request.method}
              </span>

              {/* Name */}
              <span className={cn(
                "flex-1 truncate text-sm",
                state.status === "running" && "font-medium text-primary"
              )}>
                {state.request.name}
              </span>

              {/* Time / status */}
              {state.status === "running" && (
                <span className="text-xs text-primary animate-pulse">Sending...</span>
              )}
              {state.status === "success" && state.timeMs !== undefined && (
                <span className="text-xs text-emerald-600">
                  {state.statusCode} · {formatTime(state.timeMs)}
                </span>
              )}
              {state.status === "error" && (
                <span className="text-xs text-red-600 truncate max-w-[150px]" title={state.error}>
                  {state.error || "Error"}
                </span>
              )}
              {state.status === "pending" && (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>
          ))}
        </div>

        {/* Final summary */}
        {!isRunning && completed > 0 && (
          <div className={cn(
            "mt-3 rounded-lg border px-3 py-2 text-sm flex items-center gap-2",
            errorCount === 0
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-amber-200 bg-amber-50 text-amber-800"
          )}>
            {errorCount === 0 ? (
              <>
                <CheckCircle2 className="size-4" />
                All {total} request{total > 1 ? "s" : ""} completed successfully
                {cancelled ? " (cancelled)" : ""}
              </>
            ) : (
              <>
                <AlertCircle className="size-4" />
                {successCount}/{total} successful{errorCount > 0 ? `, ${errorCount} failed` : ""}
                {cancelled ? " (cancelled)" : ""}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
