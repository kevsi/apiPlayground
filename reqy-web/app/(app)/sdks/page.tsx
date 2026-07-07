"use client"
import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Package, Download, Loader2, AlertCircle, CheckCircle2 } from "lucide-react"
import { useRequestStore } from "@/hooks/use-request-store"
import { generateOpenApiSpec } from "@/lib/openapi-export"
import { generateSdk, GENERATORS, AVAILABLE_LANGUAGES } from "@/lib/openapi-gen/generator"
import { cn } from "@/lib/utils"

const LANGUAGE_OPTIONS = AVAILABLE_LANGUAGES.map((label) => ({
  label,
  id: GENERATORS[label],
}))

export default function SdksPage() {
  const { collections } = useRequestStore()
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("")
  const [language, setLanguage] = useState<string>("typescript-fetch")
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const selectedCollection = useMemo(
    () => collections.find((c) => c.id === selectedCollectionId) ?? collections[0],
    [collections, selectedCollectionId],
  )

  const currentLabel = useMemo(
    () =>
      Object.entries(GENERATORS).find(([, id]) => id === language)?.[0] ?? language,
    [language],
  )

  const generate = async () => {
    if (!selectedCollection) return
    setGenerating(true)
    setError(null)
    setSuccess(null)

    try {
      const spec = generateOpenApiSpec([selectedCollection])
      const result = await generateSdk(spec, language, selectedCollection.name)

      // Stream blob directly into save dialog if available
      if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
        try {
          const handle = await (window as unknown as {
            showSaveFilePicker: (opts: {
              suggestedName?: string
              types?: Array<{
                description: string
                accept: Record<string, string[]>
              }>
            }) => Promise<{
              createWritable: () => Promise<{
                write: (chunk: BufferSource | Blob) => Promise<void>
                close: () => Promise<void>
              }>
            }>
          }).showSaveFilePicker({
            suggestedName: result.filename,
            types: [
              {
                description: "ZIP archive",
                accept: { "application/zip": [".zip"] },
              },
            ],
          })
          const writable = await handle.createWritable()
          await writable.write(result.blob)
          await writable.close()
          setSuccess(`SDK saved as ${result.filename}`)
          return
        } catch {
          // User cancelled — do nothing
          return
        }
      }

      // Fallback: download via anchor click
      const url = URL.createObjectURL(result.blob)
      const a = document.createElement("a")
      a.href = url
      a.download = result.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setSuccess(`SDK downloaded as ${result.filename}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed"
      setError(msg)
      console.error("SDK generation failed:", err)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <main className="flex-1 overflow-auto p-6" data-testid="sdks-page">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Package className="w-6 h-6 text-orange-500" />
          <h1 className="text-2xl font-bold">SDK Generator</h1>
          <p className="text-sm text-muted-foreground">
            Generates a native client from your collection via OpenAPI Generator
          </p>
        </div>

        {collections.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No collections yet. Go to <strong>Collections</strong> to create one.
            </CardContent>
          </Card>
        )}

        {collections.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Source collection */}
              <div className="space-y-2">
                <label htmlFor="source-collection" className="text-sm font-medium">Source Collection</label>
                <Select
                  value={selectedCollection?.id ?? ""}
                  onValueChange={setSelectedCollectionId}
                >
                  <SelectTrigger id="source-collection" data-testid="source-collection-select">
                    <SelectValue placeholder="Select a collection" />
                  </SelectTrigger>
                  <SelectContent>
                    {collections.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} ({c.requests?.length ?? 0} requests)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Target language */}
              <div className="space-y-2">
                <label htmlFor="target-language" className="text-sm font-medium">Target Language</label>
                <Select
                  value={language}
                  onValueChange={setLanguage}
                >
                  <SelectTrigger
                    id="target-language"
                    className="w-full"
                    data-testid="language-select"
                  >
                    <SelectValue placeholder="Select a language" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status messages */}
              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertCircle className="size-4 shrink-0" />
                  {error}
                </div>
              )}
              {success && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  <CheckCircle2 className="size-4 shrink-0" />
                  {success}
                </div>
              )}

              {/* Generate button */}
              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={generate}
                  disabled={generating || !selectedCollection}
                  size="lg"
                  data-testid="generate-button"
                >
                  {generating ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="size-4 mr-2" />
                      Generate &amp; Download
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground">
                  SDK will be downloaded as a ZIP file containing a complete {currentLabel} client
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Help card */}
        {collections.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>About</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                This uses the{" "}
                <a
                  href="https://openapi-generator.tech"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  OpenAPI Generator
                </a>{" "}
                hosted API to generate a native SDK client from your collection.
              </p>
              <p>Supported languages: {AVAILABLE_LANGUAGES.join(", ")}.</p>
              <p>
                The generated ZIP contains the full project source — types, client
                class, and build configuration.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}
