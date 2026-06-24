"use client"
import { useState, useEffect } from "react"
import { ApiSidebar } from "@/components/api-sidebar"
import { ApiHeader } from "@/components/api-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Code2, Play, Loader2, ChevronRight, ChevronDown, RefreshCw, Save, AlertCircle } from "lucide-react"
import { executeGraphQL } from "@/lib/graphql/execute"
import { introspectSchema } from "@/lib/graphql/introspect"
import type { GraphQLError } from "@/lib/graphql/types"

interface SavedQuery {
  id: string
  name: string
  endpoint: string
  query: string
  variables: string
  headers?: string
}

const STORAGE_KEY = "reqly-saved-graphql-queries"

function loadSavedQueries(): SavedQuery[] {
  if (typeof window === "undefined") return []
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") } catch { return [] }
}

function saveQueries(qs: SavedQuery[]) {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(qs))
}

interface SchemaType {
  kind: string
  name?: string
  ofType?: { kind: string; name?: string; ofType?: SchemaType }
  fields?: Array<{ name: string; args?: Array<{ name: string; type: { name?: string; kind?: string; ofType?: SchemaType } }>; type: SchemaType }>
}

interface SchemaData {
  queryType?: { name?: string }
  types?: SchemaType[]
}

function unwrapType(t?: SchemaType): string {
  if (!t) return "Unknown"
  if (t.kind === "NON_NULL") return `${unwrapType(t.ofType)}!`
  if (t.kind === "LIST") return `[${unwrapType(t.ofType)}]`
  return t.name ?? "Unknown"
}

