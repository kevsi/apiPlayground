"use client"

import { useEffect, useState, useCallback, useMemo, useRef } from "react"
import { Plus, X, Zap, Save, Clock, Folder, CheckCircle, MoreHorizontal, Copy, Download, ChevronLeft, ChevronRight, List } from "lucide-react"
import { RequestPanel } from "@/components/request-panel"
import { ResponsePanel } from "@/components/response-panel"
import { CollectionsModal } from "@/components/collections-modal"
import { HistoryPanel } from "@/components/history-panel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectItem, SelectTrigger, SelectValue, SelectContent } from "@/components/ui/select"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
import type { ImperativePanelHandle } from "react-resizable-panels"
import { getAndClearPendingCollectionRequest, peekPendingCollectionRequest, clearPendingCollectionRequest, type PendingCollectionRequest } from "@/lib/utils"
import { useMockStore } from "@/hooks/use-mock-store"
import type { MockRoute } from "@/lib/mock-types"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { toast } from "@/hooks/use-toast"
import { cn, downloadJson, hasUnresolvedPlaceholders, interpolate, parseJsonSafe, replaceLocalhostPort } from "@/lib/utils"
import { BatchRunProgress } from "@/components/batch-run-progress"
import { extractValueFromResponse, isSourcePathSyntaxValid } from "@/lib/variable-path"
import { generateFollowUpRequest } from "@/lib/ai-request-generator"
import { buildAiProxyPayload } from "@/lib/ai-config"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription as AlertDesc,
  AlertDialogFooter as AlertFoot,
  AlertDialogHeader as AlertHead,
  AlertDialogTitle as AlertTitle,
} from "@/components/ui/alert-dialog"
import { invokeTauriFetch, isTauriAvailable } from "@/lib/tauri"
import { useAIEngine } from "@/hooks/use-ai-engine"
import { useRequestStore, type Collection, type HistoryItem, type RequestItem, type VariableMapping } from "@/hooks/use-request-store"

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
  savedRequestId?: string
  responseStatus?: number
  responseTime?: number
  responseSize?: string
  responseBody?: string
  responseData?: string | Blob
  responseHeaders?: Record<string, string>
  mocked?: boolean
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

const generateRequestTabId = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

