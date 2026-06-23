"use client"

import { useState, useCallback, useEffect } from "react"
import { useGraphQL } from "@/hooks/use-graphql"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Send, Search, Loader2, Trash2, AlertCircle, CheckCircle } from "lucide-react"
import { cn } from "@/lib/utils"

function prettyPrintJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return raw
  }
}

const DEFAULT_QUERY = `query {
  __typename
}`

const DEFAULT_ENDPOINT = "https://countries.trevorblades.com/"

export function GraphQLPanel() {
  const {
    query,
    setQuery,
    variables,
    setVariables,
    operationName,
    setOperationName,
    endpoint,
    setEndpoint,
    status,
    result,
    schemaTypes,
    errorMessage,
    run,
    introspect,
    clear,
  } = useGraphQL()

  const [activeTab, setActiveTab] = useState("query")
  const [headersText, setHeadersText] = useState("{}")

  useEffect(() => {
    if (!endpoint) {
      setEndpoint(DEFAULT_ENDPOINT)
    }
    if (!query) {
      setQuery(DEFAULT_QUERY)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRun = useCallback(() => {
    run()
    setActiveTab("response")
  }, [run])

  const handleIntrospect = useCallback(() => {
    introspect()
    setActiveTab("response")
  }, [introspect])

  const hasErrors = !!result?.response.errors && result.response.errors.length > 0
  const hasData = !!result?.response.data

  return (
    <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
      {/* Endpoint Bar */}
      <div className="p-3 pb-2">
        <div className="flex items-center gap-2 rounded-lg border border-input/50 px-3 py-1.5 transition-all duration-200">
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 gap-1.5 py-0.5 px-2 text-[11px] font-semibold",
              status === "loading"
                ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                : "bg-slate-500/10 text-slate-500 border-slate-500/20"
            )}
          >
            {status === "loading" ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <CheckCircle className="size-3" />
            )}
            {status === "loading" ? "Loading" : "Ready"}
          </Badge>
          <div className="relative flex-1">
            <input
              type="text"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://api.example.com/graphql"
              className="w-full bg-transparent px-1 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/40 outline-none"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleIntrospect}
            disabled={status === "loading" || !endpoint.trim()}
            className="h-7 gap-1.5 px-3 text-xs font-semibold shrink-0 border-primary/30 text-primary hover:bg-primary/10 hover:border-primary/50 transition-all duration-200"
          >
            <Search className="size-3.5" />
            Introspect
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRun}
            disabled={status === "loading" || !endpoint.trim() || !query.trim()}
            className="h-7 gap-1.5 px-3 text-xs font-semibold shrink-0 border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 hover:border-emerald-500/50 transition-all duration-200"
          >
            {status === "loading" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
            Send
          </Button>
        </div>
      </div>

      {/* Operation Name */}
      <div className="px-3 pb-2">
        <Input
          type="text"
          value={operationName}
          onChange={(e) => setOperationName(e.target.value)}
          placeholder="Operation name (optional)"
          className="h-7 text-xs font-mono border-input/50"
        />
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0 px-3 pb-2 flex flex-col gap-2">
        {/* Top: Editor Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between">
            <TabsList className="h-7">
              <TabsTrigger value="query" className="text-[11px] px-2 py-0.5">
                Query
              </TabsTrigger>
              <TabsTrigger value="variables" className="text-[11px] px-2 py-0.5">
                Variables
              </TabsTrigger>
              <TabsTrigger value="headers" className="text-[11px] px-2 py-0.5">
                Headers
              </TabsTrigger>
              <TabsTrigger value="response" className="text-[11px] px-2 py-0.5">
                Response
              </TabsTrigger>
              <TabsTrigger value="schema" className="text-[11px] px-2 py-0.5">
                Schema
              </TabsTrigger>
            </TabsList>
            {(result || errorMessage) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clear}
                className="h-6 gap-1 text-[10px] font-medium text-muted-foreground/50 hover:text-destructive transition-colors duration-200"
              >
                <Trash2 className="size-3" />
                Clear
              </Button>
            )}
          </div>

          <TabsContent value="query" className="flex-1 min-h-0 mt-2">
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter GraphQL query or mutation..."
              className="flex-1 h-[calc(100vh-340px)] min-h-[200px] font-mono text-xs leading-relaxed resize-none border-border bg-muted/20"
            />
          </TabsContent>

          <TabsContent value="variables" className="flex-1 min-h-0 mt-2">
            <Textarea
              value={variables}
              onChange={(e) => setVariables(e.target.value)}
              placeholder='{"id": "123", "limit": 10}'
              className="flex-1 h-[calc(100vh-340px)] min-h-[200px] font-mono text-xs leading-relaxed resize-none border-border bg-muted/20"
            />
          </TabsContent>

          <TabsContent value="headers" className="flex-1 min-h-0 mt-2">
            <Textarea
              value={headersText}
              onChange={(e) => setHeadersText(e.target.value)}
              placeholder='{"Authorization": "Bearer token"}'
              className="flex-1 h-[calc(100vh-340px)] min-h-[200px] font-mono text-xs leading-relaxed resize-none border-border bg-muted/20"
            />
          </TabsContent>

          <TabsContent value="response" className="flex-1 min-h-0 mt-2">
            <div className="flex flex-col h-[calc(100vh-340px)] min-h-[200px] border border-border rounded-lg bg-muted/10 overflow-hidden">
              {errorMessage && (
                <div className="flex items-center gap-2 p-2 border-b border-destructive/20 bg-destructive/5">
                  <AlertCircle className="size-3.5 text-destructive shrink-0" />
                  <span className="text-xs text-destructive font-medium">{errorMessage}</span>
                </div>
              )}
              {result && (
                <div className="flex items-center gap-3 p-2 border-b border-border bg-muted/20">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-bold font-mono px-1.5 py-0",
                      result.status >= 200 && result.status < 300
                        ? "border-emerald-500/30 text-emerald-500 bg-emerald-500/10"
                        : "border-red-500/30 text-red-500 bg-red-500/10"
                    )}
                  >
                    {result.status}
                  </Badge>
                  <span className="text-[10px] font-mono text-muted-foreground/50">
                    {result.durationMs}ms
                  </span>
                  {hasErrors && (
                    <Badge
                      variant="outline"
                      className="text-[10px] font-bold font-mono px-1.5 py-0 border-red-500/30 text-red-500 bg-red-500/10"
                    >
                      {result.response.errors!.length} error{result.response.errors!.length > 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
              )}
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-3">
                  {!result && !errorMessage && (
                    <div className="flex flex-col items-center justify-center py-12 text-xs text-muted-foreground/50">
                      <Send className="size-8 mb-2 text-muted-foreground/20" />
                      <span>No response yet</span>
                      <span className="text-[10px] text-muted-foreground/30 mt-1">
                        Send a query to get started
                      </span>
                    </div>
                  )}
                  {hasErrors && (
                    <div className="mb-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-red-500/70 mb-1.5">
                        Errors
                      </div>
                      <pre className="text-xs font-mono leading-relaxed text-destructive whitespace-pre-wrap break-all bg-destructive/5 rounded-md p-2 border border-destructive/10">
                        {prettyPrintJson(JSON.stringify(result!.response.errors))}
                      </pre>
                    </div>
                  )}
                  {hasData && (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-500/70 mb-1.5">
                        Data
                      </div>
                      <pre className="text-xs font-mono leading-relaxed text-foreground whitespace-pre-wrap break-all bg-emerald-500/5 rounded-md p-2 border border-emerald-500/10">
                        {prettyPrintJson(JSON.stringify(result!.response.data))}
                      </pre>
                    </div>
                  )}
                  {result && !hasData && !hasErrors && (
                    <div className="text-xs text-muted-foreground/50">
                      Empty response
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="schema" className="flex-1 min-h-0 mt-2">
            <div className="flex flex-col h-[calc(100vh-340px)] min-h-[200px] border border-border rounded-lg bg-muted/10 overflow-hidden">
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-3">
                  {schemaTypes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-xs text-muted-foreground/50">
                      <Search className="size-8 mb-2 text-muted-foreground/20" />
                      <span>No schema loaded</span>
                      <span className="text-[10px] text-muted-foreground/30 mt-1">
                        Click Introspect to fetch the schema
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {schemaTypes.map((type) => (
                        <div
                          key={type.name}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 transition-colors"
                        >
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] font-mono px-1 py-0 shrink-0",
                              type.kind === "OBJECT" && "border-blue-500/30 text-blue-500 bg-blue-500/10",
                              type.kind === "SCALAR" && "border-amber-500/30 text-amber-500 bg-amber-500/10",
                              type.kind === "ENUM" && "border-purple-500/30 text-purple-500 bg-purple-500/10",
                              type.kind === "INPUT_OBJECT" && "border-pink-500/30 text-pink-500 bg-pink-500/10",
                              type.kind === "INTERFACE" && "border-cyan-500/30 text-cyan-500 bg-cyan-500/10",
                              type.kind === "UNION" && "border-orange-500/30 text-orange-500 bg-orange-500/10"
                            )}
                          >
                            {type.kind}
                          </Badge>
                          <span className="text-xs font-mono text-foreground">{type.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
