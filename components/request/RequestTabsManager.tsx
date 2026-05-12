"use client"

import { useMemo, useState, type MouseEvent, useCallback } from "react"
import { Plus, X, Zap, Save, Clock } from "lucide-react"
import { RequestPanel, type QueryParam, type Header } from "@/components/layout/MainPanel"
import { ResponsePanel } from "@/components/layout/ResponsePanel"
import { HistoryPanel } from "@/components/shared/HistoryPanel"
import { CollectionsPanel } from "@/components/collections/CollectionTree"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useRequestStore, type RequestItem, type HistoryItem, type Collection, type HttpMethod } from "@/hooks/use-request-store"
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

type SidePanel = "response" | "history" | "collections"
type AuthType = "none" | "bearer" | "basic" | "api-key" | "oauth2"

interface RequestTab extends RequestItem {
  hasResponse: boolean
  responseStatus?: number
  responseTime?: number
  responseSize?: string
  responseBody?: unknown
  responseHeaders?: Record<string, string>
  responseError?: string
  authType: AuthType
  authToken: string
  bodyType: string
}

const defaultQueryParams: QueryParam[] = [
  { key: "page", value: "1" },
  { key: "limit", value: "10" },
  { key: "sort", value: "created_at" },
  { key: "order", value: "desc" },
  { key: "status", value: "active" },
  { key: "environment", value: "production" },
  { key: "include_metadata", value: "true" },
  { key: "search", value: "john" },
]

const defaultHeaders: Header[] = [
  { key: "Content-Type", value: "application/json" },
  { key: "Authorization", value: "Bearer sk_test_1234567890" },
  { key: "X-Request-ID", value: "req_873hsdj23" },
  { key: "X-Client", value: "Zendeeps-Space-UI" },
]

const defaultBody = `{
  "name": "John Doe",
  "email": "john@example.com",
  "role": "developer",
  "preferences": {
    "notifications": true,
    "theme": "light"
  }
}`

const initialTabs: RequestTab[] = [
  {
    id: "1",
    name: "Auth Login",
    method: "GET",
    url: "https://api.example.com/api/v1/auth/login",
    endpoint: "/api/v1/auth/login",
    queryParams: defaultQueryParams,
    headers: defaultHeaders,
    body: defaultBody,
    bodyType: "json",
    authType: "bearer",
    authToken: "sk_test_1234567890",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    hasResponse: false,
  },
]

function headersToObject(headers: Header[]) {
  return headers.reduce<Record<string, string>>((acc, header) => {
    if (header.key.trim() && header.value.trim()) {
      acc[header.key.trim()] = header.value.trim()
    }
    return acc
  }, {})
}

function objectToHeaders(headers?: Record<string, string>) {
  if (!headers) return []
  return Object.entries(headers).map(([key, value]) => ({ key, value }))
}

function queryParamsToObject(queryParams: QueryParam[]) {
  return queryParams.filter((param) => param.key.trim() && param.value.trim())
}

function buildRequestUrl(url: string, queryParams: QueryParam[]) {
  const queryString = queryParamsToObject(queryParams)
    .map((param) => `${encodeURIComponent(param.key)}=${encodeURIComponent(param.value)}`)
    .join("&")

  if (!queryString) return url
  return `${url}${url.includes("?") ? "&" : "?"}${queryString}`
}

function resolveVariables(text: string, environment?: { variables: Record<string, string> }) {
  if (!environment) return text
  let resolved = text
  Object.entries(environment.variables).forEach(([key, value]) => {
    resolved = resolved.replace(new RegExp(`{{${key}}}`, 'g'), value)
  })
  // Dynamic variables
  resolved = resolved.replace(/{{\$uuid}}/g, () => crypto.randomUUID())
  resolved = resolved.replace(/{{\$timestamp}}/g, () => Date.now().toString())
  resolved = resolved.replace(/{{\$randomEmail}}/g, () => `test${Math.random().toString(36).substring(2)}@example.com`)
  return resolved
}

