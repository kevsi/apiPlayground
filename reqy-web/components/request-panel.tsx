"use client"

import { useState, useMemo, useRef } from "react"
import { Plus, Trash2, Play, Code, Braces, Check, Copy, Loader2, FlaskConical } from "lucide-react"
import { cn } from "@/lib/utils"
import type { HttpMethod } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"

import type { BodyType, AuthType, QueryParam, Header } from "@/lib/request-executor"
import type { RequestTestAssertion, AssertionType } from "@/lib/types"
import type { Assertion } from "@/lib/test-runner/types"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { GraphQLBodyEditor } from "@/components/graphql-body-editor"
import { GraphQLIntrospectButton } from "@/components/graphql-introspect-button"
import { AssertionEditor } from "@/components/assertion-editor"
import { ScriptEditor } from "@/components/script-editor"

interface RequestPanelProps {
  method: HttpMethod
  url: string
  queryParams: QueryParam[]
  headers: Header[]
  body: string
  bodyType: BodyType
  authType: AuthType
  authToken: string
  assertions?: RequestTestAssertion[]
  runnerAssertions?: Assertion[]
  preRequestScript?: string
  postResponseScript?: string
  protocol?: "rest" | "graphql"
  graphql?: { query: string; variables: string; operationName?: string }
  onMethodChange: (method: HttpMethod) => void
  onUrlChange: (url: string) => void
  onQueryParamsChange: (queryParams: QueryParam[]) => void
  onHeadersChange: (headers: Header[]) => void
  onBodyChange: (body: string) => void
  onBodyTypeChange: (bodyType: BodyType) => void
  onAuthChange: (type: AuthType, token: string) => void
  onAssertionsChange?: (assertions: RequestTestAssertion[]) => void
  onRunnerAssertionsChange?: (assertions: Assertion[]) => void
  onPreRequestScriptChange?: (script: string) => void
  onPostResponseScriptChange?: (script: string) => void
  onProtocolChange?: (protocol: "rest" | "graphql") => void
  onGraphqlChange?: (graphql: { query: string; variables: string; operationName?: string }) => void
  onRunTests?: () => void
  onSend: () => Promise<void>
  isLoading?: boolean
  variableNames?: string[]
}

