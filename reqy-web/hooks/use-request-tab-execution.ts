"use client"

import { useEffect, useRef, useCallback, useMemo } from "react"
import type { PendingCollectionRequest } from "@/lib/request-bridge"
import {
  getAndClearPendingCollectionRequest,
  peekPendingCollectionRequest,
  clearPendingCollectionRequest,
} from "@/lib/request-bridge"
import { useMockStore } from "@/hooks/use-mock-store"
import type { MockRoute, MockServer } from "@/lib/mock-types"
import { resolveMappingValue, computeDynamicVars, getUnresolvedWarnings } from "@/lib/variable-mapping"
import { toast } from "@/hooks/use-toast"
import { downloadJson, interpolate, replaceLocalhostPort, hasUnresolvedPlaceholders } from "@/lib/utils"
import { isSourcePathSyntaxValid } from "@/lib/variable-path"
import { generateFollowUpRequest } from "@/lib/ai-request-generator"
import { buildAiProxyPayload } from "@/lib/ai-config"
import { useAIEngine } from "@/hooks/use-ai-engine"
import { persistence } from "@/lib/persistence"
import {
  useRequestStore,
  type Collection,
  type HistoryItem,
  type RequestItem,
} from "@/hooks/use-request-store"
import {
  type HttpMethod,
  type RequestTab,
  executeRequest,
} from "@/lib/request-executor"
import {
  createEmptyTab,
  generateRequestTabId,
  headersArrayToRecord,
  recordToHeaderArray,
} from "@/lib/request-tab-utils"
import type { RequestTabsState } from "@/hooks/use-request-tabs-state"

