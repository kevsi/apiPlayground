"use client"

import { Play, Plus, Trash2 } from "lucide-react"
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
type AuthType = "none" | "bearer" | "basic" | "api-key" | "oauth2"

export interface QueryParam {
  key: string
  value: string
}

export interface Header {
  key: string
  value: string
}

interface RequestPanelProps {
  method: HttpMethod
  url: string
  queryParams: QueryParam[]
  headers: Header[]
  bodyContent: string
  bodyType: string
  authType: AuthType
  authToken: string
  onMethodChange: (method: HttpMethod) => void
  onUrlChange: (url: string) => void
  onQueryParamsChange: (params: QueryParam[]) => void
  onHeadersChange: (headers: Header[]) => void
  onBodyChange: (body: string) => void
  onBodyTypeChange: (type: string) => void
  onAuthChange: (authType: AuthType, authToken: string) => void
  onSend: () => void
}

export function RequestPanel({
  method,
  url,
  queryParams,
  headers,
  bodyContent,
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
    const newParams = [...queryParams]
    newParams[index][field] = value
    onQueryParamsChange(newParams)
  }

  const addHeader = () => {
    onHeadersChange([...headers, { key: "", value: "" }])
  }

  const removeHeader = (index: number) => {
    onHeadersChange(headers.filter((_, i) => i !== index))
  }

  const updateHeader = (index: number, field: "key" | "value", value: string) => {
    const newHeaders = [...headers]
    newHeaders[index][field] = value
    onHeadersChange(newHeaders)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Request URL Section */}
      <div className="space-y-4 p-6">
        <h2 className="text-base font-semibold text-foreground">Request URL</h2>

        {/* Method & URL */}
        <div className="space-y-3">
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

          <Button onClick={onSend} className="w-full bg-emerald-500 text-white hover:bg-emerald-600">
            <Play className="size-4" />
            Send
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-hidden px-6 pb-6">
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

          <TabsContent value="query-params" className="mt-4 flex-1 overflow-auto">
            <div className="space-y-2">
              {queryParams.map((param, index) => (
                <div key={index} className="flex items-center gap-3">
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

            <Button variant="outline" onClick={addQueryParam} className="mt-4 w-full border-dashed">
              <Plus className="size-4" />
              Add New Parameter
            </Button>
          </TabsContent>

          <TabsContent value="headers" className="mt-4 flex-1 overflow-auto">
            <div className="space-y-2">
              {headers.map((header, index) => (
                <div key={index} className="flex items-center gap-3">
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

            <Button variant="outline" onClick={addHeader} className="mt-4 w-full border-dashed">
              <Plus className="size-4" />
              Add New Header
            </Button>
          </TabsContent>

          <TabsContent value="body" className="mt-4 flex-1 overflow-auto">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Select value={bodyType} onValueChange={onBodyTypeChange}>
                  <SelectTrigger className="w-32 bg-muted/30">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="form-data">Form Data</SelectItem>
                    <SelectItem value="x-www-form">x-www-form</SelectItem>
                    <SelectItem value="raw">Raw</SelectItem>
                    <SelectItem value="binary">Binary</SelectItem>
                    <SelectItem value="xml">XML</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {bodyType === "form-data" ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Form data fields will be implemented</p>
                </div>
              ) : bodyType === "binary" ? (
                <div className="space-y-2">
                  <input type="file" className="w-full" />
                </div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border bg-slate-900">
                  <textarea
                    value={bodyContent}
                    onChange={(e) => onBodyChange(e.target.value)}
                    className="min-h-[200px] w-full bg-transparent p-4 font-mono text-sm text-emerald-400 outline-none"
                    spellCheck={false}
                    placeholder={
                      bodyType === "json" ? '{"key": "value"}' :
                      bodyType === "xml" ? '<root><key>value</key></root>' :
                      "Enter raw body content"
                    }
                  />
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="auth" className="mt-4 flex-1 overflow-auto">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Authentication Type</label>
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
                  type="text"
                  value={authToken}
                  onChange={(e) => onAuthChange(authType, e.target.value)}
                  className="bg-muted/30 font-mono text-sm"
                />
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  The authorization header will be automatically added to the request.
                </p>
                <code className="mt-2 block text-xs text-emerald-500">
                  Authorization: Bearer {authToken}
                </code>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
