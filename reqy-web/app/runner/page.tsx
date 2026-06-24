"use client"
import { useState } from "react"
import { ApiSidebar } from "@/components/api-sidebar"
import { ApiHeader } from "@/components/api-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Play, CheckCircle2, XCircle, Loader2, Download, Clock } from "lucide-react"
import { useRequestStore } from "@/hooks/use-request-store"
import { runCollection } from "@/lib/test-runner/runner"
import { toJUnitXml } from "@/lib/test-runner/junit-export"
import type { CollectionRunReport } from "@/lib/test-runner/types"
import type { Collection } from "@/hooks/request-types"

interface RunHistoryEntry {
  id: string
  collectionId: string
  collectionName: string
  report: CollectionRunReport
  timestamp: number
}

const RUN_HISTORY_KEY = "reqly-run-history"
const RUN_HISTORY_MAX = 10

function loadHistory(): RunHistoryEntry[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(RUN_HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveHistory(history: RunHistoryEntry[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(history.slice(0, RUN_HISTORY_MAX)))
}

export default function RunnerPage() {
  const { collections } = useRequestStore()
  const [history, setHistory] = useState<RunHistoryEntry[]>([])
  const [activeReport, setActiveReport] = useState<CollectionRunReport | null>(null)
  const [runningId, setRunningId] = useState<string | null>(null)
  const [selectedReport, setSelectedReport] = useState<RunHistoryEntry | null>(null)

  // Load history on mount
  useState(() => {
    setHistory(loadHistory())
  })

  const runOne = async (collection: Collection) => {
    setRunningId(collection.id)
    setActiveReport(null)
    try {
      const executor = async (req: { method: string; url: string; headers: Record<string, string>; body?: unknown }) => {
        const started = Date.now()
        const res = await fetch(req.url, {
          method: req.method,
          headers: req.headers,
          body: req.body as BodyInit | undefined,
        })
        const text = await res.text()
        let parsed: unknown
        try { parsed = JSON.parse(text) } catch { parsed = text }
        return {
          statusCode: res.status,
          responseTimeMs: Date.now() - started,
          body: parsed,
          headers: Object.fromEntries(res.headers.entries()),
        }
      }
      const report = await runCollection(collection, {
        environment: {},
        iterationData: {},
        iterationIndex: 0,
        log: () => {},
      }, { executor })
      setActiveReport(report)

      const entry: RunHistoryEntry = {
        id: `run-${Date.now()}`,
        collectionId: collection.id,
        collectionName: collection.name,
        report,
        timestamp: Date.now(),
      }
      const newHistory = [entry, ...history].slice(0, RUN_HISTORY_MAX)
      setHistory(newHistory)
      saveHistory(newHistory)
    } catch (err) {
      console.error("Run failed:", err)
    } finally {
      setRunningId(null)
    }
  }

  const exportJunit = (entry: RunHistoryEntry) => {
    const xml = toJUnitXml(entry.report)
    const blob = new Blob([xml], { type: "application/xml" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${entry.collectionName.replace(/\s+/g, "-")}-junit.xml`
    a.click()
    URL.revokeObjectURL(url)
  }

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts
    if (diff < 60_000) return "just now"
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    return `${Math.floor(diff / 86_400_000)}d ago`
  }

  return (
    <div className="flex h-screen">
      <ApiSidebar />
      <div className="flex-1 flex flex-col">
        <ApiHeader />
        <main className="flex-1 overflow-auto p-6" data-testid="runner-page">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center gap-3">
              <Play className="w-6 h-6 text-blue-500" />
              <h1 className="text-2xl font-bold">Collection Runner</h1>
            </div>

            {/* Collections */}
            <Card>
              <CardHeader>
                <CardTitle>Collections ({collections.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {collections.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No collections yet. Go to <strong>Collections</strong> to create one.
                  </p>
                )}
                {collections.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-3 border rounded-md" data-testid={`collection-row-${c.id}`}>
                    <div>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.requests?.length ?? 0} request(s)</div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => runOne(c)}
                      disabled={runningId !== null}
                      data-testid={`run-button-${c.id}`}
                    >
                      {runningId === c.id ? (
                        <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Running...</>
                      ) : (
                        <><Play className="w-3 h-3 mr-1" /> Run</>
                      )}
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Active run progress */}
            {activeReport && (
              <Card data-testid="active-run-report">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    Last Run
                    {activeReport.summary.failed > 0 || activeReport.summary.errored > 0 ? (
                      <Badge variant="destructive" data-testid="status-badge">{activeReport.summary.failed + activeReport.summary.errored} failed</Badge>
                    ) : (
                      <Badge variant="default" className="bg-green-500" data-testid="status-badge">{activeReport.summary.passed}/{activeReport.summary.total} passed</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {activeReport.results.map((r) => (
                      <div key={r.requestId} className="flex items-center gap-2 text-sm">
                        {r.status === "pass" ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : r.status === "fail" ? (
                          <XCircle className="w-4 h-4 text-red-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-orange-500" />
                        )}
                        <span className="flex-1">{r.requestName}</span>
                        <span className="text-xs text-muted-foreground">{r.responseTimeMs}ms</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Run history */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Recent Runs (last {RUN_HISTORY_MAX})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {history.length === 0 && (
                  <p className="text-sm text-muted-foreground">No runs yet. Click Run on a collection above.</p>
                )}
                {history.map((entry) => (
                  <div key={entry.id} className="flex items-center justify-between p-2 border rounded-md hover:bg-accent/30 cursor-pointer" data-testid={`history-entry-${entry.id}`} onClick={() => setSelectedReport(entry)}>
                    <div className="flex items-center gap-2">
                      {entry.report.summary.failed > 0 || entry.report.summary.errored > 0 ? (
                        <XCircle className="w-4 h-4 text-red-500" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      )}
                      <div>
                        <div className="text-sm font-medium">{entry.collectionName}</div>
                        <div className="text-xs text-muted-foreground">
                          {entry.report.summary.passed}/{entry.report.summary.total} passed · {formatTime(entry.timestamp)}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => { e.stopPropagation(); exportJunit(entry) }}
                      data-testid={`export-junit-${entry.id}`}
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Run details dialog */}
            <Dialog open={selectedReport !== null} onOpenChange={() => setSelectedReport(null)}>
              <DialogContent className="max-w-2xl">
                {selectedReport && (
                  <>
                    <DialogHeader>
                      <DialogTitle>{selectedReport.collectionName} — Run Details</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        {selectedReport.report.summary.failed > 0 ? (
                          <Badge variant="destructive">{selectedReport.report.summary.failed} failed</Badge>
                        ) : (
                          <Badge className="bg-green-500">All passed</Badge>
                        )}
                        <span className="text-sm text-muted-foreground">
                          {selectedReport.report.summary.total} request(s) ·{" "}
                          {(selectedReport.report.totalDurationMs / 1000).toFixed(2)}s
                        </span>
                      </div>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {selectedReport.report.results.map((r) => (
                          <div key={r.requestId} className="border rounded-md p-3 text-sm">
                            <div className="flex items-center gap-2 mb-1">
                              {r.status === "pass" ? (
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                              ) : (
                                <XCircle className="w-4 h-4 text-red-500" />
                              )}
                              <span className="font-medium">{r.requestName}</span>
                            </div>
                            {r.error && (
                              <p className="text-xs text-red-500 mt-1">{r.error}</p>
                            )}
                            {r.assertionResults
                              .filter((a) => !a.passed)
                              .map((a, i) => (
                                <p key={i} className="text-xs text-red-500">
                                  Assertion failed: {a.error ?? "expected: " + JSON.stringify(a.actualValue)}
                                </p>
                              ))}
                          </div>
                        ))}
                      </div>
                      <div className="flex justify-end">
                        <Button onClick={() => exportJunit(selectedReport)}>
                          <Download className="w-3 h-3 mr-1" /> Export JUnit
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </main>
      </div>
    </div>
  )
}
