"use client"

import { useState, useEffect, useMemo, useRef, useCallback } from "react"
import { Play, Loader2, FlaskConical, CheckCircle, XCircle, Sparkles } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { DiffDialog } from "@/components/diff-dialog"
import { analyze } from "@/src/ai/local-engine/analyzer"
import { buildRequestContext } from "@/src/ai/local-engine/context"
import { Panel } from "@/src/ai/components/Panel"
import type { RequestPayload } from "@/src/ai/types"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ResponseStatusBar } from "@/components/response-status-bar"
import { ResponseTimeline } from "@/components/response-timeline"
import { ResponseContentRenderer } from "@/components/response-content-renderer"
import { ResponseAiSummary } from "@/components/response-ai-summary"
import { ResponseHeadersTab } from "@/components/response-headers-tab"
import { CodeSnippet } from "@/components/response-code-snippet"
import { type ResponseFormat, isJson, isXml, isHtml, isImage, isPdf, isAudio, isVideo, isBinary, extractVideoUrls, extractImageUrls, getContentType } from "@/components/response-utils"
import type { HistoryItem, TestResult } from "@/lib/types"

interface ResponsePanelProps {
  responseBody?: string
  responseData?: string | Blob
  responseStatus?: number
  responseTime?: number
  responseTimings?: {
    dnsMs?: number
    connectMs?: number
    ttfbMs?: number
  }
  responseSize?: string
  responseHeaders?: Record<string, string>
  mocked?: boolean
  isLoading?: boolean
  onRun?: () => Promise<void>
  onRunAndSave?: () => Promise<void>
  onRunAndDownload?: () => Promise<void>
  onAnalyze?: () => Promise<void>
  onGenerateTests?: () => Promise<void>
  onCreateMock?: () => void
  onPatchRequest?: (patch: Partial<RequestPayload>) => void
  aiSummary?: string
  aiError?: string
  aiIsLoading?: boolean
  method?: string
  url?: string
  requestHeaders?: Array<{ key: string; value: string }>
  queryParams?: Array<{ key: string; value: string }>
  body?: string
  bodyType?: string
  authType?: string
  authToken?: string
  testResults?: TestResult[]
  history?: HistoryItem[]
}

