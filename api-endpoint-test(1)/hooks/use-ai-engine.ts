"use client"

import { useCallback, useState } from "react"
import {
  AIAction,
  AIContext,
  AIResponse,
  CurrentRequest,
  LastResponse,
  TestAssertion,
  callAI,
  callAIText,
  dispatchAIActions,
  PROMPTS,
  AIProvider,
} from "@/lib/ai-engine"
import { loadAIProvider, loadApiKey, loadOllamaConfig, loadAiBaseUrl, loadAiModel } from "@/hooks/use-projects-store"
import { useRequestStore } from "@/hooks/use-request-store"

export interface AIConfig {
  provider: AIProvider
  apiKey?: string
  model?: string
  openaiUrl?: string
  ollamaUrl?: string
}

interface AIRequestStore {
  currentRequest: CurrentRequest
  lastResponse?: LastResponse | null
  environmentVariables: Record<string, string>
  collectionHistory: CurrentRequest[]
  activeCollection?: string | null
  patchRequest: (patch: Partial<CurrentRequest>) => void
  addAssertions: (assertions: TestAssertion[]) => void
  setVariable: (name: string, value: string, description?: string) => void
  setDoc: (markdown: string, title?: string) => void
  notify: (message: string) => void
  addNotification: (notif: { title: string; body?: string; type?: "info" | "success" | "warning" | "error"; event?: string }) => any
  aiAutoApply?: boolean
  executeRequest?: (request: Partial<CurrentRequest> | CurrentRequest) => Promise<any>
}

export interface UseAIEngineResult {
  isLoading: boolean
  lastSummary: string | null
  error: string | null
  analyzeAfterRequest: (ctx: AIContext) => Promise<void>
  generateTests: (ctx: AIContext) => Promise<void>
  askNaturalLanguage: (description: string, ctx: AIContext) => Promise<void>
  generateDocs: (requests: CurrentRequest[]) => Promise<void>
  sendMessage: (
    message: string,
    systemPrompt: string,
    ctx: AIContext,
    configOverride?: Partial<AIConfig>
  ) => Promise<string>
  buildContext: () => AIContext
}

function parseAiConfig(override?: Partial<AIConfig>): AIConfig {
  const provider = override?.provider ?? loadAIProvider()
  const apiKey = override?.apiKey ?? loadApiKey(provider) ?? ""
  const openaiUrl = override?.openaiUrl ?? loadAiBaseUrl(provider)
  const modelOverride = override?.model ?? loadAiModel(provider)
  const ollamaConfig = loadOllamaConfig()

  if (!provider) {
    throw new Error("Configure ton provider IA dans Settings")
  }

  if (provider !== "ollama" && !apiKey.trim()) {
    throw new Error("Clé API manquante dans Settings")
  }

  return {
    provider,
    apiKey: apiKey.trim(),
    model: modelOverride?.trim() || (provider === "ollama" ? ollamaConfig.model : undefined),
    openaiUrl: provider === "openai" ? openaiUrl?.trim() || undefined : undefined,
    ollamaUrl:
      provider === "ollama"
        ? `http://${ollamaConfig.host || "127.0.0.1"}:${ollamaConfig.port ?? 11434}`
        : undefined,
  }
}

function getHandlers(store: AIRequestStore) {
  return {
    setRequest: (patch: Partial<CurrentRequest>) => store.patchRequest(patch),
    addAssertions: (assertions: TestAssertion[]) => store.addAssertions(assertions),
    setVariable: (name: string, value: string, description?: string) =>
      store.setVariable(name, value, description),
    applyFix: (patch: Partial<CurrentRequest>) => store.patchRequest(patch),
    setDoc: (markdown: string, title?: string) => store.setDoc(markdown, title),
    notify: (message: string) => store.addNotification ? store.addNotification({ title: "Assistant IA", body: String(message), type: "info" }) : undefined,
    executeRequest: (request: Partial<CurrentRequest> | CurrentRequest) => store.executeRequest ? store.executeRequest(request) : undefined,
    runBatch: async (requests: Array<Partial<CurrentRequest>>) => {
      const results: any[] = []
      for (const req of requests) {
        if (store.executeRequest) {
          const res = await store.executeRequest(req)
          results.push(res)
        }
      }
      return results
    },
    audit: (entry: { actionType: string; detail?: any; result?: any }) => (store as any).addAiAuditEntry ? (store as any).addAiAuditEntry(entry) : undefined,
  }
}

