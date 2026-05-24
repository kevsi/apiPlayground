"use client"

import { useEffect, useState, useCallback } from "react"
import { Plus, X, Zap, Save, Clock, Folder, CheckCircle, MoreHorizontal } from "lucide-react"
import { AppIcon } from "@/components/app-icon"
import { RequestPanel } from "@/components/request-panel"
import { ResponsePanel } from "@/components/response-panel"
import { CollectionsModal } from "@/components/collections-modal"
import { HistoryPanel } from "@/components/history-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectItem, SelectTrigger, SelectValue, SelectContent } from "@/components/ui/select"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { getAndClearPendingCollectionRequest, type PendingCollectionRequest } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { toast } from "@/hooks/use-toast"
import { cn, downloadJson, interpolate, replaceLocalhostPort } from "@/lib/utils"
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
import { invokeTauriFetch, isTauriAvailable, loadTauriTabsState, saveTauriTabsState, type TauriStorageState } from "@/lib/tauri"
import { useAIEngine } from "@/hooks/use-ai-engine"
import type { CurrentRequest } from "@/lib/ai-engine"
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
  const [generatingFollowUpId, setGeneratingFollowUpId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isTabsLoaded, setIsTabsLoaded] = useState(false)
  const [savedIndicator, setSavedIndicator] = useState(false)
  const [collectionRequestStatus, setCollectionRequestStatus] = useState<string | null>(null)
  const [collectionRunLogs, setCollectionRunLogs] = useState<string[]>([])
  const [chainingOpen, setChainingOpen] = useState(false)
  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [saveModalName, setSaveModalName] = useState("")
  const [saveModalCollectionId, setSaveModalCollectionId] = useState<string>("none")

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0]
  const [nativeMode, setNativeMode] = useState(false)

  const sanitizeTabForStorage = (tab: RequestTab) => {
    const { responseData, ...rest } = tab
    return rest
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNativeMode(isTauriAvailable())

    const loadState = async () => {
      let loaded = false
      if (isTauriAvailable()) {
        try {
          const stored = await loadTauriTabsState()
          if (stored && Array.isArray(stored.tabs) && stored.tabs.length > 0) {
            // Restore tabs preserving their original isSaved state
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setTabs(stored.tabs as unknown as RequestTab[])
            if (stored.activeTabId && stored.tabs.some((tab) => tab.id === stored.activeTabId)) {
              // eslint-disable-next-line react-hooks/set-state-in-effect
              setActiveTabId(stored.activeTabId)
            }
            loaded = true
          }
        } catch {
          // ignore load errors and fallback to localStorage
        }
      }

      if (!loaded) {
        const stored = localStorage.getItem(STORAGE_KEY_TABS)
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as { tabs: Array<Omit<RequestTab, "responseData">>; activeTabId: string }
            if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
              // Restore tabs preserving their original isSaved state
              // eslint-disable-next-line react-hooks/set-state-in-effect
              setTabs(parsed.tabs as RequestTab[])
              if (parsed.activeTabId && parsed.tabs.some((tab) => tab.id === parsed.activeTabId)) {
                // eslint-disable-next-line react-hooks/set-state-in-effect
                setActiveTabId(parsed.activeTabId)
              }
            }
          } catch {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setTabs(initialTabs)
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setActiveTabId(initialTabs[0].id)
          }
        }
      }

      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    addVariableMapping,
    updateVariableMapping,
    removeVariableMapping,
    setCurrentRequest,
    setLastResponse,
  } = useRequestStore()

  const activeProject = projects.find((p) => p.id === selectedProjectId) ?? null
  const activeProjectPort = activeProject?.port ?? 3000
  const activeEnv = environments.find((e) => e.id === activeEnvironmentId)
  const envVars = activeEnv?.variables || []
  const aiEngine = useAIEngine()

  const handleAnalyzeRequest = async () => {
    const ctx = aiEngine.buildContext()
    await aiEngine.analyzeAfterRequest(ctx)
  }

  const handleGenerateTests = async () => {
    const ctx = aiEngine.buildContext()
    await aiEngine.generateTests(ctx)
  }

  const runCollection = async (collection: Collection) => {
    if (!activeTab) return
    if (!collection.requests.length) {
      toast({ title: `La collection "${collection.name}" est vide.`, variant: "destructive" })
      return
    }

    setCollectionRequestStatus(`Exécution de la collection "${collection.name}"…`)
    setCollectionRunLogs([])

    for (const request of collection.requests) {
      const requestLoaded = {
        ...activeTab,
        ...buildTabFromRequest(request),
      } as RequestTab

      setTabs((currentTabs) =>
        currentTabs.map((tab) => (tab.id === activeTab.id ? requestLoaded : tab))
      )

      const result = await sendSpecificRequest(requestLoaded)
      if (!result) {
        setCollectionRunLogs((logs) => [...logs, `"${request.name}" → échec`])
        continue
      }

      setCollectionRunLogs((logs) => [
        ...logs,
        `"${request.name}" → ${result.responseStatus ?? 0} en ${result.responseTime ?? 0}ms`,
      ])
    }

    toast({ title: `Collection "${collection.name}" exécutée (${collection.requests.length})`, meta: { event: "collectionComplete" } } as Parameters<typeof toast>[0])
    setCollectionRequestStatus(`Collection "${collection.name}" exécutée (${collection.requests.length})`)
    window.setTimeout(() => setCollectionRequestStatus(null), 6000)
  }

  const runCollectionBackground = async (collection: Collection) => {
    if (!collection.requests.length) {
      toast({ title: `La collection "${collection.name}" est vide.`, variant: "destructive" })
      return
    }

    toast({ title: `Exécution en arrière-plan démarrée pour "${collection.name}".` })
    setCollectionRequestStatus(`Background: exécution de "${collection.name}"…`)
    setCollectionRunLogs([`Démarrage de l’exécution de la collection "${collection.name}"`])

    for (const request of collection.requests) {
      const backgroundTab = {
        ...activeTab,
        ...buildTabFromRequest(request),
      } as RequestTab

      const result = await executeRequest(backgroundTab)
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

    toast({ title: `Background run de "${collection.name}" terminé.`, meta: { event: "collectionComplete" } } as Parameters<typeof toast>[0])
    setCollectionRequestStatus(`Background run terminé (${collection.requests.length})`)
    window.setTimeout(() => setCollectionRequestStatus(null), 8000)
  }

  // Load pending collection request (from Collections page navigation)
  useEffect(() => {
    if (!isTabsLoaded) return
    
    const pendingRequest = getAndClearPendingCollectionRequest() as PendingCollectionRequest | null
    if (!pendingRequest || !activeTab) return

    if (pendingRequest.collectionId && pendingRequest.sendImmediately) {
      const collectionToRun = collections.find((c) => c.id === pendingRequest.collectionId)
      if (!collectionToRun) {
        toast({ title: "La collection à exécuter est introuvable.", variant: "destructive" })
        return
      }

      void (async () => {
        if (pendingRequest.background) {
          await runCollectionBackground(collectionToRun)
        } else {
          await runCollection(collectionToRun)
        }
      })()
      return
    }

    const requestLoaded = {
      ...activeTab,
      ...buildTabFromRequest(pendingRequest),
    } as RequestTab

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTabs((currentTabs) =>
      currentTabs.map((tab) => (tab.id === activeTab.id ? requestLoaded : tab))
    )

    let cleanupTimeout: number | undefined

    if (pendingRequest.sendImmediately) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollectionRequestStatus("Envoi de la requête Collections en cours…")
      void (async () => {
        await sendSpecificRequest(requestLoaded)
        setCollectionRequestStatus("Requête Collections envoyée")
        cleanupTimeout = window.setTimeout(() => setCollectionRequestStatus(null), 6000)
      })()
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollectionRequestStatus("Requête Collections chargée dans l’éditeur")
      cleanupTimeout = window.setTimeout(() => setCollectionRequestStatus(null), 6000)
    }

    return () => {
      if (cleanupTimeout) {
        window.clearTimeout(cleanupTimeout)
      }
    }
  }, [isTabsLoaded, activeTab, collections])

  const resolveMappingValue = (mapping: VariableMapping) => {
    const sourceItem = history.find((item) => item.id === mapping.sourceRequestId)
    if (!sourceItem) {
      return { value: "", error: "Requête source introuvable dans l'historique." }
    }
    if (!sourceItem.responseBody) {
      return { value: "", error: "Aucune réponse enregistrée pour cette requête." }
    }

    return extractValueFromResponse(sourceItem.responseBody, mapping.sourcePath)
  }

  const dynamicVars = variableMappings
    .filter((mapping) => mapping.enabled && mapping.name.trim())
    .map((mapping) => {
      const result = resolveMappingValue(mapping)
      return {
        key: mapping.name.trim(),
        value: result.error ? "" : result.value,
        enabled: true,
      }
    })

  const allVars = [...envVars, ...dynamicVars]

  const notifyUnresolvedVariables = () => {
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
      title: "Variables non résolues",
      description: `${preview}${suffix}`,
      variant: "destructive",
    })
  }

  const buildRequestPayload = (tab: RequestTab) => {
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
  }

  async function executeRequest(tab: RequestTab) {
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

    setIsLoading(true)
    try {
      if (nativeMode) {
        const result = await invokeTauriFetch(tab.method, finalUrl, headers, tab.method !== "GET" ? finalBody : undefined)
        responseStatus = result.status
        responseHeaders = result.headers
        responseTime = result.durationMs

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
        const proxyResponse = await fetch("/api/proxy", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            url: finalUrl,
            method: tab.method,
            headers,
            body: tab.method !== "GET" ? finalBody : undefined,
          }),
        })

        const proxyResult = await proxyResponse.json()

        if (proxyResponse.ok) {
          responseStatus = proxyResult.status
          responseHeaders = proxyResult.headers || {}

          if (proxyResult.encoding === "base64") {
            const contentType = responseHeaders["content-type"] || responseHeaders["Content-Type"] || "application/octet-stream"
            const binary = Uint8Array.from(atob(proxyResult.body ?? ""), (c) => c.charCodeAt(0))
            responseBody = "[binary data]"
            responseData = new Blob([binary], { type: contentType })
            responseSize = formatSize(responseData.size)
          } else {
            responseBody = proxyResult.body ?? ""
            responseData = responseBody
            responseSize = formatSize(new Blob([responseBody]).size)
          }
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

    return {
      responseStatus,
      responseHeaders,
      responseBody,
      responseData,
      responseSize,
      responseTime,
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    console.log('[DEBUG] saveActiveTab called, isSaved=', activeTab?.isSaved, 'savedRequestId=', activeTab?.savedRequestId)
    if (!activeTab) return
    
    // Case 1: Already linked to a collection - do silent update
    if (activeTab.isSaved && activeTab.savedRequestId) {
      console.log('[DEBUG] Doing silent update for savedRequestId=', activeTab.savedRequestId)
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
      toast({ title: `"${activeTab.name}" enregistré` })
      return
    }

    // Case 2 & 3: Either never saved OR saved as local draft - open dialog
    // This allows users to: first-time save (case 2) or move local draft to collection (case 3)
    console.log('[DEBUG] Opening save dialog')
    setSaveModalName(activeTab.name || "Nouvelle requête")
    setSaveModalCollectionId("none")
    setSaveModalOpen(true)
  }, [activeTab, updateRequestById, setSaveModalOpen, setSaveModalName, setSaveModalCollectionId])

  const handleSaveDialogSubmit = () => {
    console.log('[DEBUG] handleSaveDialogSubmit called, saveModalCollectionId=', saveModalCollectionId, 'saveModalName=', saveModalName)
    if (!activeTab) return
    let newSavedId: string | undefined = undefined
    let targetCollectionId = saveModalCollectionId

    if (saveModalCollectionId === "none") {
      // Option 1: Save to "Brouillons" collection instead of local draft
      const brouillonsCollection = collections.find(c => c.name === "Brouillons")
      if (brouillonsCollection) {
        targetCollectionId = brouillonsCollection.id
        console.log('[DEBUG] Saving to Brouillons collection:', targetCollectionId)
      } else {
        console.warn('[DEBUG] Brouillons collection not found!')
      }
    }

    if (targetCollectionId !== "none") {
      // Save to a collection
      console.log('[DEBUG] Saving to collection:', targetCollectionId)
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
      toast({ title: `"${saveModalName}" enregistré dans ${collectionName}` })
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

  const closeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()

    const newTabs = tabs.filter((t) => t.id !== id)
    
    // If closing the last tab, create a new empty one
    if (newTabs.length === 0) {
      const newTabId = `${Date.now()}`
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

  const updateTab = (id: string, updates: Partial<RequestTab>) => {
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
  }

  const duplicateTab = (tab: RequestTab) => {
    const newId = `${Date.now()}`
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

  function buildTabFromRequest(request: RequestItem | HistoryItem | PendingCollectionRequest): Partial<RequestTab> { return {
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
  }; }

  const loadRequestIntoActiveTab = (request: RequestItem | HistoryItem) => {
    updateTab(activeTab.id, buildTabFromRequest(request))
  }

  const handleGenerateFollowUp = async (item: HistoryItem) => {
    const payload = buildAiProxyPayload("", "")
    if (!payload) {
      toast({
        title: "IA non configurée",
        description: "Ajoutez une clé API ou Ollama dans Paramètres → IA.",
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
        title: "Requête de suivi générée",
        description: generated.rationale || "Chargée dans l'éditeur actif.",
      })
    } catch (err) {
      toast({
        title: "Échec de génération IA",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      })
    } finally {
      setGeneratingFollowUpId(null)
    }
  }

  const runBackgroundRequest = async (request: RequestItem) => {
    const backgroundTab = {
      ...activeTab,
      ...buildTabFromRequest(request),
    } as RequestTab

    if (backgroundTab.bodyType === "json" && backgroundTab.body) {
      try {
        JSON.parse(interpolate(backgroundTab.body, allVars))
      } catch {
        toast({ title: `Corps JSON invalide pour "${request.name}" après interpolation.`, variant: "destructive" })
        return null
      }
    }

    const result = await executeRequest(backgroundTab)
    return result
  }



  const exportActiveRequest = async () => {
    // Détection live de Tauri v2 — ne dépend pas du state nativeMode qui peut être stale
    const isTauri = !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ || !!(window as unknown as { __TAURI__?: unknown }).__TAURI__
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
      const jsonContent = JSON.stringify(requestData, null, 2)
      try {
        const { invoke } = await import("@tauri-apps/api/core")
        const savedPath = await invoke<string>("export_json", {
          content: jsonContent,
          defaultName: 'request.json',
        })
        console.log('[EXPORT] ✅ Sauvegardé :', savedPath)
        toast({ title: `Fichier sauvegardé : ${savedPath}` })
      } catch (error: unknown) {
        console.error('[EXPORT] ❌ Erreur invoke :', error, JSON.stringify(error))
        if (error === 'cancelled') return
        toast({ title: `Erreur export : ${String(error)}`, variant: "destructive" })
        // Fallback navigateur
        downloadJson(requestData, 'request.json')
      }
    } else {
      console.log('[EXPORT] → downloadJson (navigateur)')
      downloadJson(requestData, 'request.json')
      toast({ title: 'Téléchargement démarré' })
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
    const newTabId = `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
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
    toast({ title: "Nouvelle requête créée dans la collection" })
  }

  const sendRequest = async () => {
    await sendSpecificRequest(activeTab)
  }

  async function sendSpecificRequest(tabToSend: RequestTab) {
    if (!tabToSend?.url) return

    notifyUnresolvedVariables()

    if (tabToSend.bodyType === "json" && tabToSend.body) {
      const interpolatedBody = interpolate(tabToSend.body, allVars)
      try {
        JSON.parse(interpolatedBody)
      } catch {
        toast({ title: "Corps JSON invalide après interpolation des variables.", variant: "destructive" })
        return
      }
    }

    const { finalUrl, headers } = buildRequestPayload(tabToSend)
    const result = await executeRequest(tabToSend)

    if (!result) return

    updateTab(tabToSend.id, {
      hasResponse: true,
      responseStatus: result.responseStatus,
      responseTime: result.responseTime,
      responseSize: result.responseSize,
      responseBody: result.responseBody,
      responseData: result.responseData,
      responseHeaders: result.responseHeaders,
    })

    setCurrentRequest?.({
      method: tabToSend.method,
      url: finalUrl,
      headers,
      params: Object.fromEntries((tabToSend.queryParams || []).map((param) => [param.key, param.value])),
      body: tabToSend.body,
    } as CurrentRequest)

    setLastResponse?.({
      status: result.responseStatus ?? 0,
      durationMs: result.responseTime,
      headers: result.responseHeaders || {},
      body: result.responseData ?? result.responseBody,
    })

    addHistoryAndNotify({
      name: tabToSend.name,
      method: tabToSend.method,
      url: tabToSend.url,
      endpoint: tabToSend.endpoint,
      headers: headersArrayToRecord(tabToSend.headers),
      body: tabToSend.body,
      queryParams: tabToSend.queryParams,
      responseStatus: result.responseStatus,
      responseTime: result.responseTime,
      responseSize: result.responseSize,
      responseBody: result.responseBody,
    })

    return result
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
            <div
              key={tab.id}
              role="button"
              tabIndex={0}
              onClick={() => setActiveTabId(tab.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  setActiveTabId(tab.id)
                }
              }}
              className={cn(
                "group relative flex shrink-0 cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
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
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id, e)
                }}
                className="ml-1 rounded p-0.5 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </div>
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
      <div className="flex flex-wrap items-center justify-between border-b border-border px-6 py-3 gap-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">API Endpoints</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

          <div className="hidden max-[916px]:inline-flex">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[220px]">
                <DropdownMenuLabel>More actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={saveActiveTab} className="cursor-pointer">
                  {activeTab.isSaved ? "Saved" : "Save"}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={exportActiveRequest} className="cursor-pointer">
                  Export JSON
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setHistoryOpen(true)} className="cursor-pointer">
                  History
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setChainingOpen(true)} className="cursor-pointer">
                  Chaining
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex-wrap items-center gap-2 max-[916px]:hidden">
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
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => setChainingOpen(true)}
            >
              <Zap className="size-4" />
              Chaining
            </Button>
          </div>
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
        {collectionRequestStatus && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs text-sky-700 animate-in fade-in duration-300">
              <span>{collectionRequestStatus}</span>
            </div>
            {collectionRunLogs.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                <div className="font-medium text-slate-900 mb-1">Logs d'exécution</div>
                <div className="space-y-1">
                  {collectionRunLogs.slice(-5).map((log, index) => (
                    <div key={index} className="truncate">{log}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Panels - 50/50 */}
      <div className="grid min-h-0 h-full flex-1 grid-cols-2 max-[916px]:grid-cols-1 overflow-hidden">
        <div className="min-w-0 min-h-0 overflow-auto hide-scrollbar border-r border-border max-[916px]:border-r-0 max-[916px]:border-b">
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

        <div className="min-w-0 min-h-0 h-full overflow-auto flex-1 hide-scrollbar">
          <ResponsePanel
            key={activeTab.id}
            responseBody={activeTab.responseBody}
            responseData={activeTab.responseData}
            responseStatus={activeTab.responseStatus}
            responseTime={activeTab.responseTime}
            responseSize={activeTab.responseSize}
            responseHeaders={activeTab.responseHeaders}
            isLoading={isLoading || aiEngine.isLoading}
            aiIsLoading={aiEngine.isLoading}
            onRun={sendRequest}
            onAnalyze={handleAnalyzeRequest}
            onGenerateTests={handleGenerateTests}
            aiSummary={aiEngine.lastSummary ?? undefined}
            aiError={aiEngine.error ?? undefined}
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
        onRunCollection={runCollection}
        onRunCollectionBackground={runCollectionBackground}
        onAddCollection={createNewCollection}
        onDeleteCollection={deleteCollection}
        onRenameCollection={renameCollection}
        onAddRequestToCollection={handleAddRequestToCollection}
        onRemoveRequestFromCollection={removeRequestFromCollection}
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
                <p className="text-xs text-muted-foreground mt-1">Utilisez des chemins comme <span className="font-mono">data.items[0].token</span>. Seuls les caractères alphanumériques, <span className="font-mono">_</span>, <span className="font-mono">.</span>, <span className="font-mono">-</span> et <span className="font-mono">[]</span> sont autorisés.</p>
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
                Aucun mapping actif. Créez un mapping et utilisez-le avec <span className="font-mono">{"{{token}}"}</span> dans l'URL, les en-têtes ou le corps.
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
                          <p className="mt-2 text-xs text-destructive">Format invalide : utilisez data.items[0].token ou data.user.id.</p>
                        )}
                      </div>

                      <div className="min-w-0">
                        <p className="mb-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">Variable name</p>
                        <Input value={mapping.name} onChange={(e) => updateVariableMapping(mapping.id, { name: e.target.value })} placeholder="token" className="h-11 w-full min-w-0" />
                      </div>
                    </div>

<div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] items-center text-sm text-muted-foreground">
                          <div>
                            Aperçu: <span className="font-mono text-foreground">{(() => {
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
            <DialogTitle>Enregistrer la requête</DialogTitle>
            <DialogDescription>
              Donnez un nom à votre requête et choisissez si vous souhaitez l&apos;ajouter à une collection.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="save-name" className="text-sm font-medium text-foreground">
                Nom de la requête
              </label>
              <Input
                id="save-name"
                value={saveModalName}
                onChange={(e) => setSaveModalName(e.target.value)}
                placeholder="Ma requête"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveDialogSubmit()
                }}
                autoFocus
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="save-collection" className="text-sm font-medium text-foreground">
                Collection (optionnel)
              </label>
              <Select value={saveModalCollectionId} onValueChange={setSaveModalCollectionId}>
                <SelectTrigger id="save-collection" className="w-full">
                  <SelectValue placeholder="Aucune collection" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">📋 Brouillons</SelectItem>
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
              Annuler
            </Button>
            <Button onClick={handleSaveDialogSubmit}>
              <Save className="mr-2 size-4" />
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
