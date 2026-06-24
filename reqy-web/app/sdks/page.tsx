"use client"
import { useState, useMemo } from "react"
import { ApiSidebar } from "@/components/api-sidebar"
import { ApiHeader } from "@/components/api-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Package, Download, Copy, Check, Loader2 } from "lucide-react"
import { useRequestStore } from "@/hooks/use-request-store"
import { generateTypeScriptSdk, type GeneratedFile } from "@/lib/sdk-codegen/typescript-generator"
import { generateOpenApiSpec } from "@/lib/openapi-export"

type Language = "typescript" | "python" | "go"

const LANGUAGES: Array<{ id: Language; label: string; available: boolean }> = [
  { id: "typescript", label: "TypeScript", available: true },
  { id: "python", label: "Python", available: false },
  { id: "go", label: "Go", available: false },
]

export default function SdksPage() {
  const { collections } = useRequestStore()
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("")
  const [language, setLanguage] = useState<Language>("typescript")
  const [files, setFiles] = useState<GeneratedFile[]>([])
  const [generating, setGenerating] = useState(false)
  const [activeFile, setActiveFile] = useState<string>("")
  const [copied, setCopied] = useState<string>("")

  // Default to first collection
  const selectedCollection = useMemo(
    () => collections.find((c) => c.id === selectedCollectionId) ?? collections[0],
    [collections, selectedCollectionId]
  )

  const generate = async () => {
    if (!selectedCollection) return
    setGenerating(true)
    try {
      // Build OpenAPI spec from collection
      const spec = generateOpenApiSpec([selectedCollection])
      if (language === "typescript") {
        const generated = generateTypeScriptSdk(spec as any)
        setFiles(generated)
        setActiveFile(generated[0]?.path ?? "")
      }
      // Python/Go not yet implemented — buttons will be disabled
    } catch (err) {
      console.error("SDK generation failed:", err)
    } finally {
      setGenerating(false)
    }
  }

  const downloadAll = () => {
    if (files.length === 0 || !selectedCollection) return
    const combined = files
      .map((f) => `// === ${f.path} ===\n\n${f.content}`)
      .join("\n\n")
    const ext = language === "typescript" ? "ts" : language === "python" ? "py" : "go"
    const blob = new Blob([combined], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${selectedCollection.name.replace(/\s+/g, "-").toLowerCase()}-sdk.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyFile = (path: string, content: string) => {
    if (typeof navigator !== "undefined") {
      navigator.clipboard.writeText(content).then(() => {
        setCopied(path)
        setTimeout(() => setCopied(""), 1500)
      }).catch(() => {})
    }
  }

  const activeFileContent = files.find((f) => f.path === activeFile)?.content ?? ""

  return (
    <div className="flex h-screen">
      <ApiSidebar />
      <div className="flex-1 flex flex-col">
        <ApiHeader />
        <main className="flex-1 overflow-auto p-6" data-testid="sdks-page">
          <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
              <Package className="w-6 h-6 text-orange-500" />
              <h1 className="text-2xl font-bold">SDK Generator</h1>
            </div>

            {collections.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No collections yet. Go to <strong>Collections</strong> to create one.
                </CardContent>
              </Card>
            )}

            {collections.length > 0 && (
              <>
                {/* Source + Language selection */}
                <Card>
                  <CardHeader>
                    <CardTitle>Configuration</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Source Collection</label>
                      <Select
                        value={selectedCollection?.id ?? ""}
                        onValueChange={setSelectedCollectionId}
                      >
                        <SelectTrigger data-testid="source-collection-select">
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

                    <div className="space-y-2">
                      <label className="text-sm font-medium">Target Language</label>
                      <div className="flex gap-2">
                        {LANGUAGES.map((lang) => (
                          <Button
                            key={lang.id}
                            variant={language === lang.id ? "default" : "outline"}
                            size="sm"
                            disabled={!lang.available}
                            onClick={() => lang.available && setLanguage(lang.id)}
                            data-testid={`language-button-${lang.id}`}
                          >
                            {lang.label}
                            {!lang.available && (
                              <Badge variant="outline" className="ml-2">Soon</Badge>
                            )}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={generate}
                        disabled={generating || !selectedCollection}
                        data-testid="generate-button"
                      >
                        {generating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Package className="w-3 h-3 mr-1" />}
                        Generate SDK
                      </Button>
                      {files.length > 0 && (
                        <Button variant="outline" onClick={downloadAll} data-testid="download-button">
                          <Download className="w-3 h-3 mr-1" />
                          Download {language === "typescript" ? ".ts" : language === "python" ? ".py" : ".go"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Preview */}
                {files.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Preview</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-12 gap-4">
                        {/* File tabs */}
                        <div className="col-span-3 space-y-1">
                          {files.map((f) => (
                            <button
                              key={f.path}
                              onClick={() => setActiveFile(f.path)}
                              className={`w-full text-left px-3 py-2 rounded text-sm font-mono ${
                                activeFile === f.path
                                  ? "bg-accent text-accent-foreground"
                                  : "hover:bg-accent/50"
                              }`}
                              data-testid={`file-tab-${f.path.replace(/[/.]/g, "-")}`}
                            >
                              {f.path}
                            </button>
                          ))}
                        </div>

                        {/* Code preview */}
                        <div className="col-span-9 relative">
                          <div className="absolute top-2 right-2 z-10">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyFile(activeFile, activeFileContent)}
                              data-testid={`copy-button-${activeFile.replace(/[/.]/g, "-")}`}
                            >
                              {copied === activeFile ? (
                                <><Check className="w-3 h-3 mr-1" /> Copied</>
                              ) : (
                                <><Copy className="w-3 h-3 mr-1" /> Copy</>
                              )}
                            </Button>
                          </div>
                          <pre
                            className="text-xs font-mono overflow-auto max-h-[60vh] p-3 bg-muted/30 rounded border"
                            data-testid={`file-content-${activeFile.replace(/[/.]/g, "-")}`}
                          >
                            {activeFileContent}
                          </pre>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Help text */}
                {files.length === 0 && !generating && (
                  <Card>
                    <CardContent className="py-8 text-center text-sm text-muted-foreground">
                      Select a collection and click <strong>Generate SDK</strong> to preview
                      and download a TypeScript client based on your OpenAPI spec.
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
