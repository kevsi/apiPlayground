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
import { fireSystemNotification, pushInAppNotification } from "@/lib/system-notifications"
import { downloadJson, interpolate, replaceLocalhostPort, hasUnresolvedPlaceholders } from "@/lib/utils"
import { isSourcePathSyntaxValid } from "@/lib/variable-path"
import { generateFollowUpRequest } from "@/lib/ai-request-generator"
import { runScript } from "@/lib/test-runner/scripts"
import type { RunnerContext } from "@/lib/test-runner/types"
import { buildAiProxyPayload } from "@/lib/ai-config"
import { useAIEngine, type AIEngineHandlers } from "@/hooks/use-ai-engine"
import {
  convertToRequestTestAssertions,
  convertToRunnerAssertions,
} from "@/lib/ai-assertion-converter"
import type { TestAssertion } from "@/lib/ai-engine"
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

  const syncActiveTabToAiStore = useCallback(() => {
    if (!activeTab) return
    setCurrentRequest({
      id: activeTab.id,
      method: activeTab.method,
      url: activeTab.url,
      endpoint: activeTab.endpoint,
      headers: headersArrayToRecord(activeTab.headers),
      body: activeTab.body,
      queryParams: activeTab.queryParams,
    })
    if (activeTab.hasResponse) {
      setLastResponse({
        status: activeTab.responseStatus ?? 0,
        durationMs: activeTab.responseTime ?? 0,
        headers: activeTab.responseHeaders ?? {},
        body: activeTab.responseBody,
      })
    }
  }, [activeTab, setCurrentRequest, setLastResponse])

  const aiTabHandlers = useMemo<AIEngineHandlers>(
    () => ({
      setRequest: (patch) => {
        if (!activeTab) return
        const tabPatch: Partial<RequestTab> = {}
        if (patch.method) tabPatch.method = patch.method as HttpMethod
        if (patch.url) {
          tabPatch.url = patch.url
          tabPatch.endpoint = patch.url.replace(/^https?:\/\/[^/]+/, "") || "/"
        }
        if (patch.headers) tabPatch.headers = recordToHeaderArray(patch.headers)
        if (patch.params) {
          tabPatch.queryParams = Object.entries(patch.params).map(([key, value]) => ({
            key,
            value: String(value),
          }))
        }
        if (patch.body !== undefined) {
          tabPatch.body =
            typeof patch.body === "string" ? patch.body : JSON.stringify(patch.body, null, 2)
          tabPatch.bodyType = "json"
        }
        updateTab(activeTab.id, tabPatch)
        syncActiveTabToAiStore()
      },
      addAssertions: (aiAssertions: TestAssertion[]) => {
        if (aiAssertions.length === 0) return
        const incomingTests = convertToRequestTestAssertions(aiAssertions)
        const incomingRunner = convertToRunnerAssertions(aiAssertions)
        setTabs((prev) =>
          prev.map((t) =>
            t.id === activeTabId
              ? {
                  ...t,
                  assertions: [...(t.assertions ?? []), ...incomingTests],
                  runnerAssertions: [...(t.runnerAssertions ?? []), ...incomingRunner],
                }
              : t,
          ),
        )
        toast({
          title: `${incomingTests.length} assertion${incomingTests.length > 1 ? "s" : ""} ajoutée${incomingTests.length > 1 ? "s" : ""}`,
          description: "Consulte les onglets Tests et Assertions dans le panneau requête.",
        })
      },
      applyFix: (patch) => {
        if (!activeTab) return
        const tabPatch: Partial<RequestTab> = {}
        if (patch.method) tabPatch.method = patch.method as HttpMethod
        if (patch.url) {
          tabPatch.url = patch.url
          tabPatch.endpoint = patch.url.replace(/^https?:\/\/[^/]+/, "") || "/"
        }
        if (patch.headers) tabPatch.headers = recordToHeaderArray(patch.headers)
        if (patch.body !== undefined) {
          tabPatch.body =
            typeof patch.body === "string" ? patch.body : JSON.stringify(patch.body, null, 2)
        }
        updateTab(activeTab.id, tabPatch)
        syncActiveTabToAiStore()
      },
    }),
    [activeTab, activeTabId, setTabs, updateTab, syncActiveTabToAiStore],
  )

  const aiEngine = useAIEngine(aiTabHandlers)
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
        // Fresh script context per request. In-browser runs of pm.environment.set
        // mutate this object and are merged into allVars for this request only.
        // For cross-request persistence, use the test-runner (Run Collection).
        // allVars is EnvironmentVariable[]; flatten to Record<string,string>.
        const envRecord: Record<string, string> = {}
        for (const v of allVars) {
          if (v.enabled !== false) envRecord[v.key] = v.value
        }
        const ctx: RunnerContext = {
          environment: envRecord,
          iterationData: {} as Record<string, string>,
          iterationIndex: 0,
          log: (msg: string) => console.log("[script]", msg),
        }

        // Pre-request script
        if (tab.preRequestScript?.trim()) {
          let out
          try {
            out = await runScript(tab.preRequestScript, ctx, {
              phase: "pre",
              timeoutMs: 5000,
            })
          } catch (scriptErr) {
            console.error("[executeRequestWrapper pre-request script]", scriptErr)
            toast({
              title: "Pre-request script crashed",
              description:
                scriptErr instanceof Error ? scriptErr.message : String(scriptErr),
              variant: "destructive",
            })
            out = undefined
          }
          if (out?.error) {
            toast({
              title: "Pre-request script error",
              description: out.error,
              variant: "destructive",
            })
          } else if (out && out.consoleLines.length > 0) {
            toast({
              title: "Pre-request script",
              description: out.consoleLines.join("\n").slice(0, 200),
            })
          }
        }

        // Execute the HTTP request, picking up any vars the script set.
        // Convert ctx.environment (Record<string,string>) back into
        // EnvironmentVariable[] so interpolate() can call .filter() on it.
        const scriptVars = Object.entries(ctx.environment).map(([key, value]) => ({
          key,
          value,
          enabled: true,
        }))
        const allVarsAfterScript = [...allVars, ...scriptVars]

        const result = await executeRequest({
          tab,
          allVars: allVarsAfterScript,
          activeProjectPort,
          activeProject: !!activeProject,
          nativeMode,
          activeWorkspaceId: activeWorkspaceId ?? null,
        })

        // Post-response script
        if (tab.postResponseScript?.trim()) {
          const responseForScript = {
            statusCode: result?.responseStatus ?? 0,
            responseTimeMs: result?.responseTime ?? 0,
            body: result?.responseBody ?? "",
            headers: (result?.responseHeaders ?? {}) as Record<string, string>,
          }
          let out
          try {
            out = await runScript(tab.postResponseScript, ctx, {
              phase: "post",
              response: responseForScript,
              timeoutMs: 5000,
            })
          } catch (scriptErr) {
            console.error("[executeRequestWrapper post-response script]", scriptErr)
            toast({
              title: "Post-response script crashed",
              description:
                scriptErr instanceof Error ? scriptErr.message : String(scriptErr),
              variant: "destructive",
            })
            out = undefined
          }
          if (out?.error) {
            toast({
              title: "Post-response script error",
              description: out.error,
              variant: "destructive",
            })
          } else if (out && out.consoleLines.length > 0) {
            toast({
              title: "Post-response script",
              description: out.consoleLines.join("\n").slice(0, 200),
            })
          }
        }

        return result
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
      runnerAssertions: (request as RequestItem).runnerAssertions ?? [],
      preRequestScript: (request as RequestItem).preRequestScript ?? "",
      postResponseScript: (request as RequestItem).postResponseScript ?? "",
      protocol: (request as RequestItem).protocol,
      graphql: (request as RequestItem).graphql,
      datasetKey: (request as RequestItem).datasetKey,
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
      try {
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
      } catch (err) {
        console.error("[sendSpecificRequest]", err)
        toast({
          title: "Request failed",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        })
        return null
      }
    },
    [
      allVars,
      notifyUnresolvedVariables,
      executeRequestWrapper,
      updateTab,
      setCurrentRequest,
      setLastResponse,
      addHistoryAndNotify,
      toast,
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
        toast({ title: `Collection "${collection.name}" is empty.`, variant: "destructive", meta: { event: "collectionComplete" } })
        return
      }

      toast({ title: `Background execution started for "${collection.name}".`, meta: { event: "collectionComplete" } })
      setCollectionRequestStatus(`Background: running "${collection.name}"…`)
      setCollectionRunLogs([`Starting execution of collection "${collection.name}"`])

      try {
        for (const request of collection.requests) {
          try {
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
          } catch (reqErr) {
            console.error("[runCollectionBackground] request failed", reqErr)
            toast({
              title: `Request "${request.name}" failed`,
              description: reqErr instanceof Error ? reqErr.message : String(reqErr),
              variant: "destructive",
              meta: { event: "collectionComplete" },
            })
            setCollectionRunLogs((logs) => [
              ...logs,
              `"${request.name}" → ERROR: ${reqErr instanceof Error ? reqErr.message : String(reqErr)}`,
            ])
          }
        }
      } finally {
        toast({
          title: `Background run of "${collection.name}" completed.`,
          meta: { event: "collectionComplete" },
        })
        fireSystemNotification({
          title: `Collection "${collection.name}" terminée`,
          body: `${collection.requests.length} requête${collection.requests.length > 1 ? "s" : ""} exécutée${collection.requests.length > 1 ? "s" : ""}.`,
          event: "collectionComplete",
          tag: `collection-${collection.id}`,
        })
        pushInAppNotification({
          title: `Collection "${collection.name}" terminée`,
          body: `${collection.requests.length} requête${collection.requests.length > 1 ? "s" : ""} exécutée${collection.requests.length > 1 ? "s" : ""}.`,
          type: "success",
          event: "collectionComplete",
        })
        setCollectionRequestStatus(`Background run completed (${collection.requests.length})`)
        window.setTimeout(() => setCollectionRequestStatus(null), 8000)
      }
    },
    [
      activeTab,
      buildTabFromRequest,
      executeRequestWrapper,
      addHistoryAndNotify,
      setCollectionRequestStatus,
      setCollectionRunLogs,
      toast,
    ],
  )

  const runCollection = useCallback(
    async (collection: Collection) => {
      if (!activeTab) return
      if (!collection.requests.length) {
        toast({ title: `Collection "${collection.name}" is empty.`, variant: "destructive", meta: { event: "collectionComplete" } })
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
      try {
        const result = await sendSpecificRequest(newTab, false)
        if (!result) return { success: false, error: `"${request.name}" → failed` }

        return {
          success: true,
          status: result.responseStatus ?? 0,
          time: result.responseTime ?? 0,
        }
      } catch (err) {
        console.error("[handleBatchRunRequest]", err)
        // Remove the orphan batch-* tab added above so the UI does not keep a stuck tab.
        setTabs((currentTabs) => currentTabs.filter((t) => t.id !== newTab.id))
        toast({
          title: "Batch request failed",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        })
        return {
          success: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    },
    [buildTabFromRequest, setTabs, sendSpecificRequest, toast],
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
        runnerAssertions: activeTab.runnerAssertions,
        preRequestScript: activeTab.preRequestScript,
        postResponseScript: activeTab.postResponseScript,
        protocol: activeTab.protocol,
        graphql: activeTab.graphql,
        datasetKey: activeTab.datasetKey,
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
        runnerAssertions: activeTab.runnerAssertions,
        preRequestScript: activeTab.preRequestScript,
        postResponseScript: activeTab.postResponseScript,
        protocol: activeTab.protocol,
        graphql: activeTab.graphql,
        datasetKey: activeTab.datasetKey,
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
    syncActiveTabToAiStore()
    const ctx = aiEngine.buildContext()
    await aiEngine.analyzeAfterRequest(ctx)
  }, [aiEngine, syncActiveTabToAiStore])

  const handleGenerateTests = useCallback(async () => {
    syncActiveTabToAiStore()
    const ctx = aiEngine.buildContext()
    await aiEngine.generateTests(ctx)
  }, [aiEngine, syncActiveTabToAiStore])

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
          meta: { event: "aiError" },
        })
        return
      }

      setGeneratingFollowUpId(item.id)
      try {
        const generated = await generateFollowUpRequest(item, payload)
        // Convert AI-suggested assertions (Postman-style { code, label })
        // into both legacy and runner formats so they show up in the
        // Tests and Assertions tabs.
        const aiAssertions = (generated.assertions ?? []) as TestAssertion[]
        const incomingTests = aiAssertions.length
          ? convertToRequestTestAssertions(aiAssertions)
          : undefined
        const incomingRunner = aiAssertions.length
          ? convertToRunnerAssertions(aiAssertions)
          : undefined
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
            ...(incomingTests ? { assertions: incomingTests } : {}),
            ...(incomingRunner ? { runnerAssertions: incomingRunner } : {}),
            ...(generated.preRequestScript ? { preRequestScript: generated.preRequestScript } : {}),
            ...(generated.postResponseScript ? { postResponseScript: generated.postResponseScript } : {}),
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
          meta: { event: "aiResponse" },
        })
      } catch (err) {
        toast({
          title: "AI generation failed",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
          meta: { event: "aiError" },
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
    if (!tab) return
    try {
      await sendSpecificRequest(tab)
    } catch (err) {
      console.error("[sendRequest]", err)
      toast({
        title: "Request failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      })
    }
  }, [tabs, activeTabId, sendSpecificRequest, toast])

  const sendAndSave = useCallback(async () => {
    const tab = tabs.find((t) => t.id === activeTabId) || tabs[0]
    if (!tab) return
    try {
      const result = await sendSpecificRequest(tab)
      if (result) saveActiveTab()
    } catch (err) {
      console.error("[sendAndSave]", err)
      toast({
        title: "Request failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      })
    }
  }, [tabs, activeTabId, saveActiveTab, sendSpecificRequest, toast])

  const sendAndDownload = useCallback(async () => {
    const tab = tabs.find((t) => t.id === activeTabId) || tabs[0]
    if (!tab) return
    try {
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
    } catch (err) {
      console.error("[sendAndDownload]", err)
      toast({
        title: "Request failed",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      })
    }
  }, [tabs, activeTabId, sendSpecificRequest, toast])

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
      try {
        await sendSpecificRequest(tempTab)
      } catch (err) {
        console.error("[loadAndSendRequest]", err)
        toast({
          title: "Request failed",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        })
      }
    },
    [tabs, activeTabId, buildTabFromRequest, sendSpecificRequest, setTabs, toast],
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
