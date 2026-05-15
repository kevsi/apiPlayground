"use client"

import { useEffect, useState, useCallback } from "react"
import { Plus, X, Zap, Save, Clock, Folder, CheckCircle } from "lucide-react"
import { RequestPanel } from "@/components/request-panel"
import { ResponsePanel } from "@/components/response-panel"
import { CollectionsModal } from "@/components/collections-modal"
import { HistoryPanel } from "@/components/history-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { toast } from "sonner"
import { cn, downloadJson, interpolate, replaceLocalhostPort } from "@/lib/utils"
import { invoke } from '@tauri-apps/api/core'
import { invokeTauriFetch, isTauriAvailable, loadTauriTabsState, saveTauriTabsState, type TauriStorageState } from "@/lib/tauri"
import { useRequestStore, type HistoryItem, type RequestItem } from "@/hooks/use-request-store"

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

interface RequestTab {
  id: string
  name: string
  method: HttpMethod
  url: string
  endpoint: string
  headers: Header[]
  queryParams: QueryParam[]
  body: string
  bodyType: BodyType
  authType: AuthType
  authToken: string
  hasResponse: boolean
  isSaved: boolean          // false = unsaved (like VS Code Untitled)
  responseStatus?: number
  responseTime?: number
  responseSize?: string
  responseBody?: string
  responseData?: string | Blob
  responseHeaders?: Record<string, string>
}

const methodColors: Record<HttpMethod, string> = {
  GET: "bg-emerald-500 text-white",
  POST: "bg-blue-500 text-white",
  PUT: "bg-amber-500 text-white",
  PATCH: "bg-purple-500 text-white",
  DELETE: "bg-red-500 text-white",
}

const defaultQueryParams: QueryParam[] = []

const defaultHeaders: Header[] = []

const defaultBody = ""

const STORAGE_KEY_TABS = "zendeeps-request-tabs"

const initialTabs: RequestTab[] = [
  {
    id: "1",
    name: "New Request",
    method: "GET",
    url: "",
    endpoint: "",
    headers: defaultHeaders,
    queryParams: defaultQueryParams,
    body: defaultBody,
    bodyType: "json",
    authType: "none",
    authToken: "",
    hasResponse: false,
    isSaved: false,
  },
]

const formatSize = (size: number) => {
  if (size < 1024) return `${size} B`
  return `${Math.round(size / 1024)} KB`
}

const headersArrayToRecord = (headers: Header[]) =>
  Object.fromEntries(
    headers
      .filter((header) => header.key.trim() && header.value.trim())
      .map((header) => [header.key.trim(), header.value.trim()])
  )

const recordToHeaderArray = (headers?: Record<string, string>) =>
  headers ? Object.entries(headers).map(([key, value]) => ({ key, value })) : []

const sanitizeUrl = (url: string) => {
  let sanitized = url.trim()
  sanitized = sanitized.replace(/%20/gi, " ")
  sanitized = sanitized.replace(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)(?:\s+|%20)+/i, "")
  sanitized = sanitized.replace(/^(https?:)\/(?!\/)/i, "$1://")
  sanitized = sanitized.replace(/^(https?:)\s*:\s*\/\s*\/+/i, "$1://")
  return sanitized
}

