"use client"

import { useState, useEffect } from "react"
import { CheckCircle, Clock, FileText, Download, Play, Loader2, Sparkles, XCircle, AlertTriangle, ChevronDown, FlaskConical, Plus, GitCompare } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface ResponseStatusBarProps {
  responseStatus?: number
  responseTime?: number
  responseSize?: string
  mocked?: boolean
  isLoading?: boolean
  hasResponse: boolean
  aiIsLoading?: boolean
  onRun?: () => Promise<void>
  onRunAndSave?: () => Promise<void>
  onRunAndDownload?: () => Promise<void>
  onAnalyze?: () => Promise<void>
  onGenerateTests?: () => Promise<void>
  onExport?: () => void
  onCreateMock?: () => void
  onDiff?: () => void
}

export function ResponseStatusBar({
  responseStatus,
  responseTime,
  responseSize,
  mocked,
  isLoading = false,
  hasResponse,
  aiIsLoading = false,
  onRun,
  onRunAndSave,
  onRunAndDownload,
  onAnalyze,
  onGenerateTests,
  onExport,
  onCreateMock,
  onDiff,
}: ResponseStatusBarProps) {
  const getStatusColor = (status?: number) => {
    if (status == null) return "bg-muted text-muted-foreground"
    if (status >= 200 && status < 300) return "bg-emerald-500/20 text-emerald-600 border-emerald-500/30"
    if (status >= 300 && status < 400) return "bg-blue-500/20 text-blue-600 border-blue-500/30"
    if (status >= 400 && status < 500) return "bg-amber-500/20 text-amber-600 border-amber-500/30"
    if (status >= 500) return "bg-red-500/20 text-red-600 border-red-500/30"
    return "bg-muted text-muted-foreground"
  }

  const getStatusIcon = (status?: number) => {
    if (status == null) return null
    if (status >= 200 && status < 300) return <CheckCircle className="size-3.5" />
    if (status >= 300 && status < 400) return <AlertTriangle className="size-3.5" />
    if (status >= 400) return <XCircle className="size-3.5" />
    return null
  }

  const getStatusLabel = (status?: number) => {
    if (status == null) return ""
    if (status >= 200 && status < 300) return "OK"
    if (status >= 300 && status < 400) return "Redirect"
    if (status >= 400 && status < 500) return "Client Error"
    if (status >= 500) return "Server Error"
    return ""
  }

  const handleRun = async () => {
    if (!onRun) return
    await onRun()
  }

  // ── Animated gauge fill ────────────────────────────────────────
  const targetGaugeWidth = Math.min((responseTime ?? 0) / 10, 100)
  const [gaugeFillWidth, setGaugeFillWidth] = useState(0)

  useEffect(() => {
    let resetTimer: number | undefined
    let fillTimer: number | undefined

    if (hasResponse && responseTime !== undefined) {
      resetTimer = window.setTimeout(() => setGaugeFillWidth(0), 0)
      fillTimer = window.setTimeout(() => {
        setGaugeFillWidth(targetGaugeWidth)
      }, 20)
    } else {
      resetTimer = window.setTimeout(() => setGaugeFillWidth(0), 0)
    }

    return () => {
      if (resetTimer) clearTimeout(resetTimer)
      if (fillTimer) clearTimeout(fillTimer)
    }
  }, [responseTime, hasResponse, targetGaugeWidth])

  const getGaugeFillColor = (time?: number) => {
    if (time === undefined || time === null) return "#6b7280"
    if (time < 300) return "#10b981"
    if (time < 3000) return "#f59e0b"
    return "#ef4444"
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
        {isLoading ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5">
            <Loader2 className="size-3.5 animate-spin text-amber-500" />
            <span className="text-xs font-semibold text-amber-500">Sending request...</span>
          </div>
        ) : hasResponse ? (
          <div className="flex items-center gap-3">
            {/* Status badge — pill style */}
            <div className={cn(
              "flex items-center gap-1.5 rounded-lg border px-2.5 py-1",
              getStatusColor(responseStatus)
            )}>
              {getStatusIcon(responseStatus)}
              <span className="text-xs font-bold font-mono">{responseStatus ?? "-"}</span>
            </div>

            {/* Time — with animated gauge bar */}
            <div className="flex items-center gap-2">
              <div className="h-1.5 rounded-full bg-muted-foreground/10 overflow-hidden w-16">
                <div
                  className="h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${gaugeFillWidth}%`,
                    backgroundColor: getGaugeFillColor(responseTime)
                  }}
                />
              </div>
              <span className="text-[11px] font-mono font-medium text-muted-foreground whitespace-nowrap">
                {responseTime ?? 0}<span className="text-muted-foreground/70">ms</span>
              </span>
            </div>

            {/* Size — compact */}
            <div className="flex items-center gap-1 rounded-md border border-muted-foreground/10 bg-muted/20 px-2 py-1">
              <FileText className="size-3 text-muted-foreground/70" />
              <span className="text-[11px] font-mono font-medium text-muted-foreground">{responseSize ?? "0 B"}</span>
            </div>

            {/* Mocked badge */}
            {mocked && (
              <div className="flex items-center gap-1 rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-1">
                <FlaskConical className="size-3 text-purple-500" />
                <span className="text-[10px] font-semibold font-mono text-purple-500">Mocked</span>
              </div>
            )}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground/70 italic">Awaiting request...</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              disabled={isLoading}
              size="sm"
              className={cn(
                "h-8 gap-1.5 text-xs font-semibold transition-all duration-200",
                isLoading && "opacity-80"
              )}
            >
              {isLoading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5 fill-current" />
              )}
              {isLoading ? "Running..." : "Send"}
              <ChevronDown className="size-3 text-muted-foreground/60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onSelect={onRunAndSave}
              disabled={isLoading || !onRunAndSave}
              className="cursor-pointer text-xs gap-2"
            >
              <Play className="size-3.5" />
              Send & Save
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={onRunAndDownload}
              disabled={isLoading || !onRunAndDownload}
              className="cursor-pointer text-xs gap-2"
            >
              <Download className="size-3.5" />
              Send & Download
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {onAnalyze && (
          <Button
            variant="outline"
            size="sm"
            onClick={onAnalyze}
            disabled={aiIsLoading || !hasResponse}
            className="h-8 gap-1.5 text-xs font-medium transition-all duration-200"
          >
            {aiIsLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            AI Analyze
          </Button>
        )}
        {onGenerateTests && (
          <Button
            variant="outline"
            size="sm"
            onClick={onGenerateTests}
            disabled={aiIsLoading || !hasResponse}
            className="h-8 gap-1.5 text-xs font-medium transition-all duration-200"
          >
            {aiIsLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            AI Tests
          </Button>
        )}
        {onCreateMock && (
          <Button
            variant="outline"
            size="sm"
            onClick={onCreateMock}
            disabled={!hasResponse}
            className="h-8 gap-1.5 text-xs font-medium text-purple-500 border-purple-500/30 hover:bg-purple-500/10 transition-all duration-200"
          >
            <Plus className="size-3.5" />
            Créer un mock
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs font-medium transition-all duration-200"
          onClick={onExport}
          disabled={!hasResponse}
        >
          <Download className="size-3.5" />
          Export
        </Button>
        {onDiff && (
          <Button
            variant="outline"
            size="sm"
            onClick={onDiff}
            disabled={!hasResponse}
            className="h-8 gap-1.5 text-xs font-medium transition-all duration-200"
          >
            <GitCompare className="size-3.5" />
            Diff
          </Button>
        )}
      </div>
    </div>
  )
}
