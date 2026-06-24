"use client"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Code2, Loader2 } from "lucide-react"
import { generateTypeScriptSdk } from "@/lib/sdk-codegen/typescript-generator"
import { generateOpenApiSpec } from "@/lib/openapi-export"
import type { Collection } from "@/hooks/use-request-store"

interface HistoryLikeItem {
  requestId: string
  responseBody?: unknown
}

interface Props {
  collections: Collection[]
  historyItems?: HistoryLikeItem[]
  inferFromHistory?: boolean
  defaultName?: string
}

export function SdkDownloadButton({
  collections,
  historyItems,
  inferFromHistory = false,
  defaultName = "reqly",
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const download = async () => {
    setLoading(true)
    setError(null)
    try {
      const mappedHistory = inferFromHistory
        ? historyItems?.map((h) => ({
            requestId: h.requestId,
            responseBody: h.responseBody,
          }))
        : undefined
      const spec = generateOpenApiSpec(collections, {
        enableInference: inferFromHistory && !!mappedHistory,
        historyItems: mappedHistory,
      })
      const files = generateTypeScriptSdk(spec)
      const combined = files
        .map((f) => `// === ${f.path} ===\n\n${f.content}`)
        .join("\n\n")
      const blob = new Blob([combined], { type: "text/typescript" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const collectionName =
        defaultName ||
        (collections.length === 1 ? collections[0].name : "reqly")
      a.download = `${collectionName.replace(/\s+/g, "-").toLowerCase()}-sdk.ts`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "SDK generation failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={download}
        disabled={loading || collections.length === 0}
        data-testid="sdk-download-button"
      >
        {loading ? (
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
        ) : (
          <Code2 className="w-3 h-3 mr-1" />
        )}
        {loading ? "Generating..." : "Download TypeScript SDK"}
      </Button>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Generates a fetch-based TypeScript client from your OpenAPI spec.
      </p>
    </div>
  )
}
