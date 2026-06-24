"use client"
import { useState } from "react"
import { Copy, Check, AlertCircle, CheckCircle2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface Props {
  data?: unknown
  errors?: unknown
  error?: string | null
  status?: number
  timeMs?: number
  loading?: boolean
}

export function ResponseViewer({ data, errors, error, status, timeMs, loading }: Props) {
  const [copied, setCopied] = useState(false)

  const text = error
    ? error
    : (() => {
        try {
          return JSON.stringify({ data: data ?? null, errors: errors ?? null }, null, 2)
        } catch {
          return "Unable to serialize response"
        }
      })()

  const copy = async () => {
    if (typeof navigator !== "undefined") {
      await navigator.clipboard.writeText(text).catch(() => {})
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  const hasErrors = !!errors || !!error

  return (
    <div className="border-t bg-card" data-testid="graphql-response-viewer">
      <div className="flex items-center justify-between p-2 border-b">
        <div className="flex items-center gap-2 text-xs">
          {status !== undefined && (
            <Badge variant={status >= 400 || hasErrors ? "destructive" : "default"} data-testid="graphql-response-status">
              {status}
            </Badge>
          )}
          {timeMs !== undefined && <span className="text-muted-foreground">{timeMs}ms</span>}
          {error && (
            <span className="text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {error}
            </span>
          )}
          {!error && !errors && data !== undefined && (
            <span className="text-green-500 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> OK
            </span>
          )}
          {!error && errors && (
            <span className="text-yellow-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> errors
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={copy}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          data-testid="graphql-response-copy"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="text-xs font-mono overflow-auto max-h-96 p-3 bg-muted/30 whitespace-pre-wrap" data-testid="graphql-response-data">
        {loading ? "Loading..." : text}
      </pre>
    </div>
  )
}
