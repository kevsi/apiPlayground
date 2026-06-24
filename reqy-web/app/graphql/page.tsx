"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { ApiSidebar } from "@/components/api-sidebar"
import { ApiHeader } from "@/components/api-header"
import { GraphqlAddressBar } from "@/components/graphql/address-bar"
import { GraphqlToolbar } from "@/components/graphql/graphql-toolbar"
import { QueryEditor } from "@/components/graphql/query-editor"
import { VariablesPanel } from "@/components/graphql/variables-panel"
import { ResponseViewer } from "@/components/graphql/response-viewer"
import { SchemaBrowser } from "@/components/graphql/schema-browser"
import { SubscriptionViewer, type SubscriptionMessageView } from "@/components/graphql/subscription-viewer"
import { executeGraphQL } from "@/lib/graphql/execute"
import { introspectSchema } from "@/lib/graphql/introspect"
import { subscribeGraphQL } from "@/lib/graphql/subscribe"
import { formatGraphQL } from "@/lib/graphql/format"
import { useSidebar } from "@/contexts/sidebar-context"
import { cn } from "@/lib/utils"

interface SchemaData {
  queryType?: { name?: string }
  mutationType?: { name?: string }
  subscriptionType?: { name?: string }
  types?: Array<{
    kind: string
    name?: string
    description?: string
    fields?: Array<{
      name: string
      type: { kind?: string; name?: string; ofType?: { kind?: string; name?: string } }
    }>
  }>
}

const DEFAULT_ENDPOINT = "https://countries.trevorblades.com/"
const DEFAULT_QUERY = `# Welcome to Reqly GraphQL Explorer
# Click "Refresh Schema" after setting an endpoint to introspect it.

query GetExample {
  __typename
}`

const SCHEMA_CACHE_KEY = "reqly-graphql-schema-cache"

function loadCachedSchema(endpoint: string): SchemaData | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(SCHEMA_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, SchemaData>
    return parsed[endpoint] ?? null
  } catch {
    return null
  }
}

function cacheSchema(endpoint: string, schema: SchemaData) {
  if (typeof window === "undefined") return
  try {
    const raw = window.localStorage.getItem(SCHEMA_CACHE_KEY)
    const parsed = raw ? (JSON.parse(raw) as Record<string, SchemaData>) : {}
    parsed[endpoint] = schema
    window.localStorage.setItem(SCHEMA_CACHE_KEY, JSON.stringify(parsed))
  } catch {
    // ignore
  }
}