function SchemaTreeView({ data }: { data: SchemaData }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set([data.queryType?.name ?? "Query"]))

  const toggle = (name: string) => {
    const next = new Set(expanded)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setExpanded(next)
  }

  const types = data.types?.filter((t) => t.kind === "OBJECT" && t.fields?.length) ?? []
  const rootName = data.queryType?.name ?? "Query"
  const rootType = types.find((t) => t.name === rootName)

  return (
    <div className="space-y-1 text-xs font-mono" data-testid="schema-tree">
      {rootType && (
        <div>
          <button
            onClick={() => toggle(rootName)}
            className="flex items-center gap-1 font-semibold text-sm"
            data-testid={`schema-toggle-${rootName}`}
          >
            {expanded.has(rootName) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
            {rootName}
          </button>
          {expanded.has(rootName) && rootType.fields?.map((f) => (
            <div key={f.name} className="ml-4 my-1">
              <span className="text-blue-500">{f.name}</span>
              {f.args && f.args.length > 0 && (
                <span className="text-muted-foreground">
                  ({f.args.map((a) => `${a.name}: ${unwrapType(a.type as SchemaType)}`).join(", ")})
                </span>
              )}
              <span className="text-muted-foreground">: {unwrapType(f.type)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="pt-2 border-t mt-2">
        {types.filter((t) => t.name !== rootName).slice(0, 50).map((t) => (
          <div key={t.name} className="my-1">
            <button onClick={() => toggle(t.name!)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
              {expanded.has(t.name!) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              <span className="font-semibold">{t.name}</span>
            </button>
            {expanded.has(t.name!) && t.fields?.slice(0, 20).map((f) => (
              <div key={f.name} className="ml-4 text-muted-foreground">
                <span className="text-blue-500">{f.name}</span>: {unwrapType(f.type)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function GraphqlPage() {
  const [endpoint, setEndpoint] = useState("https://countries.trevorblades.com/")
  const [query, setQuery] = useState(`query {
  countries {
    code
    name
    capital
  }
}`)
  const [variables, setVariables] = useState("{}")
  const [headers, setHeaders] = useState("{}")
  const [schema, setSchema] = useState<SchemaData | null>(null)
  const [response, setResponse] = useState<{ data?: unknown; errors?: GraphQLError[]; status: number; timeMs: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [introspecting, setIntrospecting] = useState(false)
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([])
  const [variablesError, setVariablesError] = useState<string | null>(null)

  useEffect(() => {
    setSavedQueries(loadSavedQueries())
  }, [])

  useEffect(() => {
    if (!variables.trim()) {
      setVariablesError(null)
      return
    }
    try {
      JSON.parse(variables)
      setVariablesError(null)
    } catch (e) {
      setVariablesError(e instanceof Error ? e.message : "Invalid JSON")
    }
  }, [variables])

  const execute = async () => {
    if (!endpoint || !query.trim()) return
    if (variablesError) return
    setLoading(true)
    setResponse(null)
    const started = Date.now()
    try {
      let parsedVars: Record<string, unknown> = {}
      let parsedHeaders: Record<string, string> = {}
      if (variables.trim()) parsedVars = JSON.parse(variables)
      if (headers.trim()) parsedHeaders = JSON.parse(headers)

      const result = await executeGraphQL({
        endpoint,
        query,
        variables: parsedVars,
        headers: parsedHeaders,
      })
      setResponse({
        data: result.data,
        errors: result.errors,
        status: result.statusCode,
        timeMs: result.responseTimeMs,
      })
    } catch (err) {
      setResponse({
        errors: [{ message: err instanceof Error ? err.message : "Network error" }],
        status: 0,
        timeMs: Date.now() - started,
      })
    } finally {
      setLoading(false)
    }
  }

  const introspect = async () => {
    if (!endpoint) return
    setIntrospecting(true)
    try {
      const sdl = await introspectSchema(endpoint)
      const parsed = JSON.parse(sdl) as { __schema?: SchemaData }
      if (parsed.__schema) {
        setSchema(parsed.__schema)
      } else {
        setSchema(null)
      }
    } catch (err) {
      console.error("Introspection failed:", err)
    } finally {
      setIntrospecting(false)
    }
  }

  const saveCurrent = () => {
    const name = prompt("Name for this saved query:")
    if (!name) return
    const entry: SavedQuery = {
      id: `q-${Date.now()}`,
      name,
      endpoint,
      query,
      variables,
      headers,
    }
    const next = [...savedQueries, entry]
    setSavedQueries(next)
    saveQueries(next)
  }

  const loadQuery = (q: SavedQuery) => {
    setEndpoint(q.endpoint)
    setQuery(q.query)
    setVariables(q.variables)
    setHeaders(q.headers ?? "{}")
  }

  const deleteQuery = (id: string) => {
    const next = savedQueries.filter((q) => q.id !== id)
    setSavedQueries(next)
    saveQueries(next)
  }

  return (
    <div className="flex h-screen">
      <ApiSidebar />
      <div className="flex-1 flex flex-col">
        <ApiHeader />
        <main className="flex-1 overflow-auto p-6" data-testid="graphql-page">
          <div className="max-w-7xl mx-auto space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Code2 className="w-6 h-6 text-purple-500" />
                <h1 className="text-2xl font-bold">GraphQL Explorer</h1>
              </div>
              <div className="flex items-center gap-2">
                <Select onValueChange={(v) => { const q = savedQueries.find((s) => s.id === v); if (q) loadQuery(q) }}>
                  <SelectTrigger className="w-48" data-testid="saved-queries-select">
                    <SelectValue placeholder="Saved queries" />
                  </SelectTrigger>
                  <SelectContent>
                    {savedQueries.map((q) => (
                      <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={saveCurrent} data-testid="save-query-button">
                  <Save className="w-3 h-3 mr-1" /> Save
                </Button>
                {savedQueries.length > 0 && (
                  <Select onValueChange={(v) => deleteQuery(v)}>
                    <SelectTrigger className="w-32" data-testid="delete-query-select">
                      <SelectValue placeholder="Delete" />
                    </SelectTrigger>
                    <SelectContent>
                      {savedQueries.map((q) => (
                        <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Endpoint bar */}
            <div className="flex items-center gap-2">
              <Input
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://api.example.com/graphql"
                className="flex-1"
                data-testid="endpoint-input"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={introspect}
                disabled={introspecting || !endpoint}
                data-testid="introspect-button"
              >
                {introspecting ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                Introspect
              </Button>
            </div>

            {/* Two-column layout */}
            <div className="grid grid-cols-12 gap-4">
              {/* Schema sidebar */}
              <Card className="col-span-3 max-h-[60vh] overflow-auto">
                <CardHeader className="sticky top-0 bg-card z-10">
                  <CardTitle className="text-sm">Schema</CardTitle>
                </CardHeader>
                <CardContent>
                  {schema ? (
                    <SchemaTreeView data={schema} />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Click <strong>Introspect</strong> to fetch the schema
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Query + Variables + Response */}
              <div className="col-span-9 space-y-4">
                {/* Query */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Query</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="font-mono text-xs min-h-40"
                      placeholder="query { ... }"
                      data-testid="query-editor"
                    />
                  </CardContent>
                </Card>

                {/* Variables + Headers */}
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Variables (JSON)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        value={variables}
                        onChange={(e) => setVariables(e.target.value)}
                        className="font-mono text-xs min-h-20"
                        placeholder='{ "id": 1 }'
                        data-testid="variables-editor"
                      />
                      {variablesError && (
                        <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {variablesError}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm">Headers (JSON)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        value={headers}
                        onChange={(e) => setHeaders(e.target.value)}
                        className="font-mono text-xs min-h-20"
                        placeholder='{ "Authorization": "Bearer ..." }'
                        data-testid="headers-editor"
                      />
                    </CardContent>
                  </Card>
                </div>

                {/* Send button */}
                <div className="flex justify-end">
                  <Button onClick={execute} disabled={loading || !endpoint || !query.trim() || !!variablesError} data-testid="send-button">
                    {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                    Send
                  </Button>
                </div>

                {/* Response */}
                {response && (
                  <Card data-testid="response-card">
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                      <CardTitle className="text-sm">Response</CardTitle>
                      <div className="flex items-center gap-2 text-xs">
                        <Badge variant={response.status >= 400 ? "destructive" : "default"} data-testid="status-badge">
                          {response.status || "ERR"}
                        </Badge>
                        <span className="text-muted-foreground">{response.timeMs}ms</span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {response.errors && response.errors.length > 0 && (
                        <div className="mb-3 p-2 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded text-xs" data-testid="errors-section">
                          {response.errors.map((e, i) => (
                            <div key={i} className="text-red-700 dark:text-red-300">
                              {e.message}
                              {e.path && <span className="text-muted-foreground"> at {e.path.join(".")}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                      {response.data !== undefined && (
                        <pre className="text-xs font-mono overflow-auto max-h-96 p-2 bg-muted/30 rounded" data-testid="response-data">
                          {JSON.stringify(response.data, null, 2)}
                        </pre>
                      )}
                      {!response.data && !response.errors && (
                        <p className="text-xs text-muted-foreground">No data</p>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