const normalizeUrl = (url: string) => {
  const sanitizedUrl = sanitizeUrl(url)

  if (sanitizedUrl.startsWith("//")) {
    return `https:${sanitizedUrl}`
  }

  if (!/^https?:\/\//i.test(sanitizedUrl)) {
    const hostLike = /^[^/?#\s]+\.[^/?#\s]+/.test(sanitizedUrl)
    if (hostLike) {
      return `https://${sanitizedUrl}`
    }
  }

  return sanitizedUrl
}

const buildUrl = (url: string, queryParams: QueryParam[]) => {
  const normalizedUrl = normalizeUrl(url)

  try {
    const finalUrl = new URL(normalizedUrl)
    queryParams.forEach((param) => {
      if (param.key.trim() && param.value.trim()) {
        finalUrl.searchParams.set(param.key.trim(), param.value.trim())
      }
    })
    return finalUrl.toString()
  } catch {
    const params = queryParams
      .filter((param) => param.key.trim() && param.value.trim())
      .map((param) => `${encodeURIComponent(param.key.trim())}=${encodeURIComponent(param.value.trim())}`)
      .join("&")
    return normalizedUrl + (normalizedUrl.includes("?") ? "&" : "?") + params
  }
}

const buildHeaders = (headers: Header[], authType: AuthType, authToken: string) => {
  const headerEntries: Array<[string, string]> = []
  headers.forEach((header) => {
    if (header.key.trim() && header.value.trim()) {
      headerEntries.push([header.key.trim(), header.value.trim()])
    }
  })

  const token = authToken.trim()
  if (token && authType !== "none") {
    if (authType === "bearer" || authType === "oauth2") {
      headerEntries.push(["Authorization", `Bearer ${token}`])
    } else if (authType === "basic") {
      headerEntries.push(["Authorization", `Basic ${token}`])
    } else if (authType === "api-key") {
      headerEntries.push(["x-api-key", token])
    }
  }

  return Object.fromEntries(headerEntries)
}

export function RequestTabsManager() {
  const [tabs, setTabs] = useState<RequestTab[]>(initialTabs)
  const [activeTabId, setActiveTabId] = useState(initialTabs[0].id)
  const [collectionsDrawerOpen, setCollectionsDrawerOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isTabsLoaded, setIsTabsLoaded] = useState(false)
  const [savedIndicator, setSavedIndicator] = useState(false)

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0]
  const [nativeMode, setNativeMode] = useState(false)

  const sanitizeTabForStorage = (tab: RequestTab) => {
    const { responseData, ...rest } = tab
    return rest
  }

  useEffect(() => {
    const tauriAvailable = isTauriAvailable()
    setNativeMode(tauriAvailable)

    const loadState = async () => {
      if (tauriAvailable) {
        try {
          const stored = await loadTauriTabsState()
          if (stored && Array.isArray(stored.tabs) && stored.tabs.length > 0) {
            // Restore tabs preserving their original isSaved state
            setTabs(stored.tabs as unknown as RequestTab[])
            if (stored.activeTabId && stored.tabs.some((tab: any) => tab.id === stored.activeTabId)) {
              setActiveTabId(stored.activeTabId)
            }
          }
        } catch {
          // ignore load errors and fallback to localStorage
        }
      }

      if (!tauriAvailable) {
        const stored = localStorage.getItem(STORAGE_KEY_TABS)
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as { tabs: Array<Omit<RequestTab, "responseData">>; activeTabId: string }
            if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
              // Restore tabs preserving their original isSaved state
              setTabs(parsed.tabs as RequestTab[])
              if (parsed.activeTabId && parsed.tabs.some((tab) => tab.id === parsed.activeTabId)) {
                setActiveTabId(parsed.activeTabId)
              }
            }
          } catch {
            setTabs(initialTabs)
            setActiveTabId(initialTabs[0].id)
          }
        }
      }

      setIsTabsLoaded(true)
    }

    loadState()
  }, [])

  useEffect(() => {
    if (!isTabsLoaded) return

    // Persist all tabs so no work is lost when navigating between pages
    const persistTabs = async () => {
      const payload: TauriStorageState = {
        tabs: tabs.map(sanitizeTabForStorage) as unknown as TauriStorageState["tabs"],
        activeTabId,
      }

      if (nativeMode) {
        try {
          await saveTauriTabsState(payload)
          return
        } catch {
          // fallback to localStorage
        }
      }

      localStorage.setItem(
        STORAGE_KEY_TABS,
        JSON.stringify({
          tabs: tabs.map(sanitizeTabForStorage),
          activeTabId,
        }),
      )
    }

    persistTabs()
  }, [tabs, activeTabId, isTabsLoaded, nativeMode])

  const {
    history,
    collections,
    environments,
    activeEnvironmentId,
    projects,
    selectedProjectId,
    setSelectedProject,
    addToHistory,
    clearHistory,
    removeFromHistory,
    addCollection,
    updateCollection,
    deleteCollection,
    addRequestToCollection,
    removeRequestFromCollection,
    updateRequestInCollection,
    addProject,
    updateProject,
    deleteProject,
  } = useRequestStore()

  const activeProject = projects.find((p) => p.id === selectedProjectId) ?? null
  const activeProjectPort = activeProject?.port ?? 3000
  const activeEnv = environments.find((e) => e.id === activeEnvironmentId)
  const envVars = activeEnv?.variables || []

  useEffect(() => {
    setNativeMode(isTauriAvailable())
  }, [])

  const addNewTab = () => {
    const newId = `${Date.now()}`
    const newTab: RequestTab = {
      id: newId,
      name: `New Request ${tabs.length + 1}`,
      method: "GET",
      url: "",
      endpoint: "",
      headers: defaultHeaders,
      queryParams: defaultQueryParams,
      body: defaultBody,
      bodyType: "json",
      authType: "none",
      authToken: "",
      hasResponse: false,
      isSaved: false,
    }
    setTabs([...tabs, newTab])
    setActiveTabId(newId)
  }

  // First-save: marks tab as saved so auto-save kicks in for future changes
  const saveActiveTab = useCallback(() => {
    if (!activeTab) return
    if (activeTab.isSaved) {
      // Already saved — just show indicator
      setSavedIndicator(true)
      setTimeout(() => setSavedIndicator(false), 2000)
      return
    }
    setTabs((cur) =>
      cur.map((t) => (t.id === activeTab.id ? { ...t, isSaved: true } : t))
    )
    setSavedIndicator(true)
    setTimeout(() => setSavedIndicator(false), 2000)
    toast.success(`"${activeTab.name}" enregistré`)
  }, [activeTab])

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (tabs.length === 1) return

    const newTabs = tabs.filter((t) => t.id !== id)
    setTabs(newTabs)

    if (activeTabId === id) {
      setActiveTabId(newTabs[newTabs.length - 1].id)
    }
  }

  const updateTab = (id: string, updates: Partial<RequestTab>) => {
    setTabs((currentTabs) => currentTabs.map((t) => (t.id === id ? { ...t, ...updates } : t)))
  }

  const duplicateTab = (tab: RequestTab) => {
    const newId = `${Date.now()}`
    const duplicatedTab: RequestTab = {
      ...tab,
      id: newId,
      name: `${tab.name} Copy`,
      hasResponse: false,
      responseBody: undefined,
      responseData: undefined,
      responseHeaders: undefined,
      responseStatus: undefined,
      responseTime: undefined,
      responseSize: undefined,
    }
    setTabs([...tabs, duplicatedTab])
    setActiveTabId(newId)
  }

  const buildTabFromRequest = (request: RequestItem | HistoryItem): Partial<RequestTab> => ({
    name: request.name,
    method: request.method,
    url: replaceLocalhostPort(request.url, activeProjectPort),
    endpoint: request.endpoint,
    headers: recordToHeaderArray(request.headers),
    queryParams: request.queryParams ?? [],
    body: request.body ?? "",
    bodyType: "json",
    authType: "none",
    authToken: "",
    hasResponse: false,
    responseBody: undefined,
    responseData: undefined,
    responseHeaders: undefined,
    responseStatus: undefined,
    responseTime: undefined,
    responseSize: undefined,
  })

  const loadRequestIntoActiveTab = (request: RequestItem | HistoryItem) => {
    updateTab(activeTab.id, buildTabFromRequest(request))
  }



  const exportActiveRequest = async () => {
    // Détection live de Tauri v2 — ne dépend pas du state nativeMode qui peut être stale
    const isTauri = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__
    console.log('[EXPORT] Bouton cliqué — isTauri (live) =', isTauri, '| nativeMode (state) =', nativeMode)

    if (!activeTab) return

    const requestData = {
      method: activeTab.method,
      url: activeTab.url,
      requestHeaders: activeTab.headers,
      body: activeTab.body,
      bodyType: activeTab.bodyType,
      authType: activeTab.authType,
      authToken: activeTab.authToken,
    }

    if (isTauri) {
      console.log('[EXPORT] → invoke(export_json)')
      try {
        const jsonContent = JSON.stringify(requestData, null, 2)
        const savedPath = await invoke<string>('export_json', {
          content: jsonContent,
          defaultName: 'request.json',
        })
        console.log('[EXPORT] ✅ Sauvegardé :', savedPath)
        toast.success(`Fichier sauvegardé : ${savedPath}`)
      } catch (error: any) {
        console.error('[EXPORT] ❌ Erreur invoke :', error, JSON.stringify(error))
        if (error === 'cancelled') return
        toast.error(`Erreur export : ${String(error)}`)
        // Fallback navigateur
        downloadJson(requestData, 'request.json')
      }
    } else {
      console.log('[EXPORT] → downloadJson (navigateur)')
      downloadJson(requestData, 'request.json')
      toast.success('Téléchargement démarré')
    }
  }

  const createNewCollection = (data?: any) => {
    return addCollection({
      name: data?.name || "New Collection",
      color: data?.color || "emerald",
      icon: data?.icon || "package",
    })
  }

  const renameCollection = (id: string, name: string) => {
    updateCollection(id, { name })
  }

  const handleAddRequestToCollection = (collectionId: string, request?: any) => {
    if (request) {
      addRequestToCollection(collectionId, request)
    } else if (activeTab?.url) {
      addRequestToCollection(collectionId, {
        name: activeTab.name,
        method: activeTab.method,
        url: activeTab.url,
        endpoint: activeTab.endpoint,
        headers: headersArrayToRecord(activeTab.headers),
        body: activeTab.body,
        queryParams: activeTab.queryParams,
      })
    } else {
      // No request provided and no active tab URL — create a default empty request
      addRequestToCollection(collectionId, {
        name: "New Request",
        method: "GET",
        url: "",
        endpoint: "",
        headers: {},
        body: "",
        queryParams: [],
      })
    }
  }

  const sendRequest = () => sendSpecificRequest(activeTab)

  const sendSpecificRequest = async (tabToSend: RequestTab) => {
    if (!tabToSend?.url) return

    // Interpolate values
    const resolvedUrl = replaceLocalhostPort(tabToSend.url, activeProjectPort)
    const rawUrl = buildUrl(resolvedUrl, tabToSend.queryParams)
    const rawHeaders = buildHeaders(tabToSend.headers, tabToSend.authType, tabToSend.authToken)
    const rawBody = tabToSend.body || ""

    const finalUrl = interpolate(rawUrl, envVars)
    const finalBody = interpolate(rawBody, envVars)
    
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(rawHeaders)) {
      headers[interpolate(key, envVars)] = interpolate(value, envVars)
    }

    const requestInit: RequestInit = {
      method: tabToSend.method,
      headers,
    }

    if (tabToSend.method !== "GET" && finalBody) {
      requestInit.body = finalBody
    }

    const startedAt = performance.now()
    let responseBody = ""
    let responseData: string | Blob = ""
    let responseHeaders: Record<string, string> = {}
    let responseStatus: number | undefined
    let responseSize = "0 B"
    let responseTime: number | undefined

    setIsLoading(true)
    try {
      if (nativeMode) {
        const result = await invokeTauriFetch(tabToSend.method, finalUrl, headers, tabToSend.method !== "GET" ? finalBody : undefined)
        responseStatus = result.status
        responseHeaders = result.headers
        responseBody = result.body
        responseData = result.body
        responseSize = formatSize(new Blob([responseBody]).size)
        responseTime = result.durationMs
      } else {
        const proxyResponse = await fetch("/api/proxy", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: finalUrl,
            method: tabToSend.method,
            headers,
            body: tabToSend.method !== "GET" ? finalBody : undefined,
          }),
        })

        const proxyResult = await proxyResponse.json()

        if (proxyResponse.ok) {
          responseStatus = proxyResult.status
          responseHeaders = proxyResult.headers || {}
          responseBody = proxyResult.body ?? ""
          responseData = responseBody
          responseSize = formatSize(new Blob([responseBody]).size)
        } else {
          responseStatus = proxyResult.status ?? 0
          responseBody = proxyResult.error || "Proxy request failed"
          responseData = responseBody
          responseSize = formatSize(new Blob([responseBody]).size)
        }
      }
    } catch (error) {
      responseBody = error instanceof Error ? `Error: ${error.message}` : String(error)
      responseData = responseBody
      responseStatus = 0
    } finally {
      setIsLoading(false)
    }

    if (responseTime === undefined) {
      responseTime = Math.round(performance.now() - startedAt)
    }

    updateTab(tabToSend.id, {
      hasResponse: true,
      responseStatus,
      responseTime,
      responseSize,
      responseBody,
      responseData,
      responseHeaders,
    })

    addToHistory({
      name: tabToSend.name,
      method: tabToSend.method,
      url: tabToSend.url,
      endpoint: tabToSend.endpoint,
      headers: headersArrayToRecord(tabToSend.headers),
      body: tabToSend.body,
      queryParams: tabToSend.queryParams,
      responseStatus,
      responseTime,
      responseSize,
    })
  }

  const loadAndSendRequest = async (request: RequestItem | HistoryItem) => {
    const tempTab: RequestTab = {
      ...activeTab,
      ...buildTabFromRequest(request),
    } as RequestTab
    
    setTabs((currentTabs) => currentTabs.map((t) => (t.id === activeTab.id ? tempTab : t)))
    await sendSpecificRequest(tempTab)
  }

  const addNewQueryParam = () => {
    updateTab(activeTab.id, {
      queryParams: [...activeTab.queryParams, { key: "", value: "" }],
    })
  }

  const removeQueryParam = (index: number) => {
    updateTab(activeTab.id, {
      queryParams: activeTab.queryParams.filter((_, i) => i !== index),
    })
  }

  const setQueryParam = (index: number, field: "key" | "value", value: string) => {
    const next = activeTab.queryParams.map((param, i) =>
      i === index ? { ...param, [field]: value } : param,
    )
    updateTab(activeTab.id, { queryParams: next })
  }

  const addNewHeader = () => {
    updateTab(activeTab.id, { headers: [...activeTab.headers, { key: "", value: "" }] })
  }

  const removeHeader = (index: number) => {
    updateTab(activeTab.id, { headers: activeTab.headers.filter((_, i) => i !== index) })
  }

  const setHeader = (index: number, field: "key" | "value", value: string) => {
    const next = activeTab.headers.map((header, i) =>
      i === index ? { ...header, [field]: value } : header,
    )
    updateTab(activeTab.id, { headers: next })
  }

  // Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault()
        saveActiveTab()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [saveActiveTab])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Tabs Bar */}
      <div className="flex items-center border-b border-border bg-muted/30">
        <div className="flex flex-1 items-center gap-1 overflow-x-auto scrollbar-discreet px-2 py-1.5">
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
              <Badge className={cn("h-4 px-1.5 text-[10px] font-bold", methodColors[tab.method])}>
                {tab.method}
              </Badge>
              <span className="max-w-[120px] truncate">{tab.name}</span>
              {/* Unsaved dot — orange like VS Code */}
              {!tab.isSaved && (
                <span
                  title="Non sauvegardé — Ctrl+S pour sauvegarder"
                  className="flex size-2 rounded-full bg-orange-400"
                />
              )}
              {tab.isSaved && tab.hasResponse && (
                <span className="flex size-2 rounded-full bg-emerald-500" />
              )}
              {tabs.length > 1 && (
                <button
                  onClick={(e) => closeTab(tab.id, e)}
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

      {/* Breadcrumb & Actions */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <Zap className="size-4 text-emerald-500" />
          <span className="font-semibold text-foreground">API Endpoints</span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setCollectionsDrawerOpen(true)}
          >
            <Folder className="size-4" />
            Collections
          </Button>
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
            className={cn(
              "transition-colors",
              !activeTab.isSaved
                ? "text-orange-500 hover:text-orange-600"
                : "text-muted-foreground"
            )}
            onClick={saveActiveTab}
            title="Sauvegarder (Ctrl+S)"
          >
            <Save className="size-4" />
            {activeTab.isSaved ? "Saved" : "Save"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={exportActiveRequest}
          >
            <Save className="size-4" />
            Export JSON
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setHistoryOpen(true)}
          >
            <Clock className="size-4" />
            History
          </Button>
        </div>
      </div>

      {/* Endpoint Badge */}
      <div className="flex items-center gap-3 px-6 py-3">
        <Badge className={cn("px-3 py-1", methodColors[activeTab.method])}>
          {activeTab.method}
        </Badge>
        <Input 
          value={activeTab.name}
          onChange={(e) => updateTab(activeTab.id, { name: e.target.value })}
          className="h-8 max-w-[200px] font-medium border-transparent hover:border-input focus-visible:border-input bg-transparent px-2"
          placeholder="Request Name"
        />
        <span className="text-sm text-muted-foreground hidden sm:inline-block truncate max-w-[300px]">{activeTab.endpoint}</span>
        {savedIndicator && (
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 animate-in fade-in duration-300">
            <CheckCircle className="size-3" />
            Enregistré
          </div>
        )}
      </div>

      {/* Main Panels - 50/50 */}
      <div className="grid h-full flex-1 grid-cols-2 overflow-hidden">
        <div className="min-w-0 overflow-auto hide-scrollbar border-r border-border">
          <RequestPanel
            key={activeTab.id}
            method={activeTab.method}
            url={activeTab.url}
            queryParams={activeTab.queryParams}
            headers={activeTab.headers}
            body={activeTab.body}
            bodyType={activeTab.bodyType}
            authType={activeTab.authType}
            authToken={activeTab.authToken}
            onMethodChange={(method) => updateTab(activeTab.id, { method })}
            onUrlChange={(url) => {
              const endpoint = url.replace(/^https?:\/\/[^/]+/, "") || "/"
              updateTab(activeTab.id, { url, endpoint })
            }}
            onQueryParamsChange={(queryParams) => updateTab(activeTab.id, { queryParams })}
            onHeadersChange={(headers) => updateTab(activeTab.id, { headers })}
            onBodyChange={(body) => updateTab(activeTab.id, { body })}
            onBodyTypeChange={(bodyType) => updateTab(activeTab.id, { bodyType })}
            onAuthChange={(authType, authToken) => updateTab(activeTab.id, { authType, authToken })}
            onSend={sendRequest}
          />
        </div>

        <div className="min-w-0 overflow-hidden">
          <ResponsePanel
            key={activeTab.id}
            responseBody={activeTab.responseBody}
            responseData={activeTab.responseData}
            responseStatus={activeTab.responseStatus}
            responseTime={activeTab.responseTime}
            responseSize={activeTab.responseSize}
            responseHeaders={activeTab.responseHeaders}
            isLoading={isLoading}
            onRun={sendRequest}
            method={activeTab.method}
            url={activeTab.url}
            requestHeaders={activeTab.headers}
            body={activeTab.body}
            bodyType={activeTab.bodyType}
            authType={activeTab.authType}
            authToken={activeTab.authToken}
          />
        </div>
      </div>

      {/* Collections Modal */}
      <CollectionsModal
        open={collectionsDrawerOpen}
        onOpenChange={setCollectionsDrawerOpen}
        collections={collections}
        onSelectRequest={loadRequestIntoActiveTab}
        onSelectAndSendRequest={loadAndSendRequest}
        onAddCollection={createNewCollection}
        onDeleteCollection={deleteCollection}
        onRenameCollection={renameCollection}
        onAddRequestToCollection={handleAddRequestToCollection}
        onRemoveRequestFromCollection={removeRequestFromCollection}
      />

      {/* History Drawer */}
      <Drawer open={historyOpen} onOpenChange={setHistoryOpen} direction="right">
        <DrawerContent className="max-w-sm p-0">
          <DrawerHeader>
            <DrawerTitle>Request History</DrawerTitle>
          </DrawerHeader>
          <div className="h-[80vh] overflow-hidden">
            <HistoryPanel
              history={history}
              onSelectRequest={(item) => {
                loadRequestIntoActiveTab(item)
                setHistoryOpen(false)
              }}
              onClearHistory={clearHistory}
              onRemoveItem={removeFromHistory}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  )
}