const STORAGE_KEY_TABS = "reqly-request-tabs"

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
    const localhostLike = /^(localhost|127(?:\.[0-9]{1,3}){0,3}|\[::1\])(?::\d+)?(?:[\/\?#]|$)/i.test(sanitizedUrl)
    const ipLike = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?::\d+)?(?:[\/\?#]|$)/.test(sanitizedUrl)
    const hostLike = /^[^/?#\s]+\.[^/?#\s]+/.test(sanitizedUrl)

    if (localhostLike || ipLike) {
      return `http://${sanitizedUrl}`
    }
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
  const [generatingFollowUpId, setGeneratingFollowUpId] = useState<string | null>(null)
  const [loadingCount, setLoadingCount] = useState(0)
  const isLoading = loadingCount > 0
  const [isTabsLoaded, setIsTabsLoaded] = useState(false)
  const [savedIndicator, setSavedIndicator] = useState(false)
  const [collectionRequestStatus, setCollectionRequestStatus] = useState<string | null>(null)
  const [collectionRunLogs, setCollectionRunLogs] = useState<string[]>([])
  const [batchRunCollection, setBatchRunCollection] = useState<Collection | null>(null)
  const [, setIsRequestCollapsed] = useState(false)
  const [, setIsResponseCollapsed] = useState(false)
  const [chainingOpen, setChainingOpen] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const requestPanelRef = useRef<ImperativePanelHandle | null>(null)
  const responsePanelRef = useRef<ImperativePanelHandle | null>(null)
  const [saveModalName, setSaveModalName] = useState("")
  const [saveModalCollectionId, setSaveModalCollectionId] = useState<string>("none")
  const [pendingCloseTab, setPendingCloseTab] = useState<RequestTab | null>(null)
  const [contextMenu, setContextMenu] = useState<{ tabId: string; x: number; y: number } | null>(null)
  const tabListRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollButtons = useCallback(() => {
    const el = tabListRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }, [])

  const scrollTabs = useCallback((direction: "left" | "right") => {
    const el = tabListRef.current
    if (!el) return
    const tabWidth = el.querySelector("[role='tab']")?.clientWidth ?? 120
    el.scrollBy({ left: direction === "left" ? -tabWidth : tabWidth, behavior: "smooth" })
  }, [])

  useEffect(() => {
    const el = tabListRef.current
    if (!el) return
    updateScrollButtons()
    el.addEventListener("scroll", updateScrollButtons, { passive: true })
    const ro = new ResizeObserver(updateScrollButtons)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", updateScrollButtons)
      ro.disconnect()
    }
  }, [tabs.length, updateScrollButtons])

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0]
  const [nativeMode, setNativeMode] = useState(false)
  const { addRoute } = useMockStore()

  const sanitizeTabForStorage = (tab: RequestTab) => {
    const { responseData: _responseData, ...rest } = tab
    void _responseData
    return rest
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNativeMode(isTauriAvailable())

    const loadState = async () => {
      const stored = localStorage.getItem(STORAGE_KEY_TABS)
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as { tabs: Array<Omit<RequestTab, "responseData">>; activeTabId: string }
          if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
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

      setIsTabsLoaded(true)
    }

    loadState()
  }, [])

  useEffect(() => {
    if (!isTabsLoaded) return

    // Persist all tabs so no work is lost when navigating between pages
    const persistTabs = () => {
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
    collections,
    environments,
    activeEnvironmentId,
    projects,
    selectedProjectId,
    history,
    addHistoryAndNotify,
    clearHistory,
    removeFromHistory,
    addCollection,
    updateCollection,
    deleteCollection,
    addRequestToCollection,
    removeRequestFromCollection,
    updateRequestById,
    variableMappings,
    duplicateCollection,
    addFolder,
    renameFolder,
    deleteFolder,
    moveRequestToFolder,
    moveFolder,
    addVariableMapping,
    updateVariableMapping,
    removeVariableMapping,
    setCurrentRequest,
    setLastResponse,
    activeWorkspaceId,
  } = useRequestStore()

  const activeProject = projects.find((p) => p.id === selectedProjectId) ?? null
  const activeProjectPort = activeProject?.port ?? 3000
  const activeEnv = environments.find((e) => e.id === activeEnvironmentId)
  const envVars = useMemo(() => activeEnv?.variables || [], [activeEnv])
  const aiEngine = useAIEngine()

  const handleAnalyzeRequest = async () => {
    const ctx = aiEngine.buildContext()
    await aiEngine.analyzeAfterRequest(ctx)
  }

  const handleGenerateTests = async () => {
    const ctx = aiEngine.buildContext()
    await aiEngine.generateTests(ctx)
  }

  const handleCreateMock = useCallback(() => {
    try {
      const tab = activeTab
      if (!tab) return
      if (!tab.responseBody && tab.responseStatus !== 204) return

      function findHeader(headers: Record<string, string> | undefined, name: string): string | undefined {
        if (!headers) return undefined
        const key = Object.keys(headers).find(k => k.toLowerCase() === name.toLowerCase())
        return key ? headers[key] : undefined
      }

      const mockData: Omit<MockRoute, "id" | "createdAt" | "updatedAt"> = {
        name: tab.name
          ? `${tab.name} (mock)`
          : `${tab.method} ${tab.url || tab.endpoint || "/"} (mock)`,
        method: tab.method as MockRoute["method"],
        pathPattern: tab.endpoint || tab.url || "/",
        responseStatus: tab.responseStatus || 200,
        responseHeaders: tab.responseHeaders ? { ...tab.responseHeaders } : {},
        responseBody: tab.responseBody || "",
        contentType: findHeader(tab.responseHeaders, "content-type") || "application/json",
        delay: 0,
        enabled: true,
        workspaceId: activeWorkspaceId ?? "ws-personal",
      }

      const label = `${mockData.method} ${mockData.pathPattern} → ${mockData.responseStatus}`
      toast({ title: `✅ Mock créé : ${mockData.name}`, description: label, duration: 5000 })

      addRoute(mockData)
    } catch (e) {
      console.error("[handleCreateMock]", e)
    }
  }, [activeTab, addRoute, activeWorkspaceId])

  const resolveMappingValue = useCallback((mapping: VariableMapping) => {
    const sourceItem = history.find((item) => item.id === mapping.sourceRequestId)
    if (!sourceItem) {
      return { value: "", error: "Source request not found in history." }
    }
    if (!sourceItem.responseBody) {
      return { value: "", error: "No response recorded for this request." }
    }

    return extractValueFromResponse(sourceItem.responseBody, mapping.sourcePath)
  }, [history])

  const dynamicVars = useMemo(
    () =>
      variableMappings
        .filter((mapping) => mapping.enabled && mapping.name.trim())
        .map((mapping) => {
          const result = resolveMappingValue(mapping)
          return {
            key: mapping.name.trim(),
            value: result.error ? "" : result.value,
            enabled: true,
          }
        }),
    [variableMappings, resolveMappingValue]
  )

  const allVars = useMemo(() => [...envVars, ...dynamicVars], [envVars, dynamicVars])

  const notifyUnresolvedVariables = useCallback(() => {
    const warnings = variableMappings
      .filter((mapping) => mapping.enabled && mapping.name.trim())
      .map((mapping) => {
        const result = resolveMappingValue(mapping)
        if (!result.error) return null
        return { name: mapping.name.trim(), error: result.error }
      })
      .filter((entry): entry is { name: string; error: string } => entry !== null)

    if (warnings.length === 0) return

    const preview = warnings
      .slice(0, 3)
      .map((w) => `{{${w.name}}}: ${w.error}`)
      .join(" · ")
    const suffix = warnings.length > 3 ? ` (+${warnings.length - 3} autres)` : ""

    toast({
      title: "Unresolved variables",
      description: `${preview}${suffix}`,
      variant: "destructive",
    })
  }, [variableMappings, resolveMappingValue])

  const hasUnresolvedPlaceholders = useCallback((text: string) => {
    return /\{\{\s*[^}]+\s*\}\}/.test(text)
  }, [])

  const buildRequestPayload = useCallback((tab: RequestTab) => {
    const resolvedUrl = activeProject ? replaceLocalhostPort(tab.url, activeProjectPort) : tab.url
    const rawUrl = buildUrl(resolvedUrl, tab.queryParams)
    const rawHeaders = buildHeaders(tab.headers, tab.authType, tab.authToken)
    const rawBody = tab.body || ""

    const finalUrl = interpolate(rawUrl, allVars)
    const finalBody = interpolate(rawBody, allVars)
    const headers = Object.fromEntries(
      Object.entries(rawHeaders).map(([key, value]) => [interpolate(key, allVars), interpolate(value, allVars)])
    )

    return { finalUrl, finalBody, headers }
  }, [activeProject, activeProjectPort, allVars])

  const updateTab = useCallback((id: string, updates: Partial<RequestTab>) => {
    setTabs((currentTabs) => {
      const currentTab = currentTabs.find((t) => t.id === id)
      const nextTabs = currentTabs.map((t) => (t.id === id ? { ...t, ...updates } : t))

      const updatedTab = nextTabs.find((t) => t.id === id)
      if (currentTab && updatedTab && updatedTab.savedRequestId) {
        const requestUpdates: Partial<RequestItem> = {}

        if (updates.name !== undefined) requestUpdates.name = updates.name
        if (updates.method !== undefined) requestUpdates.method = updates.method
        if (updates.url !== undefined) requestUpdates.url = updates.url
        if (updates.endpoint !== undefined) requestUpdates.endpoint = updates.endpoint
        if (updates.headers !== undefined) requestUpdates.headers = headersArrayToRecord(updates.headers)
        if (updates.body !== undefined) requestUpdates.body = updates.body
        if (updates.queryParams !== undefined) requestUpdates.queryParams = updates.queryParams

        if (Object.keys(requestUpdates).length > 0) {
          updateRequestById(updatedTab.savedRequestId, requestUpdates)
        }
      }

      return nextTabs
    })
  }, [updateRequestById])

  const executeRequest = useCallback(async (tab: RequestTab, showLoading = true) => {
    const { finalUrl, finalBody, headers } = buildRequestPayload(tab)
    const requestInit: RequestInit = {
      method: tab.method,
      headers,
    }

    if (tab.method !== "GET" && finalBody) {
      requestInit.body = finalBody
    }

    const startedAt = performance.now()
    let responseBody: string
    let responseData: string | Blob
    let responseHeaders: Record<string, string> = {}
    let responseStatus: number | undefined
    let responseSize = "0 B"
    let responseTime: number | undefined
    let mocked = false

    if (showLoading) {
      setLoadingCount((count) => count + 1)
    }
    try {
      if (nativeMode) {
        const result = await invokeTauriFetch(tab.method, finalUrl, headers, tab.method !== "GET" ? finalBody : undefined)
        responseStatus = result.status
        responseHeaders = result.headers
        responseTime = result.durationMs
        mocked = result.mocked ?? false

        if (result.encoding === "base64") {
          const contentType = responseHeaders["content-type"] || responseHeaders["Content-Type"] || "application/octet-stream"
          const binary = Uint8Array.from(atob(result.body), (c) => c.charCodeAt(0))
          responseBody = "[binary data]"
          responseData = new Blob([binary], { type: contentType.split(";")[0].trim() })
          responseSize = formatSize(responseData.size)
        } else {
          responseBody = result.body
          responseData = result.body
          responseSize = formatSize(new Blob([responseBody]).size)
        }
      } else {
        const debugHeaders = (typeof process !== "undefined" && process.env && process.env.NODE_ENV !== "production")
          ? { "x-proxy-debug": "1" }
          : {}

        const proxyResponse = await fetch("/api/proxy", {
          method: "POST",
          headers: ({
            "Content-Type": "application/json",
            ...debugHeaders,
            ...(activeWorkspaceId ? { "x-workspace-id": activeWorkspaceId } : {}),
          } as unknown) as Record<string, string>,
          body: JSON.stringify({
            url: finalUrl,
            method: tab.method,
            headers,
            body: tab.method !== "GET" ? finalBody : undefined,
            workspaceId: activeWorkspaceId,
          }),
        })

        const proxyResult = await parseJsonSafe(proxyResponse)
        responseStatus = proxyResult.status ?? proxyResponse.status ?? 0
        responseHeaders = proxyResult.headers || {}
        mocked = proxyResult.mocked ?? false

        const proxyError = proxyResult.error || (!proxyResponse.ok ? proxyResponse.statusText || "Proxy request failed" : undefined)

        if (proxyResponse.ok) {
          if (proxyResult.encoding === "base64") {
            const contentType = responseHeaders["content-type"] || responseHeaders["Content-Type"] || "application/octet-stream"
            const binary = Uint8Array.from(atob(proxyResult.body ?? ""), (c) => c.charCodeAt(0))
            responseBody = "[binary data]"
            responseData = new Blob([binary], { type: contentType })
            responseSize = formatSize(responseData.size)
          } else {
            responseBody = typeof proxyResult.body === "string" ? proxyResult.body : String(proxyResult.body ?? "")
            responseData = responseBody
            responseSize = formatSize(new Blob([responseBody]).size)
          }
        } else {
          responseBody = proxyError ?? "Proxy request failed"
          responseData = responseBody
          responseSize = formatSize(new Blob([responseBody]).size)
        }
      }
    } catch (error) {
      responseBody = error instanceof Error ? `Error: ${error.message}` : String(error)
      responseData = responseBody
      responseStatus = 0
    } finally {
      if (showLoading) {
        setLoadingCount((count) => Math.max(0, count - 1))
      }
    }

    if (responseTime === undefined) {
      responseTime = Math.round(performance.now() - startedAt)
    }

    return {
      responseStatus,
      responseHeaders,
      responseBody,
      responseData,
      responseSize,
      responseTime,
      mocked,
    }
  }, [buildRequestPayload, nativeMode])

  const sendSpecificRequest = useCallback(async (tabToSend: RequestTab, showLoading = true) => {
    if (!tabToSend?.url?.trim()) {
      toast({ title: "Missing URL", description: "Enter a valid URL before sending the request.", variant: "destructive" })
      return null
    }

    const resolvedUrl = interpolate(tabToSend.url, allVars)
    const resolvedBody = interpolate(tabToSend.body || "", allVars)
    const unresolved = hasUnresolvedPlaceholders(resolvedUrl) || hasUnresolvedPlaceholders(resolvedBody)

    if (unresolved) {
      notifyUnresolvedVariables()
      toast({
        title: "Unresolved variables",
        description: "Resolve all {{placeholders}} before sending the request.",
        variant: "destructive",
      })
      return null
    }

    const result = await executeRequest(tabToSend, showLoading)
    updateTab(tabToSend.id, {
      hasResponse: true,
      responseStatus: result.responseStatus,
      responseTime: result.responseTime,
      responseSize: result.responseSize,
      responseBody: result.responseBody,
      responseData: result.responseData,
      responseHeaders: result.responseHeaders,
      mocked: result.mocked,
    })

    setCurrentRequest({
      id: tabToSend.id,
      method: tabToSend.method,
      url: tabToSend.url,
      endpoint: tabToSend.endpoint,
      headers: headersArrayToRecord(tabToSend.headers),
      body: tabToSend.body,
      queryParams: tabToSend.queryParams,
    })

    setLastResponse({
      status: result.responseStatus ?? 0,
      durationMs: result.responseTime ?? 0,
      headers: result.responseHeaders ?? {},
      body: result.responseBody,
    })

    addHistoryAndNotify({
      name: tabToSend.name,
      method: tabToSend.method,
      url: tabToSend.url,
      endpoint: tabToSend.endpoint,
      headers: headersArrayToRecord(tabToSend.headers),
      body: tabToSend.body,
      queryParams: tabToSend.queryParams,
      responseStatus: result.responseStatus ?? 0,
      responseTime: result.responseTime ?? 0,
      responseSize: result.responseSize ?? "0 B",
      responseBody: result.responseBody,
    })

    return result
  }, [notifyUnresolvedVariables, executeRequest, updateTab, setCurrentRequest, setLastResponse, addHistoryAndNotify, allVars])

  const buildTabFromRequest = useCallback((request: RequestItem | HistoryItem | PendingCollectionRequest): Partial<RequestTab> => ({
    name: request.name,
    method: request.method as HttpMethod,
    url: activeProject ? replaceLocalhostPort(request.url, activeProjectPort) : request.url,
    endpoint: request.endpoint,
    headers: recordToHeaderArray(request.headers),
    queryParams: request.queryParams ?? [],
    body: request.body ?? "",
    bodyType: "json",
    authType: "none",
    authToken: "",
    hasResponse: false,
    isSaved: true,
    savedRequestId:
      "id" in request && typeof (request as { id?: string }).id === "string"
        ? (request as { id: string }).id
        : undefined,
    responseBody: undefined,
    responseData: undefined,
    responseHeaders: undefined,
    responseStatus: undefined,
    responseTime: undefined,
    responseSize: undefined,
  }), [activeProject, activeProjectPort])

  const runCollection = useCallback(async (collection: Collection) => {
    if (!activeTab) return
    if (!collection.requests.length) {
      toast({ title: `Collection "${collection.name}" is empty.`, variant: "destructive" })
      return
    }
    setBatchRunCollection(collection)
  }, [activeTab, setBatchRunCollection])

  const handleBatchRunRequest = async (
    request: RequestItem,
    index: number
  ): Promise<{ success: boolean; status?: number; time?: number; error?: string }> => {
    void index
    // Create a new tab for each request (instead of reusing active tab)
    const newTabId = `batch-${generateRequestTabId()}`
    const newTab: RequestTab = {
      id: newTabId,
      ...buildTabFromRequest(request),
    } as RequestTab

    // Add the tab to the list (silently, without switching to it)
    setTabs((currentTabs) => [...currentTabs, newTab])

    const result = await sendSpecificRequest(newTab, false)
    if (!result) {
      return { success: false, error: `"${request.name}" → failed` }
    }

    return {
      success: true,
      status: result.responseStatus ?? 0,
      time: result.responseTime ?? 0,
    }
  }

  const runCollectionBackground = useCallback(async (collection: Collection) => {
    if (!collection.requests.length) {
      toast({ title: `Collection "${collection.name}" is empty.`, variant: "destructive" })
      return
    }

    toast({ title: `Background execution started for "${collection.name}".` })
    setCollectionRequestStatus(`Background: running "${collection.name}"…`)
    setCollectionRunLogs([`Starting execution of collection "${collection.name}"`])

    for (const request of collection.requests) {
      const backgroundTab = {
        ...activeTab,
        ...buildTabFromRequest(request),
      } as RequestTab

      const result = await executeRequest(backgroundTab, false)
      setCollectionRunLogs((logs) => [
        ...logs,
        `"${request.name}" → ${result.responseStatus ?? 0} en ${result.responseTime ?? 0}ms`,
      ])
      addHistoryAndNotify({
        name: request.name,
        method: request.method,
        url: request.url,
        endpoint: request.endpoint,
        headers: request.headers,
        body: request.body,
        queryParams: request.queryParams,
        responseStatus: result.responseStatus,
        responseTime: result.responseTime,
        responseSize: result.responseSize,
        responseBody: result.responseBody,
      })
    }

    toast({ title: `Background run of "${collection.name}" completed.`, meta: { event: "collectionComplete" } } as Parameters<typeof toast>[0])
    setCollectionRequestStatus(`Background run completed (${collection.requests.length})`)
    window.setTimeout(() => setCollectionRequestStatus(null), 8000)
  }, [activeTab, buildTabFromRequest, executeRequest, addHistoryAndNotify, setCollectionRequestStatus, setCollectionRunLogs])

  // Load pending collection request (from Collections page navigation)
  useEffect(() => {
    if (!isTabsLoaded) return

    // ── Step 1: Check for batch collection run (non-destructive peek) ──
    const batchPending = peekPendingCollectionRequest() as PendingCollectionRequest | null
    if (batchPending && batchPending.collectionId && batchPending.sendImmediately && activeTab) {
      const collectionToRun = collections.find((c) => c.id === batchPending.collectionId)
      if (collectionToRun) {
        // Found the collection — clear pending and run all requests
        clearPendingCollectionRequest()

        // If requestIds are specified, filter to only those requests
        const requestsToRun =
          batchPending.requestIds && batchPending.requestIds.length > 0
            ? collectionToRun.requests.filter((r) => batchPending.requestIds!.includes(r.id))
            : collectionToRun.requests
        const filteredCollection = { ...collectionToRun, requests: requestsToRun }

        void (async () => {
          if (batchPending.background) {
            await runCollectionBackground(filteredCollection)
          } else {
            await runCollection(filteredCollection)
          }
        })()
      }
      // Collection not loaded yet — defer; peek doesn't clear so we retry on next render
      return
    }

    // ── Step 2: Single request load (destructive read) ──
    const pendingRequest = getAndClearPendingCollectionRequest() as PendingCollectionRequest | null
    if (!pendingRequest || !activeTab) return

    const requestLoaded = {
      ...activeTab,
      ...buildTabFromRequest(pendingRequest),
    } as RequestTab

    const tabsTimeout = window.setTimeout(() => {
      setTabs((currentTabs) =>
        currentTabs.map((tab) => (tab.id === activeTab.id ? requestLoaded : tab))
      )
    }, 0)

    let cleanupTimeout: number | undefined
    let statusImmediate: number | undefined
    let statusSentImmediate: number | undefined

    if (pendingRequest.sendImmediately) {
      statusImmediate = window.setTimeout(() => setCollectionRequestStatus("Sending Collections request…"), 0)
      void (async () => {
        await sendSpecificRequest(requestLoaded)
        statusSentImmediate = window.setTimeout(() => setCollectionRequestStatus("Collection request sent"), 0)
        cleanupTimeout = window.setTimeout(() => setCollectionRequestStatus(null), 6000)
      })()
    } else {
      statusImmediate = window.setTimeout(() => setCollectionRequestStatus("Collection request loaded in editor"), 0)
      toast({ title: "Requête chargée dans l'éditeur" })
      cleanupTimeout = window.setTimeout(() => setCollectionRequestStatus(null), 6000)
    }

    return () => {
      if (cleanupTimeout) {
        window.clearTimeout(cleanupTimeout)
      }
      if (tabsTimeout) {
        window.clearTimeout(tabsTimeout)
      }
      if (statusImmediate) {
        window.clearTimeout(statusImmediate)
      }
      if (statusSentImmediate) {
        window.clearTimeout(statusSentImmediate)
      }
    }
  }, [isTabsLoaded, activeTab, collections, buildTabFromRequest, runCollection, runCollectionBackground, sendSpecificRequest])

  const addNewTab = () => {
    const newId = generateRequestTabId()
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
    
    // Case 1: Already linked to a collection - do silent update
    if (activeTab.isSaved && activeTab.savedRequestId) {
      updateRequestById(activeTab.savedRequestId, {
        name: activeTab.name,
        method: activeTab.method,
        url: activeTab.url,
        endpoint: activeTab.endpoint,
        headers: headersArrayToRecord(activeTab.headers),
        body: activeTab.body,
        queryParams: activeTab.queryParams,
      })
      setSavedIndicator(true)
      setTimeout(() => setSavedIndicator(false), 2000)
      toast({ title: `"${activeTab.name}" saved` })
      return
    }

    // Case 2 & 3: Either never saved OR saved as local draft - open dialog
    setSaveModalName(activeTab.name || "New request")
    setSaveModalCollectionId("none")
    setSaveModalOpen(true)
  }, [activeTab, updateRequestById, setSaveModalOpen, setSaveModalName, setSaveModalCollectionId])

  const handleSaveDialogSubmit = () => {
    if (!activeTab) return
    let newSavedId: string | undefined = undefined
    let targetCollectionId = saveModalCollectionId

    if (saveModalCollectionId === "none") {
      const brouillonsCollection = collections.find(c => c.name === "Brouillons")
      if (brouillonsCollection) {
        targetCollectionId = brouillonsCollection.id
      }
    }

    if (targetCollectionId !== "none") {
      newSavedId = addRequestToCollection(targetCollectionId, {
        name: saveModalName,
        method: activeTab.method,
        url: activeTab.url,
        endpoint: activeTab.endpoint,
        headers: headersArrayToRecord(activeTab.headers),
        body: activeTab.body,
        queryParams: activeTab.queryParams,
      })
      const targetCollection = collections.find(c => c.id === targetCollectionId)
      const collectionName = targetCollection?.name || "la collection"
      toast({ title: `"${saveModalName}" saved in ${collectionName}` })
    }

    // Update the active tab state
    setTabs((cur) =>
      cur.map((t) =>
        t.id === activeTab.id
          ? {
              ...t,
              name: saveModalName,
              isSaved: true,
              savedRequestId: newSavedId,
            }
          : t
      )
    )

    setSaveModalOpen(false)
    setSavedIndicator(true)
    setTimeout(() => setSavedIndicator(false), 2000)
  }

  const forceCloseTab = (id: string) => {
    const newTabs = tabs.filter((t) => t.id !== id)
    
    if (newTabs.length === 0) {
      const newTabId = generateRequestTabId()
      const newTab: RequestTab = {
        id: newTabId,
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
      }
      setTabs([newTab])
      setActiveTabId(newTabId)
    } else {
      setTabs(newTabs)
      if (activeTabId === id) {
        setActiveTabId(newTabs[newTabs.length - 1].id)
      }
    }
  }

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const tab = tabs.find((t) => t.id === id)
    if (tab && !tab.isSaved && (tab.url || tab.body)) {
      setPendingCloseTab(tab)
      return
    }
    forceCloseTab(id)
  }

  const duplicateTab = (tab: RequestTab) => {
    const newId = generateRequestTabId()
    const duplicatedTab: RequestTab = {
      ...tab,
      id: newId,
      name: `${tab.name} Copy`,
      savedRequestId: undefined,
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

  const closeOthers = (id: string) => {
    setTabs((prev) => prev.filter((t) => t.id === id))
    setActiveTabId(id)
  }

  const closeToRight = (id: string) => {
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx === -1) return
    setTabs((prev) => prev.slice(0, idx + 1))
    const activeIdx = tabs.findIndex((t) => t.id === activeTabId)
    if (activeIdx > idx) {
      setActiveTabId(id)
    }
  }

  const closeAllTabs = () => {
    const newTabId = generateRequestTabId()
    setTabs([{
      id: newTabId,
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
    }])
    setActiveTabId(newTabId)
  }

  const saveAllTabs = () => {
    let count = 0
    tabs.forEach((tab) => {
      if (!tab.isSaved) {
        updateTab(tab.id, { isSaved: true })
        count++
      }
    })
    if (count > 0) {
      toast({ title: `Saved ${count} tab${count > 1 ? 's' : ''}` })
    } else {
      toast({ title: 'All tabs are already saved' })
    }
  }

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    window.addEventListener("click", close)
    window.addEventListener("scroll", close, true)
    return () => {
      window.removeEventListener("click", close)
      window.removeEventListener("scroll", close, true)
    }
  }, [contextMenu])

  const loadRequestIntoActiveTab = useCallback((request: RequestItem | HistoryItem) => {
    updateTab(activeTab.id, buildTabFromRequest(request))
  }, [activeTab.id, updateTab, buildTabFromRequest])

  const handleGenerateFollowUp = async (item: HistoryItem) => {
    const payload = buildAiProxyPayload("", "")
    if (!payload) {
      toast({
        title: "AI not configured",
        description: "Add an API key or Ollama in Settings → AI.",
        variant: "destructive",
      })
      return
    }

    setGeneratingFollowUpId(item.id)
    try {
      const generated = await generateFollowUpRequest(item, payload)
      updateTab(activeTab.id, {
        ...buildTabFromRequest({
          id: item.id,
          name: generated.name,
          method: generated.method,
          url: generated.url,
          endpoint: generated.endpoint || generated.url,
          headers: generated.headers,
          body: generated.body,
          queryParams: generated.queryParams,
          createdAt: item.createdAt,
          updatedAt: Date.now(),
        }),
        isSaved: false,
        savedRequestId: undefined,
      })
      setHistoryOpen(false)
      toast({
        title: "Follow-up request generated",
        description: generated.rationale || "Loaded in active editor.",
      })
    } catch (err) {
      toast({
        title: "AI generation failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      })
    } finally {
      setGeneratingFollowUpId(null)
    }
  }


  const exportActiveRequest = async () => {
    const isTauri = !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ || !!(window as unknown as { __TAURI__?: unknown }).__TAURI__

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
      const jsonContent = JSON.stringify(requestData, null, 2)
      try {
        const { invoke } = await import("@tauri-apps/api/core")
        const savedPath = await invoke<string>("export_json", {
          content: jsonContent,
          defaultName: 'request.json',
        })
        toast({ title: `File saved: ${savedPath}` })
      } catch (error: unknown) {
        if (error === 'cancelled') return
        toast({ title: `Export error: ${String(error)}`, variant: "destructive" })
        downloadJson(requestData, 'request.json')
      }
    } else {
      downloadJson(requestData, 'request.json')
      toast({ title: 'Download started' })
    }
  }

  const createNewCollection = (data?: { name?: string, color?: string, icon?: string }) => {
    return addCollection({
      name: data?.name || "New Collection",
      color: data?.color || "emerald",
      icon: data?.icon || "package",
    })
  }

  const renameCollection = (id: string, name: string) => {
    updateCollection(id, { name })
  }

  const handleAddRequestToCollection = (
    collectionId: string,
    request?: Omit<RequestItem, "id" | "createdAt" | "updatedAt">,
  ) => {
    if (request) {
      // Adding an existing request (from import or elsewhere)
      addRequestToCollection(collectionId, request)
      return
    }

    // When called without a request, create a new empty tab for this collection
    createNewRequestInCollection(collectionId)
  }

  const createNewRequestInCollection = (collectionId: string) => {
    // Create a new empty request in the collection
    const newRequestId = addRequestToCollection(collectionId, {
      name: "New Request",
      method: "GET",
      url: "",
      endpoint: "",
      headers: {},
      body: "",
      queryParams: [],
    })

    // Create a new empty tab linked to this request
    const newTabId = `tab-${generateRequestTabId()}`
    const newTab: RequestTab = {
      id: newTabId,
      name: "New Request",
      method: "GET",
      url: "",
      endpoint: "",
      headers: [],
      queryParams: [],
      body: "",
      bodyType: "json",
      authType: "none",
      authToken: "",
      hasResponse: false,
      isSaved: true, // Already linked to a collection
      savedRequestId: newRequestId,
    }

    // Add the new tab and switch to it
    setTabs((cur) => [...cur, newTab])
    setActiveTabId(newTabId)

    // Show a toast to confirm the action
    toast({ title: "New request created in collection" })
  }

  const sendRequest = useCallback(async () => {
    const tab = tabs.find((t) => t.id === activeTabId) || tabs[0]
    if (tab) await sendSpecificRequest(tab)
  }, [tabs, activeTabId, sendSpecificRequest])

  const sendAndSave = useCallback(async () => {
    const tab = tabs.find((t) => t.id === activeTabId) || tabs[0]
    if (!tab) return
    const result = await sendSpecificRequest(tab)
    if (result) {
      saveActiveTab()
    }
  }, [tabs, activeTabId, saveActiveTab, sendSpecificRequest])

  const sendAndDownload = useCallback(async () => {
    const tab = tabs.find((t) => t.id === activeTabId) || tabs[0]
    if (!tab) return
    const result = await sendSpecificRequest(tab)
    if (result?.responseBody) {
      const blob = new Blob([result.responseBody], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${tab.name.replace(/\s+/g, "_")}_response.json`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: "Response downloaded" })
    }
  }, [tabs, activeTabId, sendSpecificRequest])

  const loadAndSendRequest = useCallback(async (request: RequestItem | HistoryItem) => {
    const currentTab = tabs.find((t) => t.id === activeTabId) || tabs[0]
    const tempTab: RequestTab = {
      ...currentTab,
      ...buildTabFromRequest(request),
    } as RequestTab
    
    setTabs((currentTabs) => currentTabs.map((t) => (t.id === activeTabId ? tempTab : t)))
    await sendSpecificRequest(tempTab)
  }, [tabs, activeTabId, buildTabFromRequest, sendSpecificRequest])

  // Scroll request panel to top when switching tabs
  useEffect(() => {
    const container = document.querySelector(".request-panel-scroll")
    if (container) container.scrollTop = 0
  }, [activeTabId])

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
      {/* Tabs Bar — Studio style */}
      <div className="flex items-center border-b border-border relative bg-muted/5">
        <div className="ambient-bar" />
        {canScrollLeft && (
          <button
            type="button"
            onClick={() => scrollTabs("left")}
            className="shrink-0 flex items-center justify-center size-6 mx-0.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-all duration-150"
            title="Scroll left"
          >
            <ChevronLeft className="size-3.5" />
          </button>
        )}
        <div ref={tabListRef} role="tablist" className="flex flex-1 items-center gap-1 overflow-hidden px-1.5">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              role="tab"
              tabIndex={activeTabId === tab.id ? 0 : -1}
              aria-selected={activeTabId === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              onClick={() => setActiveTabId(tab.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setContextMenu({ tabId: tab.id, x: e.clientX, y: e.clientY })
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  setActiveTabId(tab.id)
                }
              }}
              className={cn(
                "group relative flex shrink-0 cursor-pointer items-center gap-2.5 rounded-t-md px-5 py-3 text-sm transition-all duration-150",
                activeTabId === tab.id
                  ? "bg-background text-foreground"
                  : "text-muted-foreground/60 hover:bg-muted/20 hover:text-foreground/80"
              )}
            >
              {activeTabId === tab.id && (
                <div className="tab-active-bar" />
              )}
              <span className={cn("size-1.5 rounded-full shrink-0",
                tab.method === "GET" && "bg-emerald-500",
                tab.method === "POST" && "bg-blue-500",
                tab.method === "PUT" && "bg-amber-500",
                tab.method === "PATCH" && "bg-purple-500",
                tab.method === "DELETE" && "bg-red-500",
              )} />
              <span className="max-w-[200px] truncate text-sm font-medium">{tab.name}</span>
              {!tab.isSaved && (
                <span title="Unsaved — Ctrl+S to save" className="size-1.5 rounded-full bg-orange-400/80 shrink-0" />
              )}
              {tab.isSaved && tab.hasResponse && (
                <span className="size-1.5 rounded-full bg-emerald-500/60 shrink-0" />
              )}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id, e) }}
                className="ml-0.5 rounded p-0.5 opacity-0 transition-all duration-150 hover:bg-muted-foreground/10 group-hover:opacity-100 hover:scale-110"
              >
                <X className="size-3 text-muted-foreground/50 hover:text-foreground" />
              </button>
            </div>
          ))}
        </div>
        {canScrollRight && (
          <button
            type="button"
            onClick={() => scrollTabs("right")}
            className="shrink-0 flex items-center justify-center size-6 mx-0.5 rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-all duration-150"
            title="Scroll right"
          >
            <ChevronRight className="size-3.5" />
          </button>
        )}
        <div className="flex shrink-0 items-center gap-0.5 pr-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground/40 hover:text-foreground transition-all duration-200"
                title="All tabs"
              >
                <List className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 max-h-72 overflow-y-auto">
              {tabs.map((tab) => (
                <DropdownMenuItem
                  key={tab.id}
                  onSelect={() => setActiveTabId(tab.id)}
                  className="gap-2 text-xs cursor-pointer"
                >
                  <span className={cn("method-pill shrink-0", methodColors[tab.method])}>{tab.method}</span>
                  <span className="truncate flex-1">{tab.name}</span>
                  {tab.id === activeTabId && <CheckCircle className="size-3 text-primary shrink-0" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon"
            onClick={addNewTab}
            className="size-7 text-muted-foreground/50 hover:text-foreground transition-all duration-200"
            title="New tab"
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 min-w-44 rounded-lg border border-border bg-popover p-1 shadow-lg shadow-black/10"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            onClick={() => { saveActiveTab(); setContextMenu(null) }}
          >
            <Save className="size-3.5" />
            Save
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            onClick={() => { duplicateTab(tabs.find(t => t.id === contextMenu.tabId)!); setContextMenu(null) }}
          >
            <Copy className="size-3.5" />
            Duplicate
          </button>
          <div className="my-1 border-t border-border" />
          <button
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            onClick={() => { closeTab(contextMenu.tabId, { stopPropagation: () => {} } as React.MouseEvent); setContextMenu(null) }}
          >
            <X className="size-3.5" />
            Close
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            onClick={() => { closeOthers(contextMenu.tabId); setContextMenu(null) }}
          >
            <X className="size-3.5" />
            Close Others
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            onClick={() => { closeToRight(contextMenu.tabId); setContextMenu(null) }}
          >
            <X className="size-3.5" />
            Close to the Right
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            onClick={() => { closeAllTabs(); setContextMenu(null) }}
          >
            <X className="size-3.5" />
            Close All
          </button>
          <div className="my-1 border-t border-border" />
          <button
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            onClick={() => { saveAllTabs(); setContextMenu(null) }}
          >
            <Save className="size-3.5" />
            Save All
          </button>
        </div>
      )}

      {/* Consolidated bar — method hero + name + actions */}
      <div className={cn(
        "flex items-center gap-3 border-b px-3 py-1.5 transition-colors duration-200 overflow-x-auto",
        activeTab.method === "GET" ? "border-b-emerald-500/15 bg-emerald-500/[0.02]" :
        activeTab.method === "POST" ? "border-b-blue-500/15 bg-blue-500/[0.02]" :
        activeTab.method === "PUT" ? "border-b-amber-500/15 bg-amber-500/[0.02]" :
        activeTab.method === "PATCH" ? "border-b-purple-500/15 bg-purple-500/[0.02]" :
        "border-b-red-500/15 bg-red-500/[0.02]"
      )}>
        {/* Large method badge */}
        <div className={cn(
          "flex items-center justify-center rounded-lg border-2 px-2 py-1 text-xs sm:px-3.5 sm:py-1.5 sm:text-sm font-bold font-mono tracking-wide select-none shrink-0",
          activeTab.method === "GET" ? "bg-emerald-500 text-white border-emerald-500" :
          activeTab.method === "POST" ? "bg-blue-500 text-white border-blue-500" :
          activeTab.method === "PUT" ? "bg-amber-500 text-white border-amber-500" :
          activeTab.method === "PATCH" ? "bg-purple-500 text-white border-purple-500" :
          "bg-red-500 text-white border-red-500"
        )}>
          {activeTab.method}
        </div>

        {/* Name input + endpoint */}
        <div className="flex flex-col min-w-0 flex-1">
          <input
            value={activeTab.name}
            onChange={(e) => updateTab(activeTab.id, { name: e.target.value })}
            placeholder="Request Name"
            className="w-full rounded-md border border-transparent bg-muted/20 px-2 py-1 text-sm font-semibold text-foreground outline-none transition-all duration-150 placeholder:text-muted-foreground/40 focus:border-input/50 focus:bg-muted/40"
          />
          {activeTab.endpoint && (
            <span className="text-[11px] font-mono text-muted-foreground/50 truncate mt-0.5 hidden sm:inline">
              {activeTab.endpoint}
            </span>
          )}
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-2 shrink-0 max-sm:hidden">
          {savedIndicator && (
            <div className="flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 text-[11px] font-medium text-emerald-500 animate-fade-in">
              <CheckCircle className="size-3" />
              Saved
            </div>
          )}
          {collectionRequestStatus && (
            <div className={cn(
              "flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium animate-fade-in",
              "border-primary/20 bg-primary/5 text-primary"
            )}>
              <span className="size-1.5 rounded-full bg-primary animate-pulse" />
              <span>{collectionRequestStatus}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 ml-auto">
          <div className="items-center gap-0.5 max-[768px]:hidden flex">
            <Button variant="ghost" size="icon" onClick={() => setCollectionsDrawerOpen(true)} className="size-8 text-muted-foreground/60 hover:text-foreground" title="Collections">
              <Folder className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => duplicateTab(activeTab)} className="size-8 text-muted-foreground/60 hover:text-foreground" title="Duplicate request">
              <Copy className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={saveActiveTab}
              className={cn("size-8 transition-all duration-200", !activeTab.isSaved ? "text-orange-500 hover:text-orange-600" : "text-muted-foreground/60 hover:text-foreground")}
              title="Save (Ctrl+S)"
            >
              <Save className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setHistoryOpen(true)} className="size-8 text-muted-foreground/60 hover:text-foreground" title="Request history">
              <Clock className="size-4" />
            </Button>
          </div>
          <div className="hidden max-[768px]:inline-flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => setCollectionsDrawerOpen(true)} className="text-xs gap-2"><Folder className="size-3.5" />Collections</DropdownMenuItem>
                <DropdownMenuItem onClick={() => duplicateTab(activeTab)} className="text-xs gap-2"><Copy className="size-3.5" />Duplicate</DropdownMenuItem>
                <DropdownMenuItem onClick={saveActiveTab} className="text-xs gap-2"><Save className="size-3.5" />{activeTab.isSaved ? "Resave" : "Save"}</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setHistoryOpen(true)} className="text-xs gap-2"><Clock className="size-3.5" />History</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={exportActiveRequest} className="text-xs gap-2"><Download className="size-3.5" />Export JSON</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setChainingOpen(true)} className="text-xs gap-2"><Zap className="size-3.5" />Chaining</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Collection run logs */}
      {collectionRunLogs.length > 0 && (
        <div className="border-b border-border/50 bg-muted/5 px-4 py-2">
          <div className="rounded-lg border border-border/30 bg-muted/10 px-3 py-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">Run Logs</span>
            </div>
            <div className="space-y-0.5 max-h-[80px] overflow-y-auto scrollbar-discreet">
              {collectionRunLogs.slice(-5).map((log) => (
                <div key={`log-${log}`} className="text-[11px] font-mono text-muted-foreground/70 truncate">
                  <span className="text-muted-foreground/30">{`>`}</span> {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Panels - Resizable split view */}
      <div className={cn(
        "min-h-0 h-full flex-1 overflow-hidden transition-colors duration-200",
        activeTab.method === "GET" ? "bg-emerald-500/[0.02]" :
        activeTab.method === "POST" ? "bg-blue-500/[0.02]" :
        activeTab.method === "PUT" ? "bg-amber-500/[0.02]" :
        activeTab.method === "PATCH" ? "bg-purple-500/[0.02]" :
        "bg-red-500/[0.02]"
      )}>
        <ResizablePanelGroup direction="horizontal" className="min-h-0 h-full">
          <ResizablePanel
            ref={requestPanelRef}
            order={1}
            defaultSize={55}
            minSize={25}
            collapsedSize={0}
            collapsible
            onCollapse={() => setIsRequestCollapsed(true)}
            onExpand={() => setIsRequestCollapsed(false)}
            className="min-w-0 min-h-0 overflow-hidden"
          >
            <div className="min-h-0 h-full overflow-auto hide-scrollbar border-r border-border max-[916px]:border-r-0 max-[916px]:border-b request-panel-scroll">
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
                variableNames={variableMappings.filter((m) => m.enabled && m.name.trim()).map((m) => m.name.trim())}
              />
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle className="bg-border" />

          <ResizablePanel
            ref={responsePanelRef}
            order={2}
            defaultSize={45}
            minSize={25}
            collapsedSize={0}
            collapsible
            onCollapse={() => setIsResponseCollapsed(true)}
            onExpand={() => setIsResponseCollapsed(false)}
            className="min-w-0 min-h-0 overflow-hidden"
          >
            <div className="min-h-0 h-full overflow-auto flex-1 hide-scrollbar">
              <ResponsePanel
                key={activeTab.id}
                responseBody={activeTab.responseBody}
                responseData={activeTab.responseData}
                responseStatus={activeTab.responseStatus}
                responseTime={activeTab.responseTime}
                responseSize={activeTab.responseSize}
                responseHeaders={activeTab.responseHeaders}
                mocked={activeTab.mocked}
                isLoading={isLoading || aiEngine.isLoading}
                aiIsLoading={aiEngine.isLoading}
                onRun={sendRequest}
                onRunAndSave={sendAndSave}
                onRunAndDownload={sendAndDownload}
                onAnalyze={handleAnalyzeRequest}
                onGenerateTests={handleGenerateTests}
                onCreateMock={handleCreateMock}
                aiSummary={aiEngine.lastSummary ?? undefined}
                aiError={aiEngine.error ?? undefined}
                method={activeTab.method}
                url={activeTab.url}
                queryParams={activeTab.queryParams}
                requestHeaders={activeTab.headers}
                body={activeTab.body}
                bodyType={activeTab.bodyType}
                authType={activeTab.authType}
                authToken={activeTab.authToken}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Collections Modal */}
      <CollectionsModal
        open={collectionsDrawerOpen}
        onOpenChange={setCollectionsDrawerOpen}
        collections={collections}
        onSelectRequest={loadRequestIntoActiveTab}
        onSelectAndSendRequest={loadAndSendRequest}
        onRunCollection={runCollection}
        onAddCollection={createNewCollection}
        onDeleteCollection={deleteCollection}
        onRenameCollection={renameCollection}
        onAddRequestToCollection={handleAddRequestToCollection}
        onRemoveRequestFromCollection={removeRequestFromCollection}
        onDuplicateCollection={duplicateCollection}
        onAddFolder={addFolder}
        onRenameFolder={renameFolder}
        onDeleteFolder={deleteFolder}
        onMoveRequestToFolder={moveRequestToFolder}
        onMoveFolder={moveFolder}
      />

      {/* Chaining Modal */}
      <Dialog open={chainingOpen} onOpenChange={setChainingOpen}>
        <DialogContent className="max-w-7xl w-[min(98vw,1400px)] h-[86vh] flex flex-col overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 pr-12 border-b border-border">
            <DialogTitle>Request chaining</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">
              Inject values from previous responses into future requests using variables.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-auto p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Mappings</p>
                <p className="text-sm text-muted-foreground">Use values from a prior response in later requests.</p>
                <p className="text-xs text-muted-foreground mt-1">Use paths like <span className="font-mono">data.items[0].token</span>. Only alphanumeric characters, <span className="font-mono">_</span>, <span className="font-mono">.</span>, <span className="font-mono">-</span> and <span className="font-mono">[]</span> are allowed.</p>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  addVariableMapping({ name: "", sourceRequestId: history[0]?.id ?? "", sourcePath: "", enabled: true })
                }}
              >
                Add mapping
              </Button>
            </div>

            {variableMappings.length === 0 ? (
              <div className="rounded-lg border border-border bg-background p-4 text-sm text-muted-foreground">
                No active mappings. Create a mapping and use it with <span className="font-mono">{"{{token}}"}</span> in URLs, headers, or body.
              </div>
            ) : (
              <div className="space-y-4">
                {variableMappings.map((mapping) => (
                  <div key={mapping.id} className="rounded-lg border border-border bg-background p-4">
                    <div className="grid gap-4 xl:grid-cols-[2fr_1.4fr_1fr] items-end">
                      <div className="min-w-0">
                        <p className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Source request</p>
                        <Select value={mapping.sourceRequestId} onValueChange={(sourceRequestId) => updateVariableMapping(mapping.id, { sourceRequestId })}>
                          <SelectTrigger className="h-11 w-full min-w-0">
                            <SelectValue placeholder="Select request" />
                          </SelectTrigger>
                          <SelectContent>
                            {history.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name || item.endpoint || item.url || "Untitled request"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="min-w-0">
                        <p className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Response path</p>
                        <Input value={mapping.sourcePath} onChange={(e) => updateVariableMapping(mapping.id, { sourcePath: e.target.value })} placeholder="data.token" className="h-11 w-full min-w-0" />
                        {mapping.sourcePath.trim() && !isSourcePathSyntaxValid(mapping.sourcePath) && (
                          <p className="mt-2 text-xs text-destructive">Invalid format: use data.items[0].token or data.user.id.</p>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Variable name</p>
                        <Input value={mapping.name} onChange={(e) => updateVariableMapping(mapping.id, { name: e.target.value })} placeholder="token" className="h-11 w-full min-w-0" />
                      </div>
                    </div>

<div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] items-center text-sm text-muted-foreground">
                          <div>
                            Preview: <span className="font-mono text-foreground">{(() => {
                              const result = resolveMappingValue(mapping)
                              if (result.error) return <span className="text-destructive">{result.error}</span>
                              return result.value || "-"
                            })()}</span>
                          </div>
                          <div className="flex justify-start sm:justify-end">
                            <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeVariableMapping(mapping.id)}>
                              Remove
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
          </div>

          <DialogFooter className="border-t border-border">
            <div className="w-full flex justify-end p-4">
              <Button onClick={() => setChainingOpen(false)}>Close</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* History Drawer */}
      <Drawer open={historyOpen} onOpenChange={setHistoryOpen} direction="right">
        <DrawerContent className="max-w-xl p-0">
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
              onGenerateFollowUp={handleGenerateFollowUp}
              generatingFollowUpId={generatingFollowUpId}
            />
          </div>
        </DrawerContent>
      </Drawer>
      {/* Save Request Dialog */}
      <Dialog open={saveModalOpen} onOpenChange={setSaveModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save request</DialogTitle>
            <DialogDescription>
              Name your request and choose whether to add it to a collection.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="save-name" className="text-sm font-medium text-foreground">
                Request name
              </label>
              <Input
                id="save-name"
                value={saveModalName}
                onChange={(e) => setSaveModalName(e.target.value)}
                placeholder="My request"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveDialogSubmit()
                }}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="save-collection" className="text-sm font-medium text-foreground">
                Collection (optional)
              </label>
              <Select value={saveModalCollectionId} onValueChange={setSaveModalCollectionId}>
                <SelectTrigger id="save-collection" className="w-full">
                  <SelectValue placeholder="No collection" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">📋 Drafts</SelectItem>
                  {collections.filter(col => col.name !== "Brouillons").map((col) => (
                    <SelectItem key={col.id} value={col.id}>
                      {col.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setSaveModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveDialogSubmit}>
              <Save className="mr-2 size-4" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unsaved tab close confirmation */}
      <AlertDialog open={!!pendingCloseTab} onOpenChange={(open) => !open && setPendingCloseTab(null)}>
        <AlertDialogContent>
          <AlertHead>
            <AlertTitle>Unsaved changes</AlertTitle>
            <AlertDesc>
              You have unsaved changes in "{pendingCloseTab?.name}". Do you want to discard them?
            </AlertDesc>
          </AlertHead>
          <AlertFoot>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingCloseTab) forceCloseTab(pendingCloseTab.id)
                setPendingCloseTab(null)
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertFoot>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch Run Progress Dialog */}
      {batchRunCollection && (
        <BatchRunProgress
          collection={batchRunCollection}
          isOpen={true}
          onClose={() => setBatchRunCollection(null)}
          onRunRequest={handleBatchRunRequest}
        />
      )}
    </div>
  )
}