export function useRequestTabExecution(state: RequestTabsState) {
  const {
    tabs,
    setTabs,
    activeTabId,
    setActiveTabId,
    activeTab,
    isTabsLoaded,
    nativeMode,
    setLoadingCount,
    flashSavedIndicator,
    saveModalOpen,
    setSaveModalOpen,
    saveModalName,
    setSaveModalName,
    saveModalCollectionId,
    setSaveModalCollectionId,
    setHistoryOpen,
    setGeneratingFollowUpId,
    collectionRequestStatus,
    setCollectionRequestStatus,
    collectionRunLogs,
    setCollectionRunLogs,
    batchRunCollection,
    setBatchRunCollection,
    updateTab,
  } = state

  const { addRoute } = useMockStore()
  const {
    collections,
    environments,
    activeEnvironmentId,
    projects,
    selectedProjectId,
    history,
    addHistoryAndNotify,
    addRequestToCollection,
    updateRequestById,
    variableMappings,
    setCurrentRequest,
    setLastResponse,
    activeWorkspaceId,
  } = useRequestStore()

  const activeProject = projects.find((p) => p.id === selectedProjectId) ?? null
  const activeProjectPort = activeProject?.port ?? 3000
  const activeEnv = environments.find((e) => e.id === activeEnvironmentId)
  const envVars = useMemo(() => activeEnv?.variables || [], [activeEnv])
  const aiEngine = useAIEngine()
  const allVars = useMemo(
    () => [...envVars, ...computeDynamicVars(variableMappings, history)],
    [envVars, variableMappings, history],
  )

  const mockSyncedRef = useRef(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (mockSyncedRef.current) return
    mockSyncedRef.current = true

    const routesData = persistence.getItem<MockRoute[]>("reqly-mock-routes")
    const serversData = persistence.getItem<MockServer[]>("reqly-mock-servers")
    const configData = persistence.getItem<{ baseUrl?: string }>("reqly-mock-config")
    if (!routesData && !serversData) return

    const body: Record<string, unknown> = {}
    if (routesData) {
      body.routes = routesData.map((route) => ({
        ...route,
        workspaceId: route.workspaceId || "ws-personal",
      }))
    }
    if (serversData) body.servers = serversData
    if (configData?.baseUrl) body.baseUrl = configData.baseUrl

    fetch("/api/mock/config")
      .then((r) => r.json())
      .then((serverState) => {
        const serverRoutes = Array.isArray(serverState.routes) ? serverState.routes : []
        if (serverRoutes.length === 0) {
          return fetch("/api/mock/config", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          })
        }
      })
      .catch(() => {})
  }, [])

  const notifyUnresolvedVariables = useCallback(() => {
    const warnings = getUnresolvedWarnings(variableMappings, history)
    if (warnings.length === 0) return
    const preview = warnings.slice(0, 3).map((w) => `{{${w.name}}}: ${w.error}`).join(" · ")
    const suffix = warnings.length > 3 ? ` (+${warnings.length - 3} autres)` : ""
    toast({ title: "Unresolved variables", description: `${preview}${suffix}`, variant: "destructive" })
  }, [variableMappings, history])

  const executeRequestWrapper = useCallback(
    async (tab: RequestTab, showLoading = true) => {
      if (showLoading) setLoadingCount((count) => count + 1)
      try {
        return await executeRequest({
          tab,
          allVars,
          activeProjectPort,
          activeProject: !!activeProject,
          nativeMode,
          activeWorkspaceId: activeWorkspaceId ?? null,
        })
      } finally {
        if (showLoading) setLoadingCount((count) => Math.max(0, count - 1))
      }
    },
    [allVars, activeProjectPort, activeProject, nativeMode, activeWorkspaceId, setLoadingCount],
  )

  const buildTabFromRequest = useCallback(
    (request: RequestItem | HistoryItem | PendingCollectionRequest): Partial<RequestTab> => ({
      name: request.name,
      method: request.method as HttpMethod,
      url: activeProject ? replaceLocalhostPort(request.url, activeProjectPort) : request.url,
      endpoint: request.endpoint,
      headers: recordToHeaderArray(request.headers),
      queryParams: request.queryParams ?? [],
      body: request.body ?? "",
      bodyType: (request as RequestItem).bodyType ?? "json",
      authType: (request as RequestItem).authType ?? "none",
      authToken: (request as RequestItem).authToken ?? "",
      assertions: (request as RequestItem).assertions ?? [],
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
      testResults: undefined,
    }),
    [activeProject, activeProjectPort],
  )

  const sendSpecificRequest = useCallback(
    async (tabToSend: RequestTab, showLoading = true) => {
      if (!tabToSend?.url?.trim()) {
        toast({
          title: "Missing URL",
          description: "Enter a valid URL before sending the request.",
          variant: "destructive",
        })
        return null
      }

      const resolvedUrl = interpolate(tabToSend.url, allVars)
      const resolvedBody = interpolate(tabToSend.body || "", allVars)
      const unresolved =
        hasUnresolvedPlaceholders(resolvedUrl) || hasUnresolvedPlaceholders(resolvedBody)

      if (unresolved) {
        notifyUnresolvedVariables()
        toast({
          title: "Unresolved variables",
          description: "Resolve all {{placeholders}} before sending the request.",
          variant: "destructive",
        })
        return null
      }

      const result = await executeRequestWrapper(tabToSend, showLoading)
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
    },
    [
      allVars,
      notifyUnresolvedVariables,
      executeRequestWrapper,
      updateTab,
      setCurrentRequest,
      setLastResponse,
      addHistoryAndNotify,
    ],
  )

  const openRequestInTab = useCallback(
    (request: RequestItem | HistoryItem | PendingCollectionRequest) => {
      const requestId =
        "id" in request && typeof (request as { id?: string }).id === "string"
          ? (request as { id: string }).id
          : undefined

      if (requestId) {
        const existingTab = tabs.find((t) => t.savedRequestId === requestId)
        if (existingTab) {
          setActiveTabId(existingTab.id)
          return existingTab
        }
      }

      const newTab: RequestTab = {
        id: generateRequestTabId(),
        ...buildTabFromRequest(request),
      } as RequestTab

      setTabs((prev) => [...prev, newTab])
      setActiveTabId(newTab.id)
      return newTab
    },
    [tabs, buildTabFromRequest, setTabs, setActiveTabId],
  )

  const runCollectionBackground = useCallback(
    async (collection: Collection) => {
      if (!collection.requests.length) {
        toast({ title: `Collection "${collection.name}" is empty.`, variant: "destructive" })
        return
      }

      toast({ title: `Background execution started for "${collection.name}".` })
      setCollectionRequestStatus(`Background: running "${collection.name}"…`)
      setCollectionRunLogs([`Starting execution of collection "${collection.name}"`])

      for (const request of collection.requests) {
        const backgroundTab = { ...activeTab, ...buildTabFromRequest(request) } as RequestTab
        const result = await executeRequestWrapper(backgroundTab, false)
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

      toast({
        title: `Background run of "${collection.name}" completed.`,
        meta: { event: "collectionComplete" },
      } as Parameters<typeof toast>[0])
      setCollectionRequestStatus(`Background run completed (${collection.requests.length})`)
      window.setTimeout(() => setCollectionRequestStatus(null), 8000)
    },
    [
      activeTab,
      buildTabFromRequest,
      executeRequestWrapper,
      addHistoryAndNotify,
      setCollectionRequestStatus,
      setCollectionRunLogs,
    ],
  )

  const runCollection = useCallback(
    async (collection: Collection) => {
      if (!activeTab) return
      if (!collection.requests.length) {
        toast({ title: `Collection "${collection.name}" is empty.`, variant: "destructive" })
        return
      }
      setBatchRunCollection(collection)
    },
    [activeTab, setBatchRunCollection],
  )

  const handleBatchRunRequest = useCallback(
    async (
      request: RequestItem,
      index: number,
    ): Promise<{ success: boolean; status?: number; time?: number; error?: string }> => {
      void index
      const newTab: RequestTab = {
        id: `batch-${generateRequestTabId()}`,
        ...buildTabFromRequest(request),
      } as RequestTab

      setTabs((currentTabs) => [...currentTabs, newTab])
      const result = await sendSpecificRequest(newTab, false)
      if (!result) return { success: false, error: `"${request.name}" → failed` }

      return {
        success: true,
        status: result.responseStatus ?? 0,
        time: result.responseTime ?? 0,
      }
    },
    [buildTabFromRequest, setTabs, sendSpecificRequest],
  )

  useEffect(() => {
    if (!isTabsLoaded) return

    const batchPending = peekPendingCollectionRequest() as PendingCollectionRequest | null
    if (batchPending && batchPending.collectionId && batchPending.sendImmediately && activeTab) {
      const collectionToRun = collections.find((c) => c.id === batchPending.collectionId)
      if (collectionToRun) {
        clearPendingCollectionRequest()
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
      return
    }

    const pendingRequest = getAndClearPendingCollectionRequest() as PendingCollectionRequest | null
    if (!pendingRequest) return

    const tab = openRequestInTab(pendingRequest)
    let cleanupTimeout: number | undefined
    let statusImmediate: number | undefined
    let statusSentImmediate: number | undefined

    if (pendingRequest.sendImmediately) {
      statusImmediate = window.setTimeout(() => setCollectionRequestStatus("Sending Collections request…"), 0)
      void (async () => {
        await sendSpecificRequest(tab)
        statusSentImmediate = window.setTimeout(() => setCollectionRequestStatus("Collection request sent"), 0)
        cleanupTimeout = window.setTimeout(() => setCollectionRequestStatus(null), 6000)
      })()
    } else {
      statusImmediate = window.setTimeout(
        () => setCollectionRequestStatus("Collection request loaded in editor"),
        0,
      )
      toast({ title: "Requête chargée dans l'éditeur" })
      cleanupTimeout = window.setTimeout(() => setCollectionRequestStatus(null), 6000)
    }

    return () => {
      if (cleanupTimeout) window.clearTimeout(cleanupTimeout)
      if (statusImmediate) window.clearTimeout(statusImmediate)
      if (statusSentImmediate) window.clearTimeout(statusSentImmediate)
    }
  }, [
    isTabsLoaded,
    activeTab,
    collections,
    openRequestInTab,
    runCollection,
    runCollectionBackground,
    sendSpecificRequest,
    setCollectionRequestStatus,
  ])

  const saveActiveTab = useCallback(() => {
    if (!activeTab) return

    if (activeTab.isSaved && activeTab.savedRequestId) {
      updateRequestById(activeTab.savedRequestId, {
        name: activeTab.name,
        method: activeTab.method,
        url: activeTab.url,
        endpoint: activeTab.endpoint,
        headers: headersArrayToRecord(activeTab.headers),
        body: activeTab.body,
        bodyType: activeTab.bodyType,
        authType: activeTab.authType,
        authToken: activeTab.authToken,
        queryParams: activeTab.queryParams,
        assertions: activeTab.assertions,
      })
      flashSavedIndicator()
      toast({ title: `"${activeTab.name}" saved` })
      return
    }

    setSaveModalName(activeTab.name || "New request")
    setSaveModalCollectionId("none")
    setSaveModalOpen(true)
  }, [
    activeTab,
    updateRequestById,
    flashSavedIndicator,
    setSaveModalName,
    setSaveModalCollectionId,
    setSaveModalOpen,
  ])

  const handleSaveDialogSubmit = useCallback(() => {
    if (!activeTab) return
    let newSavedId: string | undefined
    let targetCollectionId = saveModalCollectionId

    if (saveModalCollectionId === "none") {
      const brouillonsCollection = collections.find((c) => c.name === "Brouillons")
      if (brouillonsCollection) targetCollectionId = brouillonsCollection.id
    }

    if (targetCollectionId !== "none") {
      newSavedId = addRequestToCollection(targetCollectionId, {
        name: saveModalName,
        method: activeTab.method,
        url: activeTab.url,
        endpoint: activeTab.endpoint,
        headers: headersArrayToRecord(activeTab.headers),
        body: activeTab.body,
        bodyType: activeTab.bodyType,
        authType: activeTab.authType,
        authToken: activeTab.authToken,
        queryParams: activeTab.queryParams,
        assertions: activeTab.assertions,
      })
      const targetCollection = collections.find((c) => c.id === targetCollectionId)
      toast({ title: `"${saveModalName}" saved in ${targetCollection?.name || "la collection"}` })
    }

    setTabs((cur) =>
      cur.map((t) =>
        t.id === activeTab.id
          ? { ...t, name: saveModalName, isSaved: true, savedRequestId: newSavedId }
          : t,
      ),
    )

    setSaveModalOpen(false)
    flashSavedIndicator()
  }, [
    activeTab,
    saveModalCollectionId,
    saveModalName,
    collections,
    addRequestToCollection,
    setTabs,
    setSaveModalOpen,
    flashSavedIndicator,
  ])

  const handleAnalyzeRequest = useCallback(async () => {
    const ctx = aiEngine.buildContext()
    await aiEngine.analyzeAfterRequest(ctx)
  }, [aiEngine])

  const handleGenerateTests = useCallback(async () => {
    const ctx = aiEngine.buildContext()
    await aiEngine.generateTests(ctx)
  }, [aiEngine])

  const handleCreateMock = useCallback(() => {
    try {
      const tab = activeTab
      if (!tab) return
      if (!tab.responseBody && tab.responseStatus !== 204) return

      const findHeader = (headers: Record<string, string> | undefined, name: string) => {
        if (!headers) return undefined
        const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase())
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

      toast({
        title: `✅ Mock créé : ${mockData.name}`,
        description: `${mockData.method} ${mockData.pathPattern} → ${mockData.responseStatus}`,
        duration: 5000,
      })
      addRoute(mockData)
    } catch (e) {
      console.error("[handleCreateMock]", e)
    }
  }, [activeTab, addRoute, activeWorkspaceId])

  const handleGenerateFollowUp = useCallback(
    async (item: HistoryItem) => {
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
    },
    [activeTab, updateTab, buildTabFromRequest, setHistoryOpen, setGeneratingFollowUpId],
  )

  const exportActiveRequest = useCallback(async () => {
    const isTauri =
      !!(window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ||
      !!(window as unknown as { __TAURI__?: unknown }).__TAURI__

    if (!activeTab) return

    const requestData = {
      method: activeTab.method,
      url: activeTab.url,
      requestHeaders: activeTab.headers,
      body: activeTab.body,
      bodyType: activeTab.bodyType,
      authType: activeTab.authType,
      authToken: activeTab.authToken,
      assertions: activeTab.assertions,
    }

    if (isTauri) {
      const jsonContent = JSON.stringify(requestData, null, 2)
      try {
        const { invoke } = await import("@tauri-apps/api/core")
        const savedPath = await invoke<string>("export_json", {
          content: jsonContent,
          defaultName: "request.json",
        })
        toast({ title: `File saved: ${savedPath}` })
      } catch (error: unknown) {
        if (error === "cancelled") return
        toast({ title: `Export error: ${String(error)}`, variant: "destructive" })
        downloadJson(requestData, "request.json")
      }
    } else {
      downloadJson(requestData, "request.json")
      toast({ title: "Download started" })
    }
  }, [activeTab])

  const createNewRequestInCollection = useCallback(
    (collectionId: string) => {
      const newRequestId = addRequestToCollection(collectionId, {
        name: "New Request",
        method: "GET",
        url: "",
        endpoint: "",
        headers: {},
        body: "",
        queryParams: [],
        assertions: [],
      })

      const newTab = createEmptyTab({
        id: `tab-${generateRequestTabId()}`,
        isSaved: true,
        savedRequestId: newRequestId,
      })

      setTabs((cur) => [...cur, newTab])
      setActiveTabId(newTab.id)
      toast({ title: "New request created in collection" })
    },
    [addRequestToCollection, setTabs, setActiveTabId],
  )

  const sendRequest = useCallback(async () => {
    const tab = tabs.find((t) => t.id === activeTabId) || tabs[0]
    if (tab) await sendSpecificRequest(tab)
  }, [tabs, activeTabId, sendSpecificRequest])

  const sendAndSave = useCallback(async () => {
    const tab = tabs.find((t) => t.id === activeTabId) || tabs[0]
    if (!tab) return
    const result = await sendSpecificRequest(tab)
    if (result) saveActiveTab()
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

  const loadRequestIntoActiveTab = useCallback(
    (request: RequestItem | HistoryItem) => {
      openRequestInTab(request)
    },
    [openRequestInTab],
  )

  const loadAndSendRequest = useCallback(
    async (request: RequestItem | HistoryItem) => {
      const currentTab = tabs.find((t) => t.id === activeTabId) || tabs[0]
      const tempTab: RequestTab = { ...currentTab, ...buildTabFromRequest(request) } as RequestTab
      setTabs((currentTabs) => currentTabs.map((t) => (t.id === activeTabId ? tempTab : t)))
      await sendSpecificRequest(tempTab)
    },
    [tabs, activeTabId, buildTabFromRequest, sendSpecificRequest, setTabs],
  )

  useEffect(() => {
    const container = document.querySelector(".request-panel-scroll")
    if (container) container.scrollTop = 0
  }, [activeTabId])

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

  return {
    aiEngine,
    collections,
    history,
    variableMappings,
    collectionRequestStatus,
    collectionRunLogs,
    batchRunCollection,
    setBatchRunCollection,
    saveActiveTab,
    handleSaveDialogSubmit,
    sendRequest,
    sendAndSave,
    sendAndDownload,
    loadRequestIntoActiveTab,
    loadAndSendRequest,
    runCollection,
    handleBatchRunRequest,
    handleAnalyzeRequest,
    handleGenerateTests,
    handleCreateMock,
    handleGenerateFollowUp,
    exportActiveRequest,
    createNewRequestInCollection,
    saveModalOpen,
    setSaveModalOpen,
    saveModalName,
    setSaveModalName,
    saveModalCollectionId,
    setSaveModalCollectionId,
  }
}

export type RequestTabExecution = ReturnType<typeof useRequestTabExecution>