export function ResponsePanel({
  responseBody,
  responseData,
  responseStatus,
  responseTime,
  responseTimings,
  responseSize,
  responseHeaders,
  mocked,
  testResults,
  isLoading = false,
  onRun,
  onRunAndSave,
  onRunAndDownload,
  onAnalyze,
  onGenerateTests,
  onCreateMock,
  onPatchRequest,
  aiSummary,
  aiError,
  aiIsLoading = false,
  method = "GET",
  url = "",
  requestHeaders = [],
  queryParams = [],
  body = "",
  bodyType = "none",
  authType = "none",
  authToken = "",
  history = [],
}: ResponsePanelProps) {
  const [responseFormat, setResponseFormat] = useState<ResponseFormat>("pretty")
  const [activeTab, setActiveTab] = useState("response")
  const [diffDialogOpen, setDiffDialogOpen] = useState(false)

  // ── ReqlyAI fix undo state (Phase 4) ──────────────────────────────
  const { toast } = useToast()
  type AppliedFix = {
    diagId: string
    diagTitle: string
    preSnapshot: {
      method: string
      url: string
      headers: Array<{ key: string; value: string }>
      body: string
      authType: string
    }
  }
  const [lastAppliedFix, setLastAppliedFix] = useState<AppliedFix | null>(null)
  const [applyingFixId, setApplyingFixId] = useState<string | null>(null)

  const mediaUrl = useMemo(() => {
    if (responseData instanceof Blob) {
      return URL.createObjectURL(responseData)
    }
    return null
  }, [responseData])

  useEffect(() => {
    return () => {
      if (mediaUrl) URL.revokeObjectURL(mediaUrl)
    }
  }, [mediaUrl])

  const responsePanelRef = useRef<HTMLDivElement>(null)

  const diagnostics = useMemo(() => {
    const headerRecord: Record<string, string> = {}
    for (const h of requestHeaders ?? []) {
      if (h.key) headerRecord[h.key] = h.value
    }
    const ctx = buildRequestContext(
      {
        method: method as RequestPayload["method"],
        url: url ?? "",
        headers: headerRecord,
        body: body ?? null,
        authType: (authType ?? "none") as RequestPayload["authType"],
      },
      responseStatus !== undefined
        ? {
            status: responseStatus,
            statusText: "",
            headers: responseHeaders ?? {},
            body: responseBody,
            duration: responseTime ?? 0,
            size: 0,
          }
        : undefined
    )
    return analyze(ctx)
  }, [method, url, requestHeaders, body, authType, responseStatus, responseHeaders, responseBody, responseTime])
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (responseBody) {
      const t0 = window.setTimeout(() => setFlash(true), 0)
      const timer = window.setTimeout(() => setFlash(false), 600)
      return () => {
        window.clearTimeout(t0)
        window.clearTimeout(timer)
      }
    }
  }, [responseBody])

  const hasResponse = Boolean(responseBody) || responseStatus !== undefined

  // ── Timing gauge animation ─────────────────────────────────────
  const [timingGaugeWidth, setTimingGaugeWidth] = useState(0)

  useEffect(() => {
    if (hasResponse && responseTime !== undefined && !isLoading) {
      const t0 = window.setTimeout(() => setTimingGaugeWidth(0), 0)
      const timer = window.setTimeout(() => {
        setTimingGaugeWidth(100)
      }, 20)
      return () => {
        window.clearTimeout(t0)
        window.clearTimeout(timer)
      }
    } else {
      const t0 = window.setTimeout(() => setTimingGaugeWidth(0), 0)
      return () => window.clearTimeout(t0)
    }
  }, [responseTime, hasResponse, isLoading])

  // ── Visual helpers ─────────────────────────────────────────────
  const getStatusAccentBorder = () => {
    if (responseStatus == null) return ""
    if (responseStatus >= 200 && responseStatus < 300) return "border-l-2 border-l-emerald-500"
    if (responseStatus >= 300 && responseStatus < 400) return "border-l-2 border-l-blue-500"
    if (responseStatus >= 400 && responseStatus < 500) return "border-l-2 border-l-amber-500"
    if (responseStatus >= 500) return "border-l-2 border-l-red-500"
    return ""
  }

  const getGiantCodeColor = () => {
    if (responseStatus == null) return "text-muted-foreground/5"
    if (responseStatus >= 200 && responseStatus < 300) return "text-emerald-500/5"
    if (responseStatus >= 300 && responseStatus < 400) return "text-blue-500/5"
    if (responseStatus >= 400 && responseStatus < 500) return "text-amber-500/5"
    if (responseStatus >= 500) return "text-red-500/5"
    return "text-muted-foreground/5"
  }

  const getGaugeColor = (time?: number) => {
    if (time === undefined || time === null) return "bg-muted-foreground"
    if (time < 300) return "bg-emerald-500"
    if (time < 1000) return "bg-amber-500"
    return "bg-red-500"
  }

  // ── Auto-format ────────────────────────────────────────────────
  function getAutoFormat(): ResponseFormat {
    if (responseData instanceof Blob && responseData.type === "application/pdf") {
      return "pdf"
    }
    if (isJson(responseBody, responseHeaders)) {
      try {
        const parsed = JSON.parse(responseBody as string)
        const videoUrls = extractVideoUrls(parsed)
        if (videoUrls.length > 0) return "preview"
        const imageUrls = extractImageUrls(parsed)
        if (imageUrls.length > 0) return "preview"
      } catch {
        // ignore
      }
      return "json"
    }
    if (isXml(responseBody, responseHeaders)) return "xml"
    if (isHtml(responseBody, responseHeaders)) return "html"
    if (isImage(responseData, responseHeaders)) return "image"
    if (isPdf(responseData, responseHeaders)) return "pdf"
    if (isAudio(responseData, responseHeaders)) return "audio"
    if (isVideo(responseData, responseHeaders)) return "video"
    if (isBinary(responseData, responseHeaders)) return "binary"
    return "pretty"
  }

  useEffect(() => {
    if (responseBody) {
      const t0 = window.setTimeout(() => setResponseFormat(getAutoFormat()), 0)
      return () => window.clearTimeout(t0)
    }
  }, [responseBody, responseHeaders])

  const handleExport = () => {
    if (!responseBody) return
    try {
      const blob = new Blob([responseBody], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'response.json'
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // ignore
    }
  }

  const handleRun = async () => {
    if (!onRun) return
    await onRun()
    setActiveTab("response")
  }

  // P4.6: Ctrl+Shift+F — re-apply last fix without re-clicking
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && (e.key === "F" || e.key === "f")) {
        if (lastAppliedFix && onPatchRequest && activeTab === "reqlyai") {
          e.preventDefault()
          // Re-apply: find the diagnostic by id from current diagnostics
          const diag = diagnostics.find((d) => d.id === lastAppliedFix.diagId)
          if (diag?.fix) {
            onPatchRequest(diag.fix.applyFix())
            toast({ title: "Fix ré-appliqué", description: diag.title, duration: 3000 })
          }
        }
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [lastAppliedFix, diagnostics, onPatchRequest, activeTab, toast])

  return (
    <div
      ref={responsePanelRef}
      className={cn(
        "flex h-full flex-col bg-muted/20",
        getStatusAccentBorder(),
        flash && "response-flash"
      )}
    >
      <ResponseStatusBar
        responseStatus={responseStatus}
        responseTime={responseTime}
        responseSize={responseSize}
        mocked={mocked}
        isLoading={isLoading}
        hasResponse={hasResponse}
        aiIsLoading={aiIsLoading}
        onRun={onRun}
        onRunAndSave={onRunAndSave}
        onRunAndDownload={onRunAndDownload}
        onAnalyze={onAnalyze}
        onGenerateTests={onGenerateTests}
        onExport={handleExport}
        onCreateMock={onCreateMock}
        onDiff={() => setDiffDialogOpen(true)}
      />

      {/* Response Timing Gauge — full-width animation bar */}
      {hasResponse && !isLoading && (
        <div className="h-1 bg-muted-foreground/10 overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-500 ease-out",
              getGaugeColor(responseTime)
            )}
            style={{ width: `${timingGaugeWidth}%` }}
          />
        </div>
      )}

      <ResponseTimeline
        timings={{
          dnsMs: responseTimings?.dnsMs,
          connectMs: responseTimings?.connectMs,
          ttfbMs: responseTimings?.ttfbMs,
          totalMs: responseTime ?? 0,
        }}
      />

      <ResponseAiSummary
        aiSummary={aiSummary}
        aiError={aiError}
        aiIsLoading={aiIsLoading}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border px-4">
          <TabsList className="h-auto gap-0 bg-transparent p-0 -mb-px">
            <TabsTrigger
              value="response"
              className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=inactive]:text-muted-foreground/80 data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:border-muted-foreground/20"
            >
              Response
              {hasResponse && (
                <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-primary">
                  {responseStatus ?? "-"}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="headers"
              className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=inactive]:text-muted-foreground/80 data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:border-muted-foreground/20"
            >
              Headers
              {hasResponse && responseHeaders && (
                <span className="ml-1.5 rounded-full bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-mono">
                  {Object.keys(responseHeaders).length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="code"
              className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=inactive]:text-muted-foreground/80 data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:border-muted-foreground/20"
            >
              Code
            </TabsTrigger>
            <TabsTrigger
              value="tests"
              className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=inactive]:text-muted-foreground/80 data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:border-muted-foreground/20"
            >
              Tests
              {testResults && testResults.length > 0 && (
                <span className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-mono",
                  testResults.every((r) => r.passed)
                    ? "bg-emerald-500/10 text-emerald-500"
                    : "bg-red-500/10 text-red-500"
                )}>
                  {testResults.filter((r) => r.passed).length}/{testResults.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="reqlyai"
              data-testid="tab-reqlyai"
              className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-xs font-semibold uppercase tracking-wider transition-all duration-200 data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=inactive]:text-muted-foreground/80 data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:border-muted-foreground/20"
            >
              <Sparkles className="size-3 mr-1" />
              ReqlyAI
              {diagnostics.length > 0 && (
                <span className="ml-1.5 rounded-full bg-red-500/20 text-red-600 px-1.5 py-0.5 text-[10px] font-mono">
                  {diagnostics.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="response" data-testid="response-body" className="m-0 min-h-0 flex-1 animate-fade-in relative overflow-hidden">
          {/* Giant floating status code background */}
          {hasResponse && responseStatus && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
              <span className={cn("text-[140px] font-bold leading-none", getGiantCodeColor())}>
                {responseStatus}
              </span>
            </div>
          )}

          {/* Content layer above giant code */}
          <div className="relative z-10 h-full">
            {isLoading ? (
              <div className="flex flex-col h-full">
                <div className="shrink-0 px-4 py-3 border-b border-border/50">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5">
                      <Loader2 className="size-3.5 animate-spin text-amber-500" />
                      <span className="text-xs font-medium text-amber-500">Loading response...</span>
                    </div>
                  </div>
                </div>
                <div className="flex-1 skeleton-loader">
                  <div className="skeleton-line" />
                  <div className="skeleton-line" />
                  <div className="skeleton-line" />
                  <div className="skeleton-line" />
                  <div className="skeleton-line" />
                  <div className="skeleton-line" />
                </div>
              </div>
            ) : hasResponse ? (
              <ResponseContentRenderer
                responseBody={responseBody}
                responseData={responseData}
                responseHeaders={responseHeaders}
                responseFormat={responseFormat}
                onFormatChange={setResponseFormat}
                mediaUrl={mediaUrl}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-center px-4">
                <div className="rounded-2xl bg-muted/40 border border-border p-5 mb-4">
                  <Play className="size-10 text-muted-foreground/30" />
                </div>
                <p className="text-sm font-semibold text-foreground/80">No response yet</p>
                <p className="mt-1 text-xs text-muted-foreground/60 max-w-[200px]">
                  Execute the request to see the response here
                </p>
                <Button
                  onClick={handleRun}
                  size="sm"
                  className="mt-4 h-8 gap-1.5 text-xs font-semibold"
                >
                  <Play className="size-3.5 fill-current" />
                  Send Request
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="headers" className="m-0 min-h-0 flex-1 animate-fade-in">
          <ResponseHeadersTab responseHeaders={responseHeaders} />
        </TabsContent>

        <TabsContent value="code" className="m-0 flex min-h-0 flex-1 flex-col p-4 animate-fade-in">
          <CodeSnippet
            method={method}
            url={url}
            queryParams={queryParams}
            requestHeaders={requestHeaders}
            body={body}
            bodyType={bodyType}
            authType={authType}
            authToken={authToken}
          />
        </TabsContent>

        <TabsContent value="reqlyai" className="m-0 min-h-0 flex-1 animate-fade-in overflow-auto">
          <Panel
            diagnostics={diagnostics}
            onApplyFix={(diag) => {
              if (!diag.fix || !onPatchRequest) return
              // P4.5: Double-clic protection
              if (applyingFixId === diag.id) return
              // P4.8: Don't apply if a request is currently in flight
              if (isLoading) {
                toast({
                  title: "Requête en cours",
                  description: "Attends la fin de la requête avant d'appliquer un fix.",
                  variant: "destructive",
                  duration: 3000,
                })
                return
              }
              // Snapshot current request fields BEFORE applying the patch (for undo)
              const preSnapshot: AppliedFix["preSnapshot"] = {
                method,
                url,
                headers: requestHeaders ?? [],
                body: body ?? "",
                authType: authType ?? "none",
              }
              // Apply the fix
              onPatchRequest(diag.fix.applyFix())
              // Mark this fix as "just applied" for 300ms to prevent rapid double-clicks
              setApplyingFixId(diag.id)
              window.setTimeout(() => setApplyingFixId(null), 300)
              // Store for undo (P4.5)
              setLastAppliedFix({ diagId: diag.id, diagTitle: diag.title, preSnapshot })
              // Toast confirmation with Undo button (P4.7) — 5s window
              toast({
                title: "Fix appliqué",
                description: diag.title,
                duration: 5000,
                onClick: () => {
                  // Undo: restore pre-snapshot
                  onPatchRequest({
                    method: preSnapshot.method as any,
                    url: preSnapshot.url,
                    headers: Object.fromEntries(
                      preSnapshot.headers.filter((h) => h.key).map((h) => [h.key, h.value])
                    ) as Record<string, string>,
                    body: preSnapshot.body,
                    authType: preSnapshot.authType as any,
                  })
                  setLastAppliedFix(null)
                },
              })
            }}
          />
        </TabsContent>

        <TabsContent value="tests" className="m-0 min-h-0 flex-1 animate-fade-in overflow-auto">
          {testResults && testResults.length > 0 ? (
            <div className="space-y-1 p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className={cn(
                  "text-xs font-semibold",
                  testResults.every((r) => r.passed) ? "text-emerald-500" : "text-red-500"
                )}>
                  {testResults.filter((r) => r.passed).length}/{testResults.length} passed
                </span>
              </div>
              {testResults.map((result) => (
                <div
                  key={result.assertionId}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
                    result.passed
                      ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600"
                      : "border-red-500/20 bg-red-500/5 text-red-600"
                  )}
                >
                  {result.passed ? (
                    <CheckCircle className="size-3.5 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="size-3.5 shrink-0 mt-0.5" />
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">
                      {result.type}: {result.target}
                      {result.expected ? ` = ${result.expected}` : ""}
                    </span>
                    <span className="text-muted-foreground/80">{result.message}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center px-4">
              <div className="rounded-2xl bg-muted/40 border border-border p-5 mb-4">
                <FlaskConical className="size-10 text-muted-foreground/30" />
              </div>
              <p className="text-sm font-semibold text-foreground/80">No test results</p>
              <p className="mt-1 text-xs text-muted-foreground/60 max-w-[200px]">
                Add assertions in the Tests panel and send a request to see results
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <DiffDialog
        open={diffDialogOpen}
        onOpenChange={setDiffDialogOpen}
        history={history}
        currentResponse={responseBody}
        currentResponseStatus={responseStatus}
      />
    </div>
  )
}
