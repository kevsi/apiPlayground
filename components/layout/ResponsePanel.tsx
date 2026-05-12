"use client"

import { useMemo, useState } from "react"
import { CheckCircle, Clock, FileText, Download, Copy, Check, Play, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { RequestItem } from "@/hooks/use-request-store"

const languages = [
  { id: "python", label: "Python" },
  { id: "javascript", label: "JavaScript" },
  { id: "curl", label: "cURL" },
  { id: "php", label: "PHP" },
  { id: "go", label: "Go" },
]

interface ResponseData {
  status?: number
  time?: number
  size?: string
  headers?: Record<string, string>
  body?: unknown
  error?: string
}

interface ResponsePanelProps {
  request?: RequestItem
  response?: ResponseData
  isRunning?: boolean
  onRun?: () => void
  onExplainError?: (error: string, status: number) => void
}

function buildFullUrl(request?: RequestItem) {
  if (!request) return ""
  const query = (request.queryParams ?? [])
    .filter((param) => param.key.trim() && param.value.trim())
    .map((param) => `${encodeURIComponent(param.key)}=${encodeURIComponent(param.value)}`)
    .join("&")

  if (!query) return request.url
  return `${request.url}${request.url.includes("?") ? "&" : "?"}${query}`
}

function buildCodeSnippet(request?: RequestItem, language = "python") {
  if (!request) return "No request selected."
  const url = buildFullUrl(request)
  const headers = request.headers ?? {}
  const body = request.body ? request.body : ""
  const serializedHeaders = Object.entries(headers).reduce((acc, [name, value]) => {
    acc += `  \"${name}\": \"${value}\",\n`
    return acc
  }, "")
  const headerObject = Object.keys(headers).length
    ? `{
${serializedHeaders}}`
    : "{}"

  switch (language) {
    case "javascript":
      return `const url = "${url}"
const options = {
  method: "${request.method}",
  headers: ${JSON.stringify(headers, null, 2)}${request.method !== "GET" && body ? `,\n  body: JSON.stringify(${body})` : ""}
}

const response = await fetch(url, options)
const data = await response.json()
console.log(data)`
    case "curl":
      return [`curl -X ${request.method} "${url}"`,
        ...Object.entries(headers).map(([name, value]) => `-H "${name}: ${value}"`),
        request.method !== "GET" && body ? `-d '${body}'` : "",
      ]
        .filter(Boolean)
        .join(" \\\n")
    case "php":
      return `<?php
$url = "${url}"
$headers = [\n${Object.entries(headers)
  .map(([name, value]) => `    \"${name}: ${value}\"`)
  .join(",\n")}
]
$ch = curl_init($url)
curl_setopt($ch, CURLOPT_CUSTOMREQUEST, "${request.method}")
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers)${request.method !== "GET" && body ? `\ncurl_setopt($ch, CURLOPT_POSTFIELDS, '${body}')` : ""}
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true)
$response = curl_exec($ch)
curl_close($ch)
echo $response`
    case "go":
      return `package main

import (
    \"fmt\"
    \"net/http\"
    \"strings\"
)

func main() {
    client := &http.Client{}
    req, _ := http.NewRequest("${request.method}", "${url}", strings.NewReader(${body ? `\"${String(body).replace(/\"/g, `\\\"`)}\"` : `\"\"`}))
${Object.entries(headers)
  .map(([name, value]) => `    req.Header.Set("${name}", "${value}")`)
  .join("\n")}
    resp, _ := client.Do(req)
    defer resp.Body.Close()
    fmt.Println(resp.Status)
}`
    default:
      return `import requests

url = "${url}"
headers = ${headerObject}${request.method !== "GET" && body ? `\nresponse = requests.${request.method.toLowerCase()}(url, headers=headers, json=${body})` : `\nresponse = requests.${request.method.toLowerCase()}(url, headers=headers)`}
print(response.json())`
  }
}

function getStatusText(response?: ResponseData) {
  if (response?.error) return response.error
  if (response?.status) return `${response.status}`
  return "No response"
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export function ResponsePanel({ request, response, isRunning = false, onRun, onExplainError }: ResponsePanelProps) {
  const [selectedLang, setSelectedLang] = useState("python")
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState("code")

  const codeSnippet = useMemo(() => buildCodeSnippet(request, selectedLang), [request, selectedLang])

  const responseBody = response?.error
    ? response.error
    : response?.body
    ? typeof response.body === "string"
      ? response.body
      : JSON.stringify(response.body, null, 2)
    : ""

  const statusLabel = getStatusText(response)
  const responseTime = response?.time ? `${response.time}ms` : "--"
  const responseSize = response?.size ?? "--"

  const handleCopy = async () => {
    if (!navigator.clipboard) return
    await navigator.clipboard.writeText(codeSnippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex h-full flex-col bg-muted/20">
      {/* Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Status:</span>
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1">
            <CheckCircle className="size-3.5 text-emerald-500" />
            <span className="text-xs font-semibold text-emerald-600">{statusLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
            <Clock className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">{responseTime}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
            <FileText className="size-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">{responseSize}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={onRun}
            disabled={isRunning}
            size="sm"
            className="h-8 gap-1.5 bg-emerald-600 text-xs text-white hover:bg-emerald-700"
          >
            {isRunning ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            {isRunning ? "Running..." : "Run"}
          </Button>
          {response?.error && onExplainError && (
            <Button
              onClick={() => onExplainError(response.error!, response.status || 0)}
              size="sm"
              variant="outline"
              className="h-8 gap-1.5 text-xs"
            >
              <Sparkles className="size-3.5" />
              Explain Error
            </Button>
          )}
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

        <TabsContent value="response" className="m-0 min-h-0 flex-1 overflow-auto p-4">
          {responseBody ? (
            <div className="rounded-lg bg-slate-900 p-4">
              <pre className="text-sm leading-relaxed text-white whitespace-pre-wrap break-words">
                <code>{responseBody}</code>
              </pre>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="rounded-full bg-muted p-4">
                <Play className="size-8 text-muted-foreground" />
              </div>
              <p className="mt-4 text-sm font-medium text-foreground">No response yet</p>
              <p className="mt-1 text-xs text-muted-foreground">Press Run to execute the active request</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="headers" className="m-0 min-h-0 flex-1 overflow-auto p-4">
          {response?.headers ? (
            <div className="space-y-2">
              {Object.entries(response.headers).map(([key, value]) => (
                <div key={key} className="flex items-start gap-3 rounded-md bg-muted/50 px-3 py-2">
                  <span className="shrink-0 font-mono text-xs font-semibold text-foreground">{key}:</span>
                  <span className="font-mono text-xs text-muted-foreground">{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <p className="text-sm text-muted-foreground">Response headers will appear here after running</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="code" className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden p-4">
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
              {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-slate-900 p-4">
            <pre className="text-sm leading-relaxed whitespace-pre-wrap break-words text-white">
              <code>{codeSnippet}</code>
            </pre>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
