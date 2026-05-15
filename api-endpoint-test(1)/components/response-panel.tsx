"use client"

import { useState, useEffect } from "react"
import { CheckCircle, Clock, FileText, Download, Copy, Check, Play, Loader2, Eye, Code, FileImage, Music, Video, BarChart3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const languages = [
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
  { id: "curl", label: "cURL" },
  { id: "php", label: "PHP" },
  { id: "go", label: "Go" },
]

type ResponseFormat = "pretty" | "raw" | "preview" | "visualize" | "json" | "xml" | "html" | "image" | "pdf" | "binary" | "audio" | "video"

const formatOptions: Array<{ value: ResponseFormat; label: string; icon: React.ComponentType<any> }> = [
  { value: "pretty", label: "Pretty", icon: Eye },
  { value: "raw", label: "Raw", icon: Code },
  { value: "preview", label: "Preview", icon: Eye },
  { value: "visualize", label: "Visualize", icon: BarChart3 },
  { value: "json", label: "JSON", icon: Code },
  { value: "xml", label: "XML", icon: Code },
  { value: "html", label: "HTML", icon: Code },
  { value: "image", label: "Image", icon: FileImage },
  { value: "pdf", label: "PDF", icon: FileText },
  { value: "binary", label: "Binary", icon: FileImage },
  { value: "audio", label: "Audio", icon: Music },
  { value: "video", label: "Video", icon: Video },
]


interface ResponsePanelProps {
  responseBody?: string
  responseData?: string | Blob
  responseStatus?: number
  responseTime?: number
  responseSize?: string
  responseHeaders?: Record<string, string>
  isLoading?: boolean
  onRun?: () => Promise<void>
  // Request data for code generation
  method?: string
  url?: string
  requestHeaders?: Array<{ key: string; value: string }>
  body?: string
  bodyType?: string
  authType?: string
  authToken?: string
}

export function ResponsePanel({
  responseBody,
  responseData,
  responseStatus,
  responseTime,
  responseSize,
  responseHeaders,
  isLoading = false,
  onRun,
  method = "GET",
  url = "",
  requestHeaders = [],
  body = "",
  bodyType = "none",
  authType = "none",
  authToken = "",
}: ResponsePanelProps) {
  const [selectedLang, setSelectedLang] = useState("python")
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState("response")
  const [isAutoSaveEnabled, setIsAutoSaveEnabled] = useState(false)
  const [hasSavedFirstRequest, setHasSavedFirstRequest] = useState(false)

  const generateCodeSnippet = (language: string) => {
    const headersObj = requestHeaders.reduce((acc, header) => {
      if (header.key && header.value) {
        acc[header.key] = header.value
      }
      return acc
    }, {} as Record<string, string>)

    // Add auth header if needed
    if (authType === "bearer" && authToken) {
      headersObj["Authorization"] = `Bearer ${authToken}`
    } else if (authType === "basic" && authToken) {
      headersObj["Authorization"] = `Basic ${authToken}`
    }

    const headersString = Object.keys(headersObj).length > 0
      ? Object.entries(headersObj).map(([k, v]) => `"${k}": "${v}"`).join(",\n      ")
      : ""

    const queryParams = url.includes("?") ? url.split("?")[1] : ""
    const baseUrl = url.split("?")[0]

    switch (language) {
      case "python":
        const pythonHeaders = Object.keys(headersObj).length > 0
          ? `headers = {\n${Object.entries(headersObj).map(([k, v]) => `    "${k}": "${v}"`).join(",\n")}\n}\n\n`
          : ""

        const pythonParams = queryParams
          ? `params = {\n${queryParams.split("&").map(p => {
              const [k, v] = p.split("=")
              return `    "${k}": "${decodeURIComponent(v || "")}"`
            }).join(",\n")}\n}\n\n`
          : ""

        const pythonBody = body && bodyType !== "none"
          ? `data = """${body}"""\n\n`
          : ""

        return (
          <>
            <span className="text-blue-400">import</span>
            <span className="text-white"> requests</span>
            {"\n\n"}
            <span className="text-white">url = </span>
            <span className="text-emerald-400">"{baseUrl}"</span>
            {"\n"}
            {pythonParams && (
              <>
                <span className="text-white">{pythonParams}</span>
              </>
            )}
            {pythonHeaders && (
              <>
                <span className="text-white">{pythonHeaders}</span>
              </>
            )}
            {pythonBody && (
              <>
                <span className="text-white">{pythonBody}</span>
              </>
            )}
            <span className="text-white">response = requests.</span>
            <span className="text-yellow-400">{method.toLowerCase()}</span>
            <span className="text-white">(url</span>
            {pythonParams && <span className="text-white">, params=params</span>}
            {pythonHeaders && <span className="text-white">, headers=headers</span>}
            {pythonBody && <span className="text-white">, data=data</span>}
            <span className="text-white">)</span>
            {"\n"}
            <span className="text-white">print(response.</span>
            <span className="text-yellow-400">json</span>
            <span className="text-white">())</span>
          </>
        )

      case "javascript":
        const jsHeaders = headersString
          ? `const headers = {\n      ${headersString}\n    };`
          : ""

        const jsParams = queryParams
          ? `const params = new URLSearchParams({\n      ${queryParams.split("&").map(p => {
              const [k, v] = p.split("=")
              return `"${k}": "${decodeURIComponent(v || "")}"`
            }).join(",\n      ")}\n    });`
          : ""

        const jsBody = body && bodyType !== "none"
          ? `const body = \`${body}\`;`
          : ""

        return (
          <>
            <span className="text-blue-400">const</span>
            <span className="text-white"> url = </span>
            <span className="text-emerald-400">`{baseUrl}</span>
            {queryParams && <span className="text-emerald-400">?{queryParams}</span>}
            <span className="text-emerald-400">`</span>
            <span className="text-white">;</span>
            {"\n"}
            {jsParams && (
              <>
                <span className="text-white">{jsParams}</span>
                {"\n"}
              </>
            )}
            {jsHeaders && (
              <>
                <span className="text-white">{jsHeaders}</span>
                {"\n"}
              </>
            )}
            {jsBody && (
              <>
                <span className="text-white">{jsBody}</span>
                {"\n"}
              </>
            )}
            <span className="text-white">fetch(url, {"{"}</span>
            {"\n"}
            <span className="text-white">  method: </span>
            <span className="text-emerald-400">"{method}"</span>
            <span className="text-white">,</span>
            {"\n"}
            {jsHeaders && (
              <>
                <span className="text-white">  headers,</span>
                {"\n"}
              </>
            )}
            {jsBody && (
              <>
                <span className="text-white">  body,</span>
                {"\n"}
              </>
            )}
            <span className="text-white">{"}"}).then(response {"=>"} response.</span>
            <span className="text-yellow-400">json</span>
            <span className="text-white">{"()).then(data => console."}</span>
            <span className="text-yellow-400">log</span>
            <span className="text-white">(data));</span>
          </>
        )

      case "curl":
        const curlHeaders = Object.entries(headersObj).map(([k, v]) => `-H "${k}: ${v}"`).join(" \\\n  ")
        const curlBody = body && bodyType !== "none" ? `-d '${body}'` : ""

        return (
          <>
            <span className="text-yellow-400">curl</span>
            <span className="text-white"> -X {method} \</span>
            {"\n"}
            <span className="text-white">  </span>
            <span className="text-emerald-400">"{url}"</span>
            {curlHeaders && (
              <>
                <span className="text-white"> \</span>
                {"\n"}
                <span className="text-white">  {curlHeaders}</span>
              </>
            )}
            {curlBody && (
              <>
                <span className="text-white"> \</span>
                {"\n"}
                <span className="text-white">  {curlBody}</span>
              </>
            )}
          </>
        )

      case "php":
        const phpHeaders = Object.entries(headersObj).map(([k, v]) => `    "${k}: ${v}",`).join("\n")
        const phpBody = body && bodyType !== "none" ? `$body = '${body}';\n\n` : ""

        return (
          <>
            <span className="text-blue-400">&lt;?php</span>
            {"\n\n"}
            <span className="text-white">$url = </span>
            <span className="text-emerald-400">'{url}'</span>
            <span className="text-white">;</span>
            {"\n"}
            {phpBody}
            <span className="text-white">$options = [</span>
            {"\n"}
            <span className="text-white">{"    'http' => ["}</span>
            {"\n"}
            <span className="text-white">{"        'method' => "}</span>
            <span className="text-emerald-400">'{method}'</span>
            <span className="text-white">,</span>
            {"\n"}
            <span className="text-white">{"        'header' => ["}</span>
            {"\n"}
            {phpHeaders && (
              <>
                <span className="text-white">{phpHeaders}</span>
                {"\n"}
              </>
            )}
            <span className="text-white">        ],</span>
            {"\n"}
            {phpBody && (
              <>
                <span className="text-white">{"        'content' => $body,"}</span>
                {"\n"}
              </>
            )}
            <span className="text-white">    ]</span>
            {"\n"}
            <span className="text-white">];</span>
            {"\n\n"}
            <span className="text-white">$context = stream_context_create($options);</span>
            {"\n"}
            <span className="text-white">$response = file_get_contents($url, false, $context);</span>
            {"\n"}
            <span className="text-blue-400">echo</span>
            <span className="text-white"> $response;</span>
            {"\n\n"}
            <span className="text-blue-400">?&gt;</span>
          </>
        )

      case "go":
        const goHeaders = Object.entries(headersObj).map(([k, v]) => `    "${k}": "${v}",`).join("\n")
        const goBody = body && bodyType !== "none" ? `body := strings.NewReader(\`${body}\`)\n\n    ` : ""

        return (
          <>
            <span className="text-blue-400">package</span>
            <span className="text-white"> main</span>
            {"\n\n"}
            <span className="text-blue-400">import</span>
            <span className="text-white"> (</span>
            {"\n"}
            <span className="text-white">    </span>
            <span className="text-emerald-400">"fmt"</span>
            {"\n"}
            <span className="text-white">    </span>
            <span className="text-emerald-400">"io"</span>
            {"\n"}
            {goBody && (
              <>
                <span className="text-white">    </span>
                <span className="text-emerald-400">"strings"</span>
                {"\n"}
              </>
            )}
            <span className="text-white">    </span>
            <span className="text-emerald-400">"net/http"</span>
            {"\n"}
            <span className="text-white">)</span>
            {"\n\n"}
            <span className="text-blue-400">func</span>
            <span className="text-white"> main() {"{"}</span>
            {"\n"}
            <span className="text-white">    url := </span>
            <span className="text-emerald-400">"{url}"</span>
            {"\n"}
            {goBody}
            <span className="text-white">req, err := http.NewRequest(</span>
            <span className="text-emerald-400">"{method}"</span>
            <span className="text-white">, url, </span>
            {goBody ? <span className="text-white">body</span> : <span className="text-blue-400">nil</span>}
            <span className="text-white">)</span>
            {"\n"}
            <span className="text-white">    </span>
            <span className="text-blue-400">if</span>
            <span className="text-white"> err != </span>
            <span className="text-blue-400">nil</span>
            <span className="text-white"> {"{"}</span>
            {"\n"}
            <span className="text-white">        fmt.Println(err)</span>
            {"\n"}
            <span className="text-white">        </span>
            <span className="text-blue-400">return</span>
            {"\n"}
            <span className="text-white">    {"}"}</span>
            {"\n\n"}
            {goHeaders && (
              <>
                <span className="text-white">    req.Header.Set(</span>
                <span className="text-emerald-400">"Content-Type"</span>
                <span className="text-white">, </span>
                <span className="text-emerald-400">"application/json"</span>
                <span className="text-white">)</span>
                {"\n\n"}
              </>
            )}
            <span className="text-white">    client := &http.Client{"{}"}</span>
            {"\n"}
            <span className="text-white">    resp, err := client.Do(req)</span>
            {"\n"}
            <span className="text-white">    </span>
            <span className="text-blue-400">if</span>
            <span className="text-white"> err != </span>
            <span className="text-blue-400">nil</span>
            <span className="text-white"> {"{"}</span>
            {"\n"}
            <span className="text-white">        fmt.Println(err)</span>
            {"\n"}
            <span className="text-white">        </span>
            <span className="text-blue-400">return</span>
            {"\n"}
            <span className="text-white">    {"}"}</span>
            {"\n"}
            <span className="text-white">    </span>
            <span className="text-blue-400">defer</span>
            <span className="text-white"> resp.Body.Close()</span>
            {"\n\n"}
            <span className="text-white">    body, err := io.ReadAll(resp.Body)</span>
            {"\n"}
            <span className="text-white">    </span>
            <span className="text-blue-400">if</span>
            <span className="text-white"> err != </span>
            <span className="text-blue-400">nil</span>
            <span className="text-white"> {"{"}</span>
            {"\n"}
            <span className="text-white">        fmt.Println(err)</span>
            {"\n"}
            <span className="text-white">        </span>
            <span className="text-blue-400">return</span>
            {"\n"}
            <span className="text-white">    {"}"}</span>
            {"\n"}
            <span className="text-white">    fmt.Println(string(body))</span>
            {"\n"}
            <span className="text-white">{"}"}</span>
          </>
        )

      default:
        return <span className="text-white">Code generation not available for {language}</span>
    }
  }
  const [responseFormat, setResponseFormat] = useState<ResponseFormat>("pretty")

  useEffect(() => {
    if (responseBody) {
      setResponseFormat(getAutoFormat())
    }
  }, [responseBody, responseHeaders])

  const hasResponse = Boolean(responseBody)

  const getContentType = () => {
    if (!responseHeaders) return "text/plain"
    const contentType = responseHeaders["content-type"] || responseHeaders["Content-Type"] || "text/plain"
    return contentType.split(";")[0].toLowerCase()
  }

  const isJson = () => {
    if (!responseBody) return false
    const contentType = getContentType()
    if (contentType.includes("json")) return true
    try {
      JSON.parse(responseBody)
      return true
    } catch {
      return false
    }
  }

  const isXml = () => {
    const contentType = getContentType()
    return contentType.includes("xml") || (responseBody?.trim().startsWith("<") && responseBody?.trim().endsWith(">"))
  }

  const isHtml = () => {
    const contentType = getContentType()
    return contentType === "text/html" || contentType === "application/xhtml+xml" || (responseBody?.toLowerCase().includes("<html") && responseBody?.toLowerCase().includes("</html>"))
  }

  const isBinary = () => {
    const type = getContentType()
    return (
      type.includes("image/") ||
      type.includes("audio/") ||
      type.includes("video/") ||
      type.includes("application/octet-stream") ||
      type.includes("application/pdf") ||
      type.includes("application/zip") ||
      type.includes("multipart/") ||
      type.includes("font/") ||
      type.includes("model/") ||
      responseData instanceof Blob
    )
  }

  const isImage = () => {
    return getContentType().startsWith("image/")
  }

  const isPdf = () => {
    return getContentType() === "application/pdf"
  }

  const isAudio = () => {
    return getContentType().includes("audio/")
  }

  const isVideo = () => {
    return getContentType().includes("video/")
  }

  const escapeHtml = (text: string) =>
    text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")

  const highlightJson = (jsonText: string) => {
    const escaped = escapeHtml(jsonText)
    return escaped.replace(/("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g, (match) => {
      let cls = "text-emerald-300"
      if (/^"/.test(match)) {
        cls = /:\s*$/.test(match) ? "text-sky-300" : "text-amber-300"
      } else if (/true|false/.test(match)) {
        cls = "text-violet-300"
      } else if (/null/.test(match)) {
        cls = "text-orange-300"
      } else {
        cls = "text-rose-300"
      }
      return `<span class=\"${cls}\">${match}</span>`
    })
  }

  const highlightMarkup = (text: string) => {
    const escaped = escapeHtml(text)
    return escaped
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="text-emerald-300">$1</span>')
      .replace(/(&lt;\/?[a-zA-Z0-9\-:]+)([^&]*?)(&gt;)/g, (_, tagStart, attrs, tagEnd) => {
        const highlightedAttrs = attrs.replace(/([a-zA-Z0-9\-:]+)(=)("[^"]*")/g, '<span class="text-sky-300">$1</span>$2<span class="text-amber-300">$3</span>')
        return `<span class="text-sky-300">${tagStart}</span>${highlightedAttrs}<span class="text-sky-300">${tagEnd}</span>`
      })
  }

  const getAutoFormat = (): ResponseFormat => {
    if (isJson()) return "json"
    if (isXml()) return "xml"
    if (isHtml()) return "html"
    if (isImage()) return "image"
    if (isPdf()) return "pdf"
    if (isAudio()) return "audio"
    if (isVideo()) return "video"
    if (isBinary()) return "binary"
    return "pretty"
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(responseBody ?? "")
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const handleCopyHeaders = async () => {
    try {
      const headersText = Object.entries(responseHeaders ?? {})
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n')
      await navigator.clipboard.writeText(headersText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const handleRun = async () => {
    if (!onRun) return
    await onRun()
    setActiveTab("response")
  }

  const renderResponseContent = () => {
    if (!responseBody) return null

    switch (responseFormat) {
      case "raw":
        return (
          <div className="bg-slate-900 p-4 h-full overflow-auto hide-scrollbar">
            <pre className="text-sm leading-relaxed text-white whitespace-pre-wrap break-words font-mono">
              <code>{responseBody}</code>
            </pre>
          </div>
        )

      case "pretty":
      case "json":
        if (isJson()) {
          try {
            const parsed = JSON.parse(responseBody)
            const formatted = JSON.stringify(parsed, null, 2)
            return (
              <div className="bg-slate-900 p-4 h-full overflow-auto hide-scrollbar">
                <pre
                  className="text-sm leading-relaxed whitespace-pre-wrap break-words font-mono"
                  dangerouslySetInnerHTML={{ __html: highlightJson(formatted) }}
                />
              </div>
            )
          } catch {
            return (
              <div className="bg-slate-900 p-4 h-full overflow-auto hide-scrollbar">
                <pre className="text-sm leading-relaxed text-red-400 whitespace-pre-wrap break-words font-mono">
                  <code>Error parsing JSON</code>
                </pre>
              </div>
            )
          }
        }
        return (
          <div className="bg-slate-900 p-4 h-full overflow-auto hide-scrollbar">
            <pre className="text-sm leading-relaxed text-white whitespace-pre-wrap break-words font-mono">
              <code>{responseBody}</code>
            </pre>
          </div>
        )

      case "xml":
        return (
          <div className="bg-slate-900 p-4 h-full overflow-auto hide-scrollbar">
            <pre
              className="text-sm leading-relaxed whitespace-pre-wrap break-words font-mono"
              dangerouslySetInnerHTML={{ __html: highlightMarkup(responseBody) }}
            />
          </div>
        )

      case "html":
        return (
          <div className="bg-slate-900 p-4 h-full overflow-auto hide-scrollbar">
            <pre
              className="text-sm leading-relaxed whitespace-pre-wrap break-words font-mono"
              dangerouslySetInnerHTML={{ __html: highlightMarkup(responseBody) }}
            />
          </div>
        )

      case "preview":
        if (isHtml()) {
          return (
            <iframe
              srcDoc={responseBody}
              className="w-full h-full border-0"
              title="HTML Preview"
            />
          )
        } else if (isImage() || isPdf() || isAudio() || isVideo()) {
          if (responseData instanceof Blob) {
            const url = URL.createObjectURL(responseData)
            if (isImage()) {
              return (
                <div className="flex h-full items-center justify-center">
                  <img src={url} alt="Response image" className="max-h-full max-w-full object-contain" />
                </div>
              )
            }
            if (isPdf()) {
              return (
                <iframe src={url} className="w-full h-full border-0" title="PDF Preview" />
              )
            }
            if (isAudio()) {
              return (
                <div className="flex items-center justify-center h-full">
                  <audio controls className="w-full max-w-lg">
                    <source src={url} />
                    Your browser does not support the audio element.
                  </audio>
                </div>
              )
            }
            if (isVideo()) {
              return (
                <div className="flex items-center justify-center h-full">
                  <video controls className="w-full max-w-lg">
                    <source src={url} />
                    Your browser does not support the video element.
                  </video>
                </div>
              )
            }
          }
        } else if (isJson()) {
          try {
            const parsed = JSON.parse(responseBody)
            return (
              <div className="bg-slate-900 p-4 h-full overflow-auto hide-scrollbar">
                <pre className="text-sm leading-relaxed text-white whitespace-pre-wrap break-words font-mono">
                  <code>{JSON.stringify(parsed, null, 2)}</code>
                </pre>
              </div>
            )
          } catch {
            return (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>Preview not available for this content type</p>
              </div>
            )
          }
        }
        return (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Preview not available for this content type</p>
          </div>
        )

      case "visualize":
        if (isJson()) {
          try {
            const data = JSON.parse(responseBody)
            if (Array.isArray(data)) {
              return (
                <div className="rounded-lg border p-4 h-full overflow-auto hide-scrollbar">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold">Array Visualization ({data.length} items)</h3>
                  </div>
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        {Object.keys(data[0] || {}).map((key) => (
                          <th key={key} className="text-left p-3 font-medium border-r last:border-r-0">{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.slice(0, 20).map((item, index) => (
                        <tr key={index} className="border-b hover:bg-muted/30">
                          {Object.values(item).map((value: any, i) => (
                            <td key={i} className="p-3 border-r last:border-r-0 max-w-xs truncate" title={String(value)}>
                              {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.length > 20 && (
                    <p className="text-xs text-muted-foreground mt-4 text-center">Showing first 20 rows of {data.length} total</p>
                  )}
                </div>
              )
            } else {
              // Pour les objets, afficher une visualisation en cartes
              return (
                <div className="rounded-lg border p-4 h-full overflow-auto hide-scrollbar">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold">Object Visualization</h3>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {Object.entries(data).map(([key, value]) => (
                      <div key={key} className="border rounded-lg p-4 bg-card">
                        <div className="font-medium text-sm text-muted-foreground mb-2">{key}</div>
                        <div className="text-sm break-words">
                          {typeof value === 'object' ? (
                            <pre className="text-xs bg-muted p-2 rounded overflow-auto hide-scrollbar max-h-32">
                              {JSON.stringify(value, null, 2)}
                            </pre>
                          ) : (
                            String(value)
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            }
          } catch {
            return (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                <p>Cannot visualize this data</p>
              </div>
            )
          }
        }
        return (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Visualization not available for this content type</p>
          </div>
        )

      case "image":
        if (responseData instanceof Blob) {
          const url = URL.createObjectURL(responseData)
          return (
            <div className="flex h-full items-center justify-center">
              <img src={url} alt="Response image" className="max-h-full max-w-full object-contain" />
            </div>
          )
        }
        return (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <FileImage className="size-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No image available</p>
          </div>
        )

      case "pdf":
        if (responseData instanceof Blob) {
          const url = URL.createObjectURL(responseData)
          return (
            <div className="flex h-full flex-col">
              <iframe src={url} className="h-full w-full border-0" title="PDF Preview" />
            </div>
          )
        }
        return (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <FileText className="size-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No PDF available</p>
          </div>
        )

      case "binary":
        if (responseData instanceof Blob) {
          const url = URL.createObjectURL(responseData)
          return (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <FileImage className="size-12 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Binary content ({responseData.size} bytes)</p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  const a = document.createElement('a')
                  a.href = url
                  a.download = 'response'
                  a.click()
                  URL.revokeObjectURL(url)
                }}
              >
                <Download className="size-4 mr-2" />
                Download
              </Button>
            </div>
          )
        }
        return (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <FileImage className="size-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Binary content</p>
            <Button variant="outline" size="sm" disabled>
              <Download className="size-4 mr-2" />
              Download
            </Button>
          </div>
        )

      case "audio":
      case "video":
        if (responseData instanceof Blob) {
          const url = URL.createObjectURL(responseData)
          if (isAudio()) {
            return (
              <div className="flex items-center justify-center h-full">
                <audio controls className="w-full max-w-md">
                  <source src={url} />
                  Your browser does not support the audio element.
                </audio>
              </div>
            )
          } else if (isVideo()) {
            return (
              <div className="flex items-center justify-center h-full">
                <video controls className="w-full max-w-md">
                  <source src={url} />
                  Your browser does not support the video element.
                </video>
              </div>
            )
          }
        }
        return (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Media playback not available</p>
          </div>
        )

      default:
        return (
          <div className="bg-slate-900 p-4 h-full overflow-auto hide-scrollbar">
            <pre className="text-sm leading-relaxed text-white whitespace-pre-wrap break-words font-mono">
              <code>{responseBody}</code>
            </pre>
          </div>
        )
    }
  }

  return (
    <div className="flex h-full flex-col bg-muted/20">
      {/* Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Status:</span>
          {isLoading ? (
            <div className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1">
              <Loader2 className="size-3.5 animate-spin text-amber-500" />
              <span className="text-xs font-semibold text-amber-600">Requête en cours…</span>
            </div>
          ) : hasResponse ? (
            <>
              <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1">
                <CheckCircle className="size-3.5 text-emerald-500" />
                <span className="text-xs font-semibold text-emerald-600">{responseStatus ?? 200} OK</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
                <Clock className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">{responseTime ?? 0}ms</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
                <FileText className="size-3.5 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">{responseSize ?? "0 B"}</span>
              </div>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">No request sent</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={handleRun}
            disabled={isLoading}
            size="sm"
            className="h-8 gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
          >
            {isLoading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            {isLoading ? "Running..." : "Run"}
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Download className="size-3.5" />
            Export
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-border px-4">
          <TabsList className="h-auto gap-0 bg-transparent p-0">
            <TabsTrigger
              value="response"
              className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-medium data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Response
            </TabsTrigger>
            <TabsTrigger
              value="headers"
              className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-medium data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Headers
            </TabsTrigger>
            <TabsTrigger
              value="code"
              className="rounded-none border-b-2 border-transparent px-4 py-2.5 text-sm font-medium data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Code
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Response Tab */}
        <TabsContent value="response" className="m-0 min-h-0 flex-1 overflow-auto hide-scrollbar p-4">
          {isLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-sm text-muted-foreground">
              <Loader2 className="size-12 animate-spin text-foreground" />
              <div>
                <p className="font-semibold text-foreground">Requête en cours</p>
                <p>Le serveur répond, patiente une seconde.</p>
              </div>
            </div>
          ) : hasResponse ? (
            <div className="flex flex-col h-full">
              {/* Format Selector and Copy Button */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground">Format:</span>
                  <Select value={responseFormat} onValueChange={(value: ResponseFormat) => setResponseFormat(value)}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {formatOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div className="flex items-center gap-2">
                            <option.icon className="size-4" />
                            {option.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="size-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  {copied ? "Copied!" : "Copy Response"}
                </Button>
              </div>

              {/* Response Content */}
              <div className="flex-1 overflow-auto hide-scrollbar">
                {renderResponseContent()}
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="rounded-full bg-muted p-4">
                <Play className="size-8 text-muted-foreground" />
              </div>
              <p className="mt-4 text-sm font-medium text-foreground">No response yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Click the Run button to execute the request</p>
            </div>
          )}
        </TabsContent>

        {/* Headers Tab */}
        <TabsContent value="headers" className="m-0 min-h-0 flex-1 overflow-auto hide-scrollbar p-4">
          {hasResponse ? (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => handleCopyHeaders()}
                >
                  {copied ? (
                    <Check className="size-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                  {copied ? "Copied!" : "Copy Headers"}
                </Button>
              </div>
              <div className="space-y-2">
                {Object.entries(responseHeaders ?? {}).map(([key, value]) => (
                  <div key={key} className="flex items-start gap-3 rounded-md bg-muted/50 px-3 py-2">
                    <span className="shrink-0 font-mono text-xs font-semibold text-foreground">{key}:</span>
                    <span className="font-mono text-xs text-muted-foreground break-all">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="text-sm text-muted-foreground">Response headers will appear here after running</p>
            </div>
          )}
        </TabsContent>

        {/* Code Tab */}
        <TabsContent value="code" className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden p-4">
          {/* Language Selector */}
          <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {languages.map((lang) => (
                <button
                  key={lang.id}
                  onClick={() => setSelectedLang(lang.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedLang === lang.id
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={handleCopy}
            >
              {copied ? (
                <Check className="size-3.5 text-emerald-500" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>

              <div className="min-h-0 flex-1 overflow-auto hide-scrollbar rounded-lg bg-slate-900 p-4">
            <pre className="text-sm leading-relaxed">
              <code>{generateCodeSnippet(selectedLang)}</code>
            </pre>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}