export function RequestPanel({
  method,
  url,
  queryParams,
  headers,
  body,
  bodyType,
  authType,
  authToken,
  assertions,
  runnerAssertions,
  preRequestScript,
  postResponseScript,
  protocol,
  graphql,
  onMethodChange,
  onUrlChange,
  onQueryParamsChange,
  onHeadersChange,
  onBodyChange,
  onBodyTypeChange,
  onAuthChange,
  onAssertionsChange,
  onRunnerAssertionsChange,
  onPreRequestScriptChange,
  onPostResponseScriptChange,
  onProtocolChange,
  onGraphqlChange,
  onRunTests,
  onSend,
  isLoading,
  variableNames,
}: RequestPanelProps) {
  const addQueryParam = () => {
    onQueryParamsChange([...queryParams, { key: "", value: "" }])
  }

  const removeQueryParam = (index: number) => {
    onQueryParamsChange(queryParams.filter((_, i) => i !== index))
  }

  const updateQueryParam = (index: number, field: "key" | "value", value: string) => {
    onQueryParamsChange(
      queryParams.map((param, i) => (i === index ? { ...param, [field]: value } : param)),
    )
  }

  const addHeader = () => {
    onHeadersChange([...headers, { key: "", value: "" }])
  }

  const removeHeader = (index: number) => {
    onHeadersChange(headers.filter((_, i) => i !== index))
  }

  const updateHeader = (index: number, field: "key" | "value", value: string) => {
    onHeadersChange(
      headers.map((header, i) => (i === index ? { ...header, [field]: value } : header)),
    )
  }

  const [exportFormat, setExportFormat] = useState<"curl" | "fetch">("curl")
  const [exportCopied, setExportCopied] = useState(false)
  const urlInputRef = useRef<HTMLInputElement>(null)

  const hasUrl = url.trim().length > 0

  const normalizeUrl = (candidateUrl: string) => {
    const safeUrl = candidateUrl.trim()
      .replace(/%20/gi, " ")
      .replace(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)(?:\s+|%20)+/i, "")
      .replace(/^(https?:)\/(?!\/)/i, "$1://")
      .replace(/^(https?:)\s*:\s*\/\s*\/+/, "$1://")

    if (safeUrl.startsWith("//")) {
      return `https:${safeUrl}`
    }

    if (!/^https?:\/\//i.test(safeUrl)) {
      const localhostLike = /^(localhost|127(?:\.[0-9]{1,3}){0,3}|\[::1\])(?::\d+)?(?:[\/\?#]|$)/i.test(safeUrl)
      const ipLike = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?::\d+)?(?:[\/\?#]|$)/.test(safeUrl)
      const hostLike = /^[^/?#\s]+\.[^/?#\s]+/.test(safeUrl)

      if (localhostLike || ipLike) {
        return `http://${safeUrl}`
      }
      if (hostLike) {
        return `https://${safeUrl}`
      }
    }

    return safeUrl
  }

  const buildFullUrl = () => {
    try {
      const finalUrl = new URL(normalizeUrl(url))
      queryParams.forEach((param) => {
        if (param.key.trim() && param.value.trim()) {
          finalUrl.searchParams.set(param.key.trim(), param.value.trim())
        }
      })
      return finalUrl.toString()
    } catch {
      const queryString = queryParams
        .filter((param) => param.key.trim() && param.value.trim())
        .map(
          (param) => `${encodeURIComponent(param.key.trim())}=${encodeURIComponent(param.value.trim())}`,
        )
        .join("&")
      if (!queryString) return url
      return url + (url.includes("?") ? "&" : "?") + queryString
    }
  }

  const buildAuthHeaders = () => {
    const authHeaders: Array<[string, string]> = []
    if (authType !== "none" && authToken.trim()) {
      if (authType === "bearer" || authType === "oauth2") {
        authHeaders.push(["Authorization", `Bearer ${authToken.trim()}`])
      } else if (authType === "basic") {
        authHeaders.push(["Authorization", `Basic ${authToken.trim()}`])
      } else if (authType === "api-key") {
        authHeaders.push(["x-api-key", authToken.trim()])
      }
    }
    return authHeaders
  }

  const buildRequestHeaders = () => {
    const requestHeaders: Array<[string, string]> = [...buildAuthHeaders()]
    headers.forEach((header) => {
      if (header.key.trim() && header.value.trim()) {
        requestHeaders.push([header.key.trim(), header.value.trim()])
      }
    })
    return requestHeaders
  }

  const buildCurlCommand = () => {
    const finalUrl = buildFullUrl()
    const headerLines = buildRequestHeaders().map(
      ([key, value]) => `-H "${key}: ${value.replace(/"/g, '\\"')}"`,
    )
    const bodyText = body && method !== "GET" ? `--data-raw '${body.replace(/'/g, "'\\''")}'` : ""
    const parts = ["curl", `-X ${method}`, ...headerLines]
    if (bodyText) parts.push(bodyText)
    parts.push(`"${finalUrl}"`)
    return parts.join(" \\\n      ")
  }

  const buildFetchCommand = () => {
    const finalUrl = buildFullUrl()
    const headersObject = Object.fromEntries(buildRequestHeaders())
    const bodyPart = body && method !== "GET" ? `  body: ${JSON.stringify(body)},\n` : ""
    return `fetch("${finalUrl}", {
  method: "${method}",
  headers: ${JSON.stringify(headersObject, null, 2)},
${bodyPart}})
  .then((res) => res.text())
  .then((text) => console.log(text));`
  }

  const getExportSnippet = () => (exportFormat === "curl" ? buildCurlCommand() : buildFetchCommand())

  const handleCopyExport = async () => {
    try {
      await navigator.clipboard.writeText(getExportSnippet())
      setExportCopied(true)
      setTimeout(() => setExportCopied(false), 2000)
    } catch {
      setExportCopied(false)
    }
  }

  const handleFormatJson = () => {
    if (bodyType !== "json" || !body.trim()) return
    try {
      const parsed = JSON.parse(body)
      onBodyChange(JSON.stringify(parsed, null, 2))
    } catch {
      // invalid json, do nothing
    }
  }

  const isValidJson = useMemo(() => {
    if (!body.trim() || bodyType !== "json") return null
    try { JSON.parse(body); return true } catch { return false }
  }, [body, bodyType])

  const methodColors: Record<HttpMethod, string> = {
    GET: "bg-emerald-500/25 text-emerald-600 border-emerald-500/30",
    POST: "bg-blue-500/25 text-blue-600 border-blue-500/30",
    PUT: "bg-amber-500/25 text-amber-600 border-amber-500/30",
    PATCH: "bg-purple-500/25 text-purple-600 border-purple-500/30",
    DELETE: "bg-red-500/25 text-red-600 border-red-500/30",
    HEAD: "bg-slate-500/25 text-slate-600 border-slate-500/30",
    OPTIONS: "bg-slate-500/25 text-slate-600 border-slate-500/30",
    GRAPHQL: "bg-pink-500/25 text-pink-600 border-pink-500/30",
  }

  const methodBgMap: Record<HttpMethod, string> = {
    GET: "bg-emerald-500",
    POST: "bg-blue-500",
    PUT: "bg-amber-500",
    PATCH: "bg-purple-500",
    DELETE: "bg-red-500",
    HEAD: "bg-slate-500",
    OPTIONS: "bg-slate-500",
    GRAPHQL: "bg-pink-500",
  }

  const bodyTypeLabels: Record<BodyType, string> = {
    json: "JSON",
    "form-data": "Form Data",
    "x-www-form": "x-www-form",
    raw: "Raw",
    binary: "Binary",
  }

  const authTypeLabels: Record<AuthType, string> = {
    none: "No Auth",
    bearer: "Bearer Token",
    basic: "Basic Auth",
    "api-key": "API Key",
    oauth2: "OAuth 2.0",
  }

  return (
    <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
      {/* Request URL Section — monumental command bar */}
      <div className="p-3 pb-1">
        {/* URL Bar — prominent glow container */}
        <div className="flex items-center gap-2 rounded-lg border border-input/50 px-3 py-1.5 transition-all duration-200">
          {/* Method select — compact */}
          <Select
            value={method}
            onValueChange={(value) => onMethodChange(value as HttpMethod)}
          >
            <SelectTrigger
              aria-label="HTTP method"
              className={cn(
                "shrink-0 rounded-lg border-0 px-2.5 py-1 text-[11px] font-bold font-mono cursor-pointer transition-all duration-200 outline-none ring-offset-0 focus:ring-0 focus:ring-offset-0 h-auto w-auto gap-1 [&>svg]:size-3.5",
                methodBgMap[method],
                "text-white",
              )}
            >
              <SelectValue placeholder={method} />
            </SelectTrigger>
            <SelectContent>
              {(["GET", "POST", "PUT", "PATCH", "DELETE"] as const).map((m) => (
                <SelectItem key={m} value={m}>
                  <span className="flex items-center gap-2">
                    <span className={cn(
                      "size-1.5 rounded-full shrink-0",
                      m === "GET" && "bg-emerald-500",
                      m === "POST" && "bg-blue-500",
                      m === "PUT" && "bg-amber-500",
                      m === "PATCH" && "bg-purple-500",
                      m === "DELETE" && "bg-red-500",
                    )} />
                    {m}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* URL Input — studio style */}
          <div className="relative flex-1">
            <input
              ref={urlInputRef}
              type="text"
              value={url}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder="https://api.example.com/endpoint"
              className="w-full bg-transparent px-1 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/40 outline-none"
            />
          </div>

          {/* Variables dropdown */}
          {variableNames && variableNames.length > 0 && (
            <div className="relative">
              <select
                aria-label="Insert variable"
                className="h-8 rounded-md border border-input/50 bg-muted/30 px-2 text-[11px] font-mono text-muted-foreground cursor-pointer outline-none hover:border-muted-foreground/30 appearance-none"
                value=""
                onChange={(e) => {
                  const name = e.target.value
                  if (name && urlInputRef.current) {
                    const input = urlInputRef.current
                    const start = input.selectionStart ?? url.length
                    const end = input.selectionEnd ?? url.length
                    const newUrl = url.slice(0, start) + `{{${name}}}` + url.slice(end)
                    onUrlChange(newUrl)
                    requestAnimationFrame(() => {
                      const pos = start + name.length + 4
                      input.setSelectionRange(pos, pos)
                      input.focus()
                    })
                  }
                  e.target.value = ""
                }}
              >
                <option value="" disabled>Variables</option>
                {variableNames.map((n) => (
                  <option key={n} value={n}>{`{{${n}}}`}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Variables in URL */}
        {hasUrl && url.includes("{{") && (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 animate-slide-up">
            {Array.from(url.matchAll(/\{\{\s*(\w+)\s*\}\}/g)).map((match) => {
              const varName = match[1]
              return (
                <span
                  key={varName}
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-mono font-medium text-primary border border-primary/20"
                >
                  <Braces className="size-3" />
                  {varName}
                </span>
              )
            })}
            {url.match(/\{\{[^}]+\}\}/g)?.some((m) => !m.match(/^\{\{\s*\w+\s*\}\}$/)) && (
              <span className="text-[11px] font-medium text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md">
                Invalid variable syntax
              </span>
            )}
          </div>
        )}
        {!hasUrl && (
          <p className="mt-1 text-xs text-muted-foreground/70">Enter a valid URL to enable sending.</p>
        )}

        {/* Send & Export row — Send as prominent primary action */}
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <Button
            disabled={!hasUrl || isLoading}
            onClick={async () => {
              if (!hasUrl) return
              await onSend()
            }}
            className={cn(
              "h-8 gap-2 px-4 text-sm font-semibold transition-all duration-200",
              methodBgMap[method],
              "text-white hover:opacity-85",
            )}
            title={!hasUrl ? 'URL required to send' : 'Send request'}
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin fill-current" />
            ) : (
              <Play className="size-4 fill-current" />
            )}
            <span>{isLoading ? "Sending..." : "Send"}</span>
          </Button>

          <div className="flex items-center gap-1.5 ml-auto">
            <Select value={exportFormat} onValueChange={(value) => setExportFormat(value as "curl" | "fetch")}>
              <SelectTrigger className="h-8 w-auto gap-2 border-input bg-muted/30 text-xs font-medium text-muted-foreground transition-all duration-200 hover:border-muted-foreground/30">
                <Code className="size-3.5" />
                <SelectValue placeholder="Export" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="curl">cURL</SelectItem>
                <SelectItem value="fetch">Fetch</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={handleCopyExport}
              className={cn(
                "h-8 gap-1.5 text-xs font-medium transition-all duration-200",
                exportCopied ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/10" : ""
              )}
            >
              {exportCopied ? (
                <>
                  <Check className="size-3.5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  Copy {exportFormat === "curl" ? "cURL" : "Fetch"}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Accordion — collapsed sections, expand to configure */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <Accordion type="multiple" className="space-y-1">
          {/* Query Params */}
          <AccordionItem value="query-params" className="border border-border rounded-lg px-4 ">
            <AccordionTrigger className="py-3 text-xs font-semibold uppercase tracking-wider hover:no-underline [&[data-state=open]>svg]:rotate-180">
              <span className="flex items-center gap-2">
                Query Params
                {queryParams.length > 0 && (
                  <span className="rounded-full bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-mono font-normal">
                    {queryParams.length}
                  </span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                {queryParams.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-6 text-xs text-muted-foreground/60">
                    <span>No parameters added yet</span>
                  </div>
                )}
                {queryParams.map((param, index) => (
                  <div key={index} className="group/param flex items-center gap-2 rounded-lg transition-all duration-200 hover:bg-muted/20 -mx-1 px-1">
                    <Input
                      type="text"
                      value={param.key}
                      onChange={(e) => updateQueryParam(index, "key", e.target.value)}
                      placeholder="Key"
                      className="flex-1 h-9 border-input bg-muted/20 text-sm transition-all duration-200 focus:bg-muted/40"
                    />
                    <span className="shrink-0 text-muted-foreground/30">=</span>
                    <Input
                      type="text"
                      value={param.value}
                      onChange={(e) => updateQueryParam(index, "value", e.target.value)}
                      placeholder="Value"
                      className="flex-1 h-9 border-input bg-muted/20 text-sm transition-all duration-200 focus:bg-muted/40"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeQueryParam(index)}
                      className="shrink-0 size-8 text-muted-foreground/50 hover:text-destructive opacity-0 group-hover/param:opacity-100 transition-all duration-200"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                onClick={addQueryParam}
                className="mt-3 w-full border-dashed border-muted-foreground/20 text-muted-foreground/70 hover:text-foreground hover:border-muted-foreground/40 transition-all duration-200 h-9 text-xs font-medium"
              >
                <Plus className="size-3.5 mr-1" />
                Add Parameter
              </Button>
            </AccordionContent>
          </AccordionItem>

          {/* Headers */}
          <AccordionItem value="headers" className="border border-border rounded-lg px-4 ">
            <AccordionTrigger className="py-3 text-xs font-semibold uppercase tracking-wider hover:no-underline [&[data-state=open]>svg]:rotate-180">
              <span className="flex items-center gap-2">
                Headers
                {headers.length > 0 && (
                  <span className="rounded-full bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-mono font-normal">
                    {headers.length}
                  </span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                {headers.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-6 text-xs text-muted-foreground/60">
                    <span>No headers added yet</span>
                  </div>
                )}
                {headers.map((header, index) => (
                  <div key={index} className="group/header flex items-center gap-2 rounded-lg transition-all duration-200 hover:bg-muted/20 -mx-1 px-1">
                    <Input
                      type="text"
                      value={header.key}
                      onChange={(e) => updateHeader(index, "key", e.target.value)}
                      placeholder="Header Name"
                      className="flex-1 h-9 border-input bg-muted/20 text-sm font-medium transition-all duration-200 focus:bg-muted/40"
                    />
                    <span className="shrink-0 text-muted-foreground/30">:</span>
                    <Input
                      type="text"
                      value={header.value}
                      onChange={(e) => updateHeader(index, "value", e.target.value)}
                      placeholder="Value"
                      className="flex-1 h-9 border-input bg-muted/20 text-sm transition-all duration-200 focus:bg-muted/40"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeHeader(index)}
                      className="shrink-0 size-8 text-muted-foreground/50 hover:text-destructive opacity-0 group-hover/header:opacity-100 transition-all duration-200"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                onClick={addHeader}
                className="mt-3 w-full border-dashed border-muted-foreground/20 text-muted-foreground/70 hover:text-foreground hover:border-muted-foreground/40 transition-all duration-200 h-9 text-xs font-medium"
              >
                <Plus className="size-3.5 mr-1" />
                Add Header
              </Button>
            </AccordionContent>
          </AccordionItem>

          {/* Body */}
          <AccordionItem value="body" className="border border-border rounded-lg px-4 ">
            <AccordionTrigger className="py-3 text-xs font-semibold uppercase tracking-wider hover:no-underline [&[data-state=open]>svg]:rotate-180">
              <span className="flex items-center gap-2">
                Body
                <span className="text-[10px] font-mono font-normal text-muted-foreground/70">
                  — {bodyTypeLabels[bodyType]}
                </span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <Tabs
                value={protocol ?? "rest"}
                onValueChange={(v) => onProtocolChange?.(v as "rest" | "graphql")}
              >
                <TabsList className="mb-3">
                  <TabsTrigger value="rest" className="text-xs">REST</TabsTrigger>
                  <TabsTrigger value="graphql" className="text-xs">GraphQL</TabsTrigger>
                </TabsList>
                <TabsContent value="rest" className="mt-0">
                  <div className="flex items-center gap-3 mb-3">
                    <Select value={bodyType} onValueChange={(value) => onBodyTypeChange(value as BodyType)}>
                      <SelectTrigger className="w-32 h-9 border-input bg-muted/20 text-xs font-medium transition-all duration-200 hover:border-muted-foreground/30">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="json">
                          <span className="font-mono">JSON</span>
                        </SelectItem>
                        <SelectItem value="form-data">Form Data</SelectItem>
                        <SelectItem value="x-www-form">x-www-form</SelectItem>
                        <SelectItem value="raw">Raw</SelectItem>
                        <SelectItem value="binary">Binary</SelectItem>
                      </SelectContent>
                    </Select>
                    {bodyType === "json" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleFormatJson}
                        className="h-9 gap-1.5 border-input bg-muted/20 text-xs font-medium transition-all duration-200 hover:border-muted-foreground/30"
                        title="Format JSON"
                      >
                        <Code className="size-3.5" />
                        Format
                      </Button>
                    )}
                    {bodyType === "json" && body.trim() && isValidJson !== null && (
                      <span className={cn(
                        "text-[11px] font-mono font-medium transition-colors duration-200",
                        isValidJson ? "text-emerald-500" : "text-red-500"
                      )}>
                        {isValidJson ? "Valid" : "Invalid"}
                      </span>
                    )}
                  </div>
                  <div className="h-48 overflow-auto rounded-lg border border-border bg-code-bg flex flex-col transition-all duration-200 focus-within:border-primary/30 focus-within:shadow-[0_0_0_2px] focus-within:shadow-primary/10">
                    <div className="flex items-center justify-between bg-code-header-bg px-4 py-1.5 border-b border-border/50">
                      <div className="flex items-center gap-1.5">
                        <span className="size-2.5 rounded-full bg-red-500/70" />
                        <span className="size-2.5 rounded-full bg-yellow-500/70" />
                        <span className="size-2.5 rounded-full bg-emerald-500/70" />
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground/50">{bodyType.toUpperCase()}</span>
                    </div>
                    <textarea
                      value={body}
                      onChange={(e) => onBodyChange(e.target.value)}
                      className="h-full w-full bg-transparent p-4 font-mono text-sm leading-relaxed text-code-text outline-none resize-none placeholder:text-muted-foreground/30"
                      spellCheck={false}
                      placeholder={bodyType === "json" ? '{\n  "key": "value"\n}' : "Enter request body..."}
                    />
                  </div>
                </TabsContent>
                <TabsContent value="graphql" className="mt-0">
                  <GraphQLBodyEditor
                    query={graphql?.query ?? ""}
                    variables={graphql?.variables ?? "{}"}
                    operationName={graphql?.operationName}
                    onQueryChange={(q) =>
                      onGraphqlChange?.({
                        query: q,
                        variables: graphql?.variables ?? "{}",
                        operationName: graphql?.operationName,
                      })
                    }
                    onVariablesChange={(v) =>
                      onGraphqlChange?.({
                        query: graphql?.query ?? "",
                        variables: v,
                        operationName: graphql?.operationName,
                      })
                    }
                    onOperationNameChange={(o) =>
                      onGraphqlChange?.({
                        query: graphql?.query ?? "",
                        variables: graphql?.variables ?? "{}",
                        operationName: o,
                      })
                    }
                  />
                  <div className="mt-3">
                    <GraphQLIntrospectButton
                      endpoint={url}
                      onSchemaFetched={(_sdl, hash) => console.log("Schema cached:", hash)}
                    />
                  </div>
                </TabsContent>
              </Tabs>
            </AccordionContent>
          </AccordionItem>

          {/* Auth */}
          <AccordionItem value="auth" className="border border-border rounded-lg px-4 ">
            <AccordionTrigger className="py-3 text-xs font-semibold uppercase tracking-wider hover:no-underline [&[data-state=open]>svg]:rotate-180">
              <span className="flex items-center gap-2">
                Auth
                {authType !== "none" && (
                  <span className="text-[10px] font-mono font-normal text-muted-foreground/70">
                    — {authTypeLabels[authType]}
                  </span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Authentication Type
                  </label>
                  <Select value={authType} onValueChange={(value) => onAuthChange(value as AuthType, authToken)}>
                    <SelectTrigger className="w-full h-10 border-input bg-muted/20 text-sm transition-all duration-200 hover:border-muted-foreground/30">
                      <SelectValue placeholder="Select auth type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Auth</SelectItem>
                      <SelectItem value="bearer">Bearer Token</SelectItem>
                      <SelectItem value="basic">Basic Auth</SelectItem>
                      <SelectItem value="api-key">API Key</SelectItem>
                      <SelectItem value="oauth2">OAuth 2.0</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {authType !== "none" && (
                  <div className="space-y-2 animate-slide-up">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {authType === "bearer" ? "Bearer Token" :
                       authType === "basic" ? "Credentials (Base64)" :
                       authType === "api-key" ? "API Key" : "OAuth2 Token"}
                    </label>
                    <div className="relative">
                      <Input
                        type={authType === "basic" ? "text" : "password"}
                        value={authToken}
                        onChange={(event) => onAuthChange(authType, event.target.value)}
                        placeholder={
                          authType === "bearer"
                            ? "eyJhbGciOiJIUzI1NiIs..."
                            : authType === "basic"
                            ? "base64(username:password)"
                            : authType === "api-key"
                            ? "sk-..."
                            : "ya29.a0AfH6S..."
                        }
                        className="h-10 bg-muted/20 border-input pr-10 font-mono text-sm transition-all duration-200 focus:bg-muted/40"
                      />
                      {authToken && (
                        <button
                          onClick={() => onAuthChange(authType, "")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-destructive transition-colors"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-border bg-muted/20 p-4 transition-all duration-200">
                  <div className="flex items-start gap-3">
                    <div className="size-2 mt-1 rounded-full bg-muted-foreground/30 shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground/80 leading-relaxed">
                        Authorization header will be automatically attached to every request.
                      </p>
                      {authType !== "none" && authToken && (
                        <div className="mt-2 rounded-md bg-code-bg px-3 py-2 font-mono text-[11px] leading-relaxed">
                          <span className="text-muted-foreground/50">{"> "}</span>
                          <span className="text-code-text">
                            {authType === "basic"
                              ? `Authorization: Basic ${authToken.slice(0, 30)}${authToken.length > 30 ? "..." : ""}`
                              : authType === "api-key"
                              ? `x-api-key: ${authToken.slice(0, 30)}${authToken.length > 30 ? "..." : ""}`
                              : `Authorization: Bearer ${authToken.slice(0, 30)}${authToken.length > 30 ? "..." : ""}`}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          {/* Tests */}
          <AccordionItem value="tests" className="border border-border rounded-lg px-4">
            <AccordionTrigger className="py-3 text-xs font-semibold uppercase tracking-wider hover:no-underline [&[data-state=open]>svg]:rotate-180">
              <span className="flex items-center gap-2">
                <FlaskConical className="size-3.5" />
                Tests
                {(assertions?.length ?? 0) > 0 && (
                  <span className="rounded-full bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-mono font-normal">
                    {assertions?.filter((a) => a.enabled).length ?? 0}/{assertions?.length ?? 0}
                  </span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <TestAssertionPanel
                assertions={assertions ?? []}
                onChange={onAssertionsChange ?? (() => {})}
                onRunTests={onRunTests}
              />
            </AccordionContent>
          </AccordionItem>

          {/* Assertions (test-runner) */}
          <AccordionItem value="assertions-runner" className="border border-border rounded-lg px-4">
            <AccordionTrigger className="py-3 text-xs font-semibold uppercase tracking-wider hover:no-underline [&[data-state=open]>svg]:rotate-180">
              <span className="flex items-center gap-2">
                <FlaskConical className="size-3.5" />
                Assertions
                {(runnerAssertions?.length ?? 0) > 0 && (
                  <span className="rounded-full bg-muted-foreground/10 px-1.5 py-0.5 text-[10px] font-mono font-normal">
                    {runnerAssertions?.length ?? 0}
                  </span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <AssertionEditor
                assertions={runnerAssertions ?? []}
                onChange={onRunnerAssertionsChange ?? (() => {})}
              />
            </AccordionContent>
          </AccordionItem>

          {/* Scripts */}
          <AccordionItem value="scripts" className="border border-border rounded-lg px-4">
            <AccordionTrigger className="py-3 text-xs font-semibold uppercase tracking-wider hover:no-underline [&[data-state=open]>svg]:rotate-180">
              <span className="flex items-center gap-2">
                <Code className="size-3.5" />
                Scripts
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <ScriptEditor
                preRequestScript={preRequestScript}
                postResponseScript={postResponseScript}
                onPreChange={onPreRequestScriptChange ?? (() => {})}
                onPostChange={onPostResponseScriptChange ?? (() => {})}
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  )
}

const assertionTypeLabels: Record<AssertionType, string> = {
  status: "Status Code",
  bodyContains: "Body Contains",
  headerExists: "Header Exists",
  jsonPath: "JSON Path",
}

function TestAssertionPanel({
  assertions,
  onChange,
  onRunTests,
}: {
  assertions: RequestTestAssertion[]
  onChange: (assertions: RequestTestAssertion[]) => void
  onRunTests?: () => void
}) {
  const addAssertion = () => {
    const newAssertion: RequestTestAssertion = {
      id: `assert-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      type: "status",
      target: "200",
      expected: "",
      enabled: true,
    }
    onChange([...assertions, newAssertion])
  }

  const removeAssertion = (index: number) => {
    onChange(assertions.filter((_, i) => i !== index))
  }

  const updateAssertion = (index: number, patch: Partial<RequestTestAssertion>) => {
    onChange(assertions.map((a, i) => (i === index ? { ...a, ...patch } : a)))
  }

  return (
    <div className="space-y-3">
      {assertions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 text-xs text-muted-foreground/60">
          <FlaskConical className="size-6 mb-2 text-muted-foreground/30" />
          <span>No assertions added yet</span>
        </div>
      )}
      {assertions.map((assertion, index) => (
        <div
          key={assertion.id}
          className="group/assertion flex items-start gap-2 rounded-lg border border-border bg-muted/10 p-2.5 transition-all duration-200 hover:bg-muted/20"
        >
          <div className="flex flex-1 flex-col gap-2 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Select
                value={assertion.type}
                onValueChange={(value) => updateAssertion(index, { type: value as AssertionType })}
              >
                <SelectTrigger className="h-8 w-36 border-input bg-muted/20 text-xs font-medium transition-all duration-200 hover:border-muted-foreground/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(["status", "bodyContains", "headerExists", "jsonPath"] as AssertionType[]).map((t) => (
                    <SelectItem key={t} value={t}>
                      {assertionTypeLabels[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Switch
                checked={assertion.enabled}
                onCheckedChange={(checked) => updateAssertion(index, { enabled: checked })}
                className="data-[state=checked]:bg-emerald-500"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                type="text"
                value={assertion.target}
                onChange={(e) => updateAssertion(index, { target: e.target.value })}
                placeholder={
                  assertion.type === "status"
                    ? "200 or >= 200 && < 300"
                    : assertion.type === "bodyContains"
                    ? "text to find"
                    : assertion.type === "headerExists"
                    ? "header-name"
                    : "$.data.id"
                }
                className="flex-1 h-8 border-input bg-muted/20 text-xs font-mono transition-all duration-200 focus:bg-muted/40 min-w-0"
              />
              {assertion.type !== "status" && (
                <Input
                  type="text"
                  value={assertion.expected ?? ""}
                  onChange={(e) => updateAssertion(index, { expected: e.target.value })}
                  placeholder={
                    assertion.type === "jsonPath" ? "expected value" : "expected value (optional)"
                  }
                  className="flex-1 h-8 border-input bg-muted/20 text-xs font-mono transition-all duration-200 focus:bg-muted/40 min-w-0"
                />
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => removeAssertion(index)}
            className="shrink-0 size-7 text-muted-foreground/50 hover:text-destructive opacity-0 group-hover/assertion:opacity-100 transition-all duration-200"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={addAssertion}
          className="flex-1 border-dashed border-muted-foreground/20 text-muted-foreground/70 hover:text-foreground hover:border-muted-foreground/40 transition-all duration-200 h-9 text-xs font-medium"
        >
          <Plus className="size-3.5 mr-1" />
          Add Assertion
        </Button>
        {onRunTests && (
          <Button
            variant="outline"
            onClick={onRunTests}
            className="h-9 gap-1.5 text-xs font-medium border-dashed border-muted-foreground/20 text-muted-foreground/70 hover:text-foreground hover:border-muted-foreground/40 transition-all duration-200"
          >
            <Play className="size-3.5" />
            Run Tests
          </Button>
        )}
      </div>
    </div>
  )
}
