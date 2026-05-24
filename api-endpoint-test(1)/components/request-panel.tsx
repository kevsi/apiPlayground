"use client"

import { useState } from "react"
import { Plus, Trash2, Play, Code } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

type BodyType = "json" | "form-data" | "x-www-form" | "raw" | "binary"

type AuthType = "none" | "bearer" | "basic" | "api-key" | "oauth2"

interface QueryParam {
  key: string
  value: string
}

interface Header {
  key: string
  value: string
}

interface RequestPanelProps {
  method: HttpMethod
  url: string
  queryParams: QueryParam[]
  headers: Header[]
  body: string
  bodyType: BodyType
  authType: AuthType
  authToken: string
  onMethodChange: (method: HttpMethod) => void
  onUrlChange: (url: string) => void
  onQueryParamsChange: (queryParams: QueryParam[]) => void
  onHeadersChange: (headers: Header[]) => void
  onBodyChange: (body: string) => void
  onBodyTypeChange: (bodyType: BodyType) => void
  onAuthChange: (type: AuthType, token: string) => void
  onSend: () => void
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
  onMethodChange,
  onUrlChange,
  onQueryParamsChange,
  onHeadersChange,
  onBodyChange,
  onBodyTypeChange,
  onAuthChange,
  onSend,
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

  const buildFullUrl = () => {
    try {
      const finalUrl = new URL(url)
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

  return (
    <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
      {/* Request URL Section */}
      <div className="space-y-3 p-4 pb-2">
        <h2 className="text-sm font-semibold text-foreground">Request URL</h2>

        {/* Method & URL */}
        <div className="space-y-2">
          <Select value={method} onValueChange={(value) => onMethodChange(value as HttpMethod)}>
            <SelectTrigger className="w-full bg-muted/30">
              <SelectValue placeholder="Method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GET">GET</SelectItem>
              <SelectItem value="POST">POST</SelectItem>
              <SelectItem value="PUT">PUT</SelectItem>
              <SelectItem value="PATCH">PATCH</SelectItem>
              <SelectItem value="DELETE">DELETE</SelectItem>
            </SelectContent>
          </Select>

          <Input
            type="text"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            className="bg-muted/30"
          />

          <div className="space-y-2">
            <Button onClick={onSend} className="w-full">
              <Play className="size-4" />
              Send
            </Button>

            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <Select value={exportFormat} onValueChange={(value) => setExportFormat(value as "curl" | "fetch")}> 
                <SelectTrigger className="w-full bg-muted/30">
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
                className="h-11 w-full md:w-auto"
              >
                {exportCopied ? "Copied!" : `Copy ${exportFormat === "curl" ? "cURL" : "Fetch"}`}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-hidden px-4 pb-4">
        <Tabs defaultValue="query-params" className="flex h-full flex-col">
          <TabsList className="h-auto w-full justify-start gap-0 bg-transparent p-0">
            <TabsTrigger
              value="query-params"
              className="rounded-none border-b-2 border-transparent px-4 py-2 data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Query Params
            </TabsTrigger>
            <TabsTrigger
              value="headers"
              className="rounded-none border-b-2 border-transparent px-4 py-2 data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Headers
            </TabsTrigger>
            <TabsTrigger
              value="body"
              className="rounded-none border-b-2 border-transparent px-4 py-2 data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Body
            </TabsTrigger>
            <TabsTrigger
              value="auth"
              className="rounded-none border-b-2 border-transparent px-4 py-2 data-[state=active]:border-emerald-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Auth
            </TabsTrigger>
          </TabsList>

          <TabsContent value="query-params" className="mt-3 flex-1 overflow-auto hide-scrollbar">
            <div className="space-y-2">
              {queryParams.map((param, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={param.key}
                    onChange={(e) => updateQueryParam(index, "key", e.target.value)}
                    placeholder="Key"
                    className="flex-1 bg-muted/30"
                  />
                  <Input
                    type="text"
                    value={param.value}
                    onChange={(e) => updateQueryParam(index, "value", e.target.value)}
                    placeholder="Value"
                    className="flex-1 bg-muted/30"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeQueryParam(index)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              onClick={addQueryParam}
              className="mt-3 w-full border-dashed"
            >
              <Plus className="size-4" />
              Add New Parameter
            </Button>
          </TabsContent>

          <TabsContent value="headers" className="mt-3 flex-1 overflow-auto hide-scrollbar">
            <div className="space-y-2">
              {headers.map((header, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    type="text"
                    value={header.key}
                    onChange={(e) => updateHeader(index, "key", e.target.value)}
                    placeholder="Header Name"
                    className="flex-1 bg-muted/30"
                  />
                  <Input
                    type="text"
                    value={header.value}
                    onChange={(e) => updateHeader(index, "value", e.target.value)}
                    placeholder="Value"
                    className="flex-1 bg-muted/30"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeHeader(index)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              onClick={addHeader}
              className="mt-3 w-full border-dashed"
            >
              <Plus className="size-4" />
              Add New Header
            </Button>
          </TabsContent>

          <TabsContent value="body" className="mt-3 flex-1 overflow-auto hide-scrollbar">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Select value={bodyType} onValueChange={(value) => onBodyTypeChange(value as BodyType)}>
                  <SelectTrigger className="w-32 bg-muted/30">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="form-data">Form Data</SelectItem>
                    <SelectItem value="x-www-form">x-www-form</SelectItem>
                    <SelectItem value="raw">Raw</SelectItem>
                    <SelectItem value="binary">Binary</SelectItem>
                  </SelectContent>
                </Select>
                {bodyType === "json" && (
                  <Button variant="ghost" size="sm" onClick={handleFormatJson} className="h-8 gap-1">
                    <Code className="size-3.5" />
                    Format JSON
                  </Button>
                )}
              </div>
              <div className="flex-1 overflow-hidden rounded-lg border border-border bg-slate-900 flex flex-col">
                <textarea
                  value={body}
                  onChange={(e) => onBodyChange(e.target.value)}
                  className="h-full w-full bg-transparent p-4 font-mono text-sm text-emerald-400 outline-none"
                  spellCheck={false}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="auth" className="mt-3 flex-1 overflow-auto hide-scrollbar">
            <div className="space-y-3">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Authentication Type
                </label>
                <Select value={authType} onValueChange={(value) => onAuthChange(value as AuthType, authToken)}>
                  <SelectTrigger className="w-full bg-muted/30">
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

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Token</label>
                <Input
                  type={authType === "basic" ? "text" : "password"}
                  value={authToken}
                  onChange={(event) => onAuthChange(authType, event.target.value)}
                  placeholder={
                    authType === "bearer"
                      ? "Bearer token"
                      : authType === "basic"
                      ? "Username:Password base64"
                      : authType === "api-key"
                      ? "API Key"
                      : "OAuth2 token"
                  }
                  className="bg-muted/30"
                />
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  The authorization header will be automatically added to the request.
                </p>
                {authType !== "none" && (
                  <code className="mt-2 block text-xs text-emerald-500">
                    {authType === "basic"
                      ? `Authorization: Basic ${authToken}`
                      : authType === "api-key"
                      ? `x-api-key: ${authToken}`
                      : `Authorization: Bearer ${authToken}`}
                  </code>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
