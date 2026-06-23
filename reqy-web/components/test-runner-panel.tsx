"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Play, Download, Loader2 } from "lucide-react"
import { toJUnitXml } from "@/lib/test-runner/junit-export"
import type { CollectionRunReport } from "@/lib/test-runner/types"
import type { Collection } from "@/hooks/request-types"

interface Props {
  collection: Collection
  environment?: Record<string, string>
}

export function TestRunnerPanel({ collection, environment }: Props) {
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<CollectionRunReport | null>(null)

  const run = async () => {
    setRunning(true)
    try {
      const res = await fetch("/api/test-runner/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ collection, environment }),
      })
      if (!res.ok) throw new Error(`Run failed: ${res.status}`)
      const r = await res.json()
      setReport(r)
    } catch (err) {
      console.error(err)
    } finally {
      setRunning(false)
    }
  }

  const exportJunit = () => {
    if (!report) return
    const xml = toJUnitXml(report)
    const blob = new Blob([xml], { type: "application/xml" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${collection.name.replace(/\s+/g, "-")}-junit.xml`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-3 p-3 border rounded-md bg-card">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Run collection</h3>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={run} disabled={running}>
            {running ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
            {running ? "Running..." : "Run"}
          </Button>
          {report && (
            <Button type="button" size="sm" variant="outline" onClick={exportJunit}>
              <Download className="w-3 h-3 mr-1" /> JUnit
            </Button>
          )}
        </div>
      </div>
      {report && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">
            {report.summary.passed}/{report.summary.total} passed in {(report.totalDurationMs / 1000).toFixed(2)}s
          </div>
          <div className="space-y-1">
            {report.results.map((r) => (
              <div key={r.requestId} className="flex items-center gap-2 text-xs p-1.5 border rounded">
                <span className={`w-4 text-center ${
                  r.status === "pass" ? "text-green-500" :
                  r.status === "fail" ? "text-red-500" :
                  r.status === "errored" ? "text-orange-500" : "text-gray-400"
                }`}>
                  {r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "!"}
                </span>
                <span className="flex-1 truncate">{r.requestName}</span>
                <span className="text-muted-foreground">{r.statusCode ?? "-"}</span>
                <span className="text-muted-foreground w-16 text-right">{r.responseTimeMs ?? 0}ms</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