export function useAIEngine(): UseAIEngineResult {
  const store = useRequestStore() as unknown as AIRequestStore
  const [isLoading, setIsLoading] = useState(false)
  const [lastSummary, setLastSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const buildContext = useCallback((): AIContext => {
    return {
      currentRequest: store.currentRequest ?? {
        method: "GET",
        url: "",
        headers: {},
        params: {},
      },
      lastResponse: store.lastResponse ?? null,
      environmentVariables: store.environmentVariables ?? {},
      collectionHistory: (store.collectionHistory ?? []).slice(0, 10),
      activeCollection: store.activeCollection ?? null,
    }
  }, [store])

  const runAiCall = useCallback(
    async (prompt: string, ctx: AIContext): Promise<AIResponse> => {
      const config = parseAiConfig()
      const aiRes = await callAI(prompt, config)
      await dispatchAIActions(aiRes.actions, getHandlers(store), ctx, { allowAutoApply: Boolean((store as AIRequestStore).aiAutoApply) })
      return aiRes
    },
    [store]
  )

  const analyzeAfterRequest = useCallback(
    async (ctx: AIContext): Promise<void> => {
      setError(null)
      setIsLoading(true)
      try {
        const analyzeRes = await runAiCall(PROMPTS.analyzeResponse(ctx), ctx)
        setLastSummary(analyzeRes.summary)

        if (ctx.lastResponse && ctx.lastResponse.status >= 400) {
          const debugRes = await runAiCall(PROMPTS.debugError(ctx), ctx)
          setLastSummary(debugRes.summary)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        store.addNotification?.({ title: "Erreur IA", body: String(message), type: "error" })
      } finally {
        setIsLoading(false)
      }
    },
    [runAiCall, store]
  )

  const generateTests = useCallback(
    async (ctx: AIContext): Promise<void> => {
      setError(null)
      setIsLoading(true)
      try {
        const aiRes = await runAiCall(PROMPTS.generateTests(ctx), ctx)
        setLastSummary(aiRes.summary)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        store.addNotification?.({ title: "Erreur IA", body: String(message), type: "error" })
      } finally {
        setIsLoading(false)
      }
    },
    [runAiCall, store]
  )

  const askNaturalLanguage = useCallback(
    async (description: string, ctx: AIContext): Promise<void> => {
      setError(null)
      setIsLoading(true)
      try {
        const aiRes = await runAiCall(PROMPTS.naturalLanguageToRequest(description, ctx), ctx)
        setLastSummary(aiRes.summary)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        store.notify?.(`Erreur IA: ${message}`)
      } finally {
        setIsLoading(false)
      }
    },
    [runAiCall, store]
  )

  const sendMessage = useCallback(
    async (
      message: string,
      systemPrompt: string,
      ctx: AIContext,
      configOverride?: Partial<AIConfig>
    ): Promise<string> => {
      setError(null)
      setIsLoading(true)
      try {
        const config = parseAiConfig(configOverride)
        const text = await callAIText(message, { ...config, system: systemPrompt })
        return text
      } catch (err) {
        const messageText = err instanceof Error ? err.message : String(err)
        setError(messageText)
        store.addNotification?.({ title: "Erreur IA", body: String(messageText), type: "error" })
        throw err
      } finally {
        setIsLoading(false)
      }
    },
    [store]
  )

  const generateDocs = useCallback(
    async (requests: CurrentRequest[]): Promise<void> => {
      setError(null)
      setIsLoading(true)
      try {
        const ctx = buildContext()
        const aiRes = await runAiCall(PROMPTS.generateDocs(requests), ctx)
        setLastSummary(aiRes.summary)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        setError(message)
        store.addNotification?.({ title: "Erreur IA", body: String(message), type: "error" })
      } finally {
        setIsLoading(false)
      }
    },
    [buildContext, runAiCall, store]
  )

  return {
    isLoading,
    lastSummary,
    error,
    analyzeAfterRequest,
    generateTests,
    askNaturalLanguage,
    generateDocs,
    sendMessage,
    buildContext,
  }
}