export default function GraphqlPage() {
  const { isCollapsed, toggleSidebar } = useSidebar()
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT)
  const [query, setQuery] = useState(DEFAULT_QUERY)
  const [variables, setVariables] = useState("{}")
  const [headers, setHeaders] = useState("{}")
  const [response, setResponse] = useState<{ data?: unknown; errors?: unknown } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<number | undefined>(undefined)
  const [timeMs, setTimeMs] = useState<number | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [schema, setSchema] = useState<SchemaData | null>(null)
  const [introspecting, setIntrospecting] = useState(false)
  const [schemaOpen, setSchemaOpen] = useState(false)
  const [subscriptionMessages, setSubscriptionMessages] = useState<SubscriptionMessageView[]>([])
  const [subscriptionRunning, setSubscriptionRunning] = useState(false)
  const subscriptionRef = useRef<{ close: () => void } | null>(null)
  const messageCounter = useRef(0)

  useEffect(() => {
    if (!endpoint) {
      setSchema(null)
      return
    }
    const cached = loadCachedSchema(endpoint)
    if (cached) setSchema(cached)
  }, [endpoint])

  const isSubscriptionQuery = /\bsubscription\b/.test(query)

  const execute = useCallback(async () => {
    if (!endpoint || !query.trim()) return

    let parsedVars: Record<string, unknown> = {}
    let parsedHeaders: Record<string, string> = {}
    try {
      if (variables.trim() && variables.trim() !== "{}") parsedVars = JSON.parse(variables)
      if (headers.trim() && headers.trim() !== "{}") parsedHeaders = JSON.parse(headers)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON in variables/headers")
      return
    }

    if (isSubscriptionQuery) {
      setSubscriptionMessages([])
      messageCounter.current = 0
      setSubscriptionRunning(true)
      setError(null)
      setResponse(null)
      try {
        const handle = subscribeGraphQL(endpoint, query, parsedVars, parsedHeaders, (msg) => {
          if (msg.type === "error") {
            messageCounter.current += 1
            setSubscriptionMessages((prev) => [
              ...prev,
              {
                id: messageCounter.current,
                type: "error",
                payload: msg.payload,
                timestamp: Date.now(),
              },
            ])
          } else if (msg.type === "complete") {
            messageCounter.current += 1
            setSubscriptionMessages((prev) => [
              ...prev,
              {
                id: messageCounter.current,
                type: "complete",
                payload: msg.payload ?? "complete",
                timestamp: Date.now(),
              },
            ])
            setSubscriptionRunning(false)
          } else if (msg.type === "data") {
            messageCounter.current += 1
            setSubscriptionMessages((prev) => [
              ...prev,
              {
                id: messageCounter.current,
                type: "data",
                payload: msg.payload,
                timestamp: Date.now(),
              },
            ])
          }
        })
        subscriptionRef.current = handle
      } catch (e) {
        setError(e instanceof Error ? e.message : "Subscription failed")
        setSubscriptionRunning(false)
      }
      return
    }

    setLoading(true)
    setError(null)
    setResponse(null)
    const started = Date.now()
    try {
      const result = await executeGraphQL({
        endpoint,
        query,
        variables: parsedVars,
        headers: parsedHeaders,
      })
      setResponse({ data: result.data, errors: result.errors })
      setStatus(result.statusCode)
      setTimeMs(result.responseTimeMs)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error")
      setStatus(0)
      setTimeMs(Date.now() - started)
    } finally {
      setLoading(false)
    }
  }, [endpoint, query, variables, headers, isSubscriptionQuery])

  const stop = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.close()
      subscriptionRef.current = null
    }
    setSubscriptionRunning(false)
  }, [])

  const introspect = useCallback(async () => {
    if (!endpoint) return
    setIntrospecting(true)
    try {
      const sdl = await introspectSchema(endpoint)
      const parsed = JSON.parse(sdl) as { __schema?: SchemaData }
      if (parsed.__schema) {
        setSchema(parsed.__schema)
        cacheSchema(endpoint, parsed.__schema)
      } else {
        setSchema(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Introspection failed")
    } finally {
      setIntrospecting(false)
    }
  }, [endpoint])

  const prettify = useCallback(() => {
    setQuery((q) => formatGraphQL(q))
  }, [])

  return (
    <div className="flex h-screen bg-background bg-dot-pattern">
      <ApiSidebar activePage="graphql" collapsed={isCollapsed} onCollapse={toggleSidebar} />
      <div
        className={cn(
          "flex flex-1 flex-col overflow-hidden transition-[margin] duration-200 ease-out main-content relative",
          isCollapsed ? "ml-[60px]" : "ml-64",
          "max-[916px]:ml-[60px]",
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent pointer-events-none" />
        <ApiHeader />
        <main className="flex-1 overflow-hidden flex flex-col" data-testid="graphql-page">
          <GraphqlAddressBar
            endpoint={endpoint}
            onEndpointChange={setEndpoint}
            onSend={execute}
            onStop={stop}
            running={loading || subscriptionRunning}
          />
          <GraphqlToolbar
            onIntrospect={introspect}
            onToggleSchema={() => setSchemaOpen((v) => !v)}
            onPrettify={prettify}
            schemaOpen={schemaOpen}
            introspecting={introspecting}
            canPrettify={!!query.trim()}
          />
          <div className="flex-1 overflow-auto flex flex-col">
            <QueryEditor value={query} onChange={setQuery} />
            <VariablesPanel value={variables} onChange={setVariables} defaultOpen={false} />
            {subscriptionRunning || subscriptionMessages.length > 0 ? (
              <SubscriptionViewer messages={subscriptionMessages} onStop={stop} />
            ) : (
              <ResponseViewer
                data={response?.data}
                errors={response?.errors}
                error={error}
                status={status}
                timeMs={timeMs}
                loading={loading}
              />
            )}
          </div>
        </main>
        {schemaOpen && (
          <SchemaBrowser
            schema={schema}
            loading={introspecting}
            onClose={() => setSchemaOpen(false)}
          />
        )}
      </div>
    </div>
  )
}