export function RequestTabsManager() {
  const [tabs, setTabs] = useState<RequestTab[]>(initialTabs)
  const [activeTabId, setActiveTabId] = useState(initialTabs[0].id)
  const [sidePanel, setSidePanel] = useState<SidePanel>("response")
  const [isSending, setIsSending] = useState(false)

  const {
    history,
    collections,
    environments,
    addToHistory,
    clearHistory,
    removeFromHistory,
    addCollection,
    deleteCollection,
    addRequestToCollection,
    setActiveEnvironment,
    getActiveEnvironment,
  } = useRequestStore()

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) || tabs[0],
    [tabs, activeTabId]
  )

  // Keyboard shortcuts
  const shortcuts = useMemo(() => [
    { key: "Enter", ctrl: true, action: handleSend, description: "Send request" },
    { key: "t", ctrl: true, action: addNewTab, description: "New request tab" },
    { key: "s", ctrl: true, action: saveTest, description: "Save request" },
    { key: "h", ctrl: true, action: () => setSidePanel("history"), description: "Toggle history" },
    { key: "e", ctrl: true, action: () => setSidePanel("collections"), description: "Toggle collections" },
  ], [handleSend, addNewTab, saveTest, setSidePanel])

  useKeyboardShortcuts(shortcuts)

  const updateTab = (id: string, updates: Partial<RequestTab>) => {
    setTabs((currentTabs) =>
      currentTabs.map((tab) => (tab.id === id ? { ...tab, ...updates, updatedAt: Date.now() } : tab))
    )
  }

  const addNewTab = useCallback(() => {
    const newId = `${Date.now()}`
    const newTab: RequestTab = {
      id: newId,
      name: `New Request ${tabs.length + 1}`,
      method: "GET",
      url: "https://api.example.com/api/v1/",
      endpoint: "/api/v1/",
      queryParams: defaultQueryParams,
      headers: defaultHeaders,
      body: defaultBody,
      bodyType: "json",
      authType: "bearer",
      authToken: "sk_test_1234567890",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      hasResponse: false,
    }
    setTabs((currentTabs) => [...currentTabs, newTab])
    setActiveTabId(newId)
    setSidePanel("response")
  }, [tabs.length, setTabs, setActiveTabId, setSidePanel])

  const closeTab = useCallback((id: string, event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (tabs.length === 1) return

    setTabs((currentTabs) => {
      const nextTabs = currentTabs.filter((tab) => tab.id !== id)
      if (activeTabId === id) {
        setActiveTabId(nextTabs[nextTabs.length - 1].id)
      }
      return nextTabs
    })
  }, [tabs, activeTabId, setTabs, setActiveTabId])

  const duplicateTab = useCallback((tab: RequestTab) => {
    const newId = `${Date.now()}`
    const newTab: RequestTab = {
      ...tab,
      id: newId,
      name: `${tab.name} (copy)`,
      hasResponse: false,
      responseStatus: undefined,
      responseTime: undefined,
      responseSize: undefined,
      responseBody: undefined,
      responseHeaders: undefined,
      responseError: undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    setTabs((currentTabs) => [...currentTabs, newTab])
    setActiveTabId(newId)
    setSidePanel("response")
  }, [setTabs, setActiveTabId, setSidePanel])

  const saveTest = useCallback(() => {
    const historyItem: Omit<HistoryItem, "id" | "executedAt" | "createdAt" | "updatedAt"> = {
      name: activeTab.name,
      method: activeTab.method,
      url: activeTab.url,
      endpoint: activeTab.endpoint,
      headers: headersToObject(activeTab.headers),
      body: activeTab.body,
      queryParams: activeTab.queryParams,
      responseStatus: activeTab.responseStatus,
      responseTime: activeTab.responseTime,
      responseSize: activeTab.responseSize,
    }
    addToHistory(historyItem)
    setSidePanel("history")
  }, [activeTab, addToHistory, setSidePanel])

  const loadRequest = (request: RequestItem) => {
    updateTab(activeTab.id, {
      name: request.name,
      method: request.method,
      url: request.url,
      endpoint: request.endpoint,
      headers: objectToHeaders(request.headers),
      body: request.body ?? defaultBody,
      queryParams: request.queryParams ?? defaultQueryParams,
    })
    setSidePanel("response")
  }

  const handleSend = useCallback(async () => {
    const activeEnv = getActiveEnvironment()
    const method = activeTab.method
    const rawUrl = activeTab.url
    const resolvedUrl = resolveVariables(rawUrl, activeEnv)
    const fullUrl = buildRequestUrl(resolvedUrl, activeTab.queryParams)
    const rawHeaders = headersToObject(activeTab.headers)
    const resolvedHeaders = Object.fromEntries(
      Object.entries(rawHeaders).map(([key, value]) => [key, resolveVariables(value, activeEnv)])
    )
    const headers = { ...resolvedHeaders }

    if (activeTab.authType === "bearer" && activeTab.authToken.trim()) {
      headers.Authorization = `Bearer ${resolveVariables(activeTab.authToken.trim(), activeEnv)}`
    }
    if (activeTab.authType === "basic" && activeTab.authToken.trim()) {
      headers.Authorization = `Basic ${resolveVariables(activeTab.authToken.trim(), activeEnv)}`
    }
    if (activeTab.authType === "api-key" && activeTab.authToken.trim()) {
      headers["x-api-key"] = resolveVariables(activeTab.authToken.trim(), activeEnv)
    }

    const init: RequestInit = {
      method,
      headers,
    }

    if (!["GET", "DELETE"].includes(method) && activeTab.body.trim()) {
      if (activeTab.bodyType === "json") {
        init.body = resolveVariables(activeTab.body, activeEnv)
        headers["Content-Type"] = "application/json"
      } else if (activeTab.bodyType === "x-www-form") {
        const params = new URLSearchParams()
        try {
          const data = JSON.parse(activeTab.body)
          Object.entries(data).forEach(([key, value]) => {
            params.append(key, String(value))
          })
        } catch {
          // If not JSON, treat as raw
          params.set("data", activeTab.body)
        }
        init.body = params.toString()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
      } else if (activeTab.bodyType === "xml") {
        init.body = resolveVariables(activeTab.body, activeEnv)
        headers["Content-Type"] = "application/xml"
      } else {
        init.body = resolveVariables(activeTab.body, activeEnv)
      }
    }

    setIsSending(true)
    setSidePanel("response")

    try {
      const startedAt = performance.now()
      const response = await fetch(fullUrl, init)
      const finishedAt = performance.now()
      const duration = Math.round(finishedAt - startedAt)
      const text = await response.text()
      let parsedBody: unknown = text
      try {
        parsedBody = JSON.parse(text)
      } catch {
        parsedBody = text
      }

      const responseHeaders: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value
      })

      const responseSize = `${new TextEncoder().encode(text).length} B`
      updateTab(activeTab.id, {
        hasResponse: true,
        responseStatus: response.status,
        responseTime: duration,
        responseSize,
        responseBody: parsedBody,
        responseHeaders,
        responseError: response.ok ? undefined : `HTTP ${response.status}`,
      })

      addToHistory({
        name: activeTab.name,
        method: activeTab.method,
        url: activeTab.url,
        endpoint: activeTab.endpoint,
        headers,
        body: activeTab.body,
        queryParams: activeTab.queryParams,
        responseStatus: response.status,
        responseTime: duration,
        responseSize,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network error"
      updateTab(activeTab.id, {
        hasResponse: true,
        responseStatus: undefined,
        responseTime: undefined,
        responseSize: undefined,
        responseBody: undefined,
        responseHeaders: undefined,
        responseError: message,
      })
      addToHistory({
        name: activeTab.name,
        method: activeTab.method,
        url: activeTab.url,
        endpoint: activeTab.endpoint,
        headers,
        body: activeTab.body,
        queryParams: activeTab.queryParams,
        responseStatus: undefined,
        responseTime: undefined,
        responseSize: undefined,
      })
    } finally {
      setIsSending(false)
    }
  }, [activeTab, getActiveEnvironment, updateTab, addToHistory, setSidePanel, setIsSending])

  const addCollectionRequest = (collectionId: string) => {
    addRequestToCollection(collectionId, {
      name: activeTab.name,
      method: activeTab.method,
      url: activeTab.url,
      endpoint: activeTab.endpoint,
      headers: headersToObject(activeTab.headers),
      body: activeTab.body,
      queryParams: activeTab.queryParams,
    })
    setSidePanel("collections")
  }

  const createCollection = () => {
    addCollection({
      name: `Collection ${collections.length + 1}`,
      description: "Saved request group",
      color: "blue",
      icon: "package",
    })
    setSidePanel("collections")
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center border-b border-border bg-muted/30">
        <div className="flex flex-1 items-center gap-1 overflow-x-auto px-2 py-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={cn(
                "group relative flex shrink-0 items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                activeTabId === tab.id
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/50 hover:text-foreground"
              )}
            >
              <Badge className={cn("h-4 px-1.5 text-[10px] font-bold", {
                "bg-emerald-500 text-white": tab.method === "GET",
                "bg-blue-500 text-white": tab.method === "POST",
                "bg-amber-500 text-white": tab.method === "PUT",
                "bg-purple-500 text-white": tab.method === "PATCH",
                "bg-red-500 text-white": tab.method === "DELETE",
              })}
              >
                {tab.method}
              </Badge>
              <span className="max-w-[120px] truncate">{tab.name}</span>
              {tab.hasResponse && <span className="flex size-2 rounded-full bg-emerald-500" />}
              {tabs.length > 1 && (
                <button
                  onClick={(event) => closeTab(tab.id, event)}
                  className="ml-1 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              )}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-1 border-l border-border px-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={addNewTab}
            className="h-7 gap-1.5 px-2 text-xs"
          >
            <Plus className="size-3.5" />
            New
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-emerald-500" />
          <span className="font-semibold text-foreground">API Endpoints</span>
          <span className="text-muted-foreground">{">"}</span>
          <span className="text-muted-foreground">{activeTab.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Env:</span>
            <Select
              value={getActiveEnvironment()?.id || ""}
              onValueChange={(value) => setActiveEnvironment(value)}
            >
              <SelectTrigger className="w-32 h-8">
                <SelectValue placeholder="Environment" />
              </SelectTrigger>
              <SelectContent>
                {environments.map((env) => (
                  <SelectItem key={env.id} value={env.id}>
                    {env.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => duplicateTab(activeTab)}
          >
            <Plus className="size-4" />
            Duplicate
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={saveTest}
          >
            <Save className="size-4" />
            Save Test
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setSidePanel("history")}
          >
            <Clock className="size-4" />
            History
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3 px-6 py-3">
        <Badge className={cn("px-3 py-1", {
          "bg-emerald-500 text-white": activeTab.method === "GET",
          "bg-blue-500 text-white": activeTab.method === "POST",
          "bg-amber-500 text-white": activeTab.method === "PUT",
          "bg-purple-500 text-white": activeTab.method === "PATCH",
          "bg-red-500 text-white": activeTab.method === "DELETE",
        })}
        >
          {activeTab.method}
        </Badge>
        <span className="text-sm text-muted-foreground">{activeTab.endpoint}</span>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 overflow-auto border-r border-border">
          <RequestPanel
            key={activeTab.id}
            method={activeTab.method}
            url={activeTab.url}
            queryParams={activeTab.queryParams}
            headers={activeTab.headers}
            bodyContent={activeTab.body}
            bodyType={activeTab.bodyType}
            authType={activeTab.authType}
            authToken={activeTab.authToken}
            onMethodChange={(method) => updateTab(activeTab.id, { method })}
            onUrlChange={(url) => {
              const endpoint = url.replace(/^https?:\/\//, "").replace(/^[^/]+/, "") || "/"
              updateTab(activeTab.id, { url, endpoint })
            }}
            onQueryParamsChange={(queryParams) => updateTab(activeTab.id, { queryParams })}
            onHeadersChange={(headers) => updateTab(activeTab.id, { headers })}
            onBodyChange={(body) => updateTab(activeTab.id, { body })}
            onBodyTypeChange={(bodyType) => updateTab(activeTab.id, { bodyType })}
            onAuthChange={(authType, authToken) => updateTab(activeTab.id, { authType, authToken })}
            onSend={handleSend}
          />
        </div>

        <div className="w-1/2 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-muted/20 px-6 py-3">
            <div className="font-semibold text-foreground">
              {sidePanel === "response" ? "Response" : sidePanel === "history" ? "History" : "Collections"}
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-8 px-3 text-xs", sidePanel === "response" ? "bg-background text-foreground" : "text-muted-foreground")}
                onClick={() => setSidePanel("response")}
              >
                Response
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-8 px-3 text-xs", sidePanel === "history" ? "bg-background text-foreground" : "text-muted-foreground")}
                onClick={() => setSidePanel("history")}
              >
                History
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn("h-8 px-3 text-xs", sidePanel === "collections" ? "bg-background text-foreground" : "text-muted-foreground")}
                onClick={() => setSidePanel("collections")}
              >
                Collections
              </Button>
            </div>
          </div>

          <div className="h-full overflow-hidden">
            {sidePanel === "response" && (
              <ResponsePanel
                request={activeTab}
                response={{
                  status: activeTab.responseStatus,
                  time: activeTab.responseTime,
                  size: activeTab.responseSize,
                  headers: activeTab.responseHeaders,
                  body: activeTab.responseBody,
                  error: activeTab.responseError,
                }}
                isRunning={isSending}
                onRun={handleSend}
                onExplainError={(error, status) => {
                  const explanation = status >= 400 && status < 500
                    ? `This ${status} error typically means there's an issue with the request. Common causes: missing authentication, invalid parameters, or resource not found. Check your headers and URL.`
                    : status >= 500
                    ? `This ${status} error indicates a server-side problem. The API server is having issues processing your request. Try again later or contact the API provider.`
                    : "Unable to determine the cause of this error."
                  alert(`AI Explanation:\n${explanation}`)
                }}
              />
            )}

            {sidePanel === "history" && (
              <HistoryPanel
                history={history}
                onSelectRequest={loadRequest}
                onClearHistory={clearHistory}
                onRemoveItem={removeFromHistory}
              />
            )}

            {sidePanel === "collections" && (
              <CollectionsPanel
                collections={collections}
                onSelectRequest={loadRequest}
                onAddCollection={createCollection}
                onDeleteCollection={deleteCollection}
                onAddRequestToCollection={addCollectionRequest}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
