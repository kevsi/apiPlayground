"use client"

import { useCallback, useState } from "react"
import { callAIText, PROMPTS } from "@/lib/ai-engine"
import { loadAIProvider, loadApiKey, loadOllamaConfig, loadAiBaseUrl, loadAiModel } from "@/lib/projects-store"
import { toast } from "@/hooks/use-toast"

export interface GraphqlAIConfig {
  provider: ReturnType<typeof loadAIProvider>
  apiKey?: string
  model?: string
  openaiUrl?: string
  ollamaUrl?: string
}

export interface UseGraphqlAIResult {
  isLoading: boolean
  error: string | null
  lastSuggestion: string | null
  /** Generate a GraphQL query from a natural language description and apply it. */
  assistGraphql: (args: {
    description: string
    schema?: unknown
    currentQuery: string
    applyQuery: (query: string) => void
  }) => Promise<string | null>
  /** Auto-fix a query that produced a server-side error. */
  fixGraphqlError: (args: {
    query: string
    errorMessage: string
    applyQuery: (query: string) => void
  }) => Promise<string | null>
}

function parseAiConfig(): GraphqlAIConfig {
  const provider = loadAIProvider()
  const apiKey = loadApiKey(provider) ?? ""
  const openaiUrl = loadAiBaseUrl(provider)
  const model = loadAiModel(provider)
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
    model:
      model?.trim() ||
      (provider === "ollama" ? ollamaConfig.model : undefined),
    openaiUrl: provider === "openai" ? openaiUrl?.trim() || undefined : undefined,
    ollamaUrl:
      provider === "ollama"
        ? `http://${ollamaConfig.host || "127.0.0.1"}:${ollamaConfig.port ?? 11434}`
        : undefined,
  }
}

/** Strip markdown code fences and surrounding prose from an LLM reply. */
function extractGraphqlReply(raw: string): string {
  let text = raw.trim()
  // Drop ```graphql ... ``` fences if present.
  const fence = text.match(/```(?:graphql|gql)?\s*([\s\S]*?)```/i)
  if (fence) text = fence[1].trim()
  // If the model returned JSON, pull the "query" / "queryString" field if present.
  const json = text.match(/\{[\s\S]*\}/)
  if (json) {
    try {
      const parsed = JSON.parse(json[0])
      const candidate =
        parsed.query ??
        parsed.graphql ??
        parsed.queryString ??
        parsed.result ??
        parsed.text
      if (typeof candidate === "string" && candidate.trim().includes("{")) {
        return candidate.trim()
      }
    } catch {
      // not JSON, fall through
    }
  }
  return text
}

export function useGraphqlAI(): UseGraphqlAIResult {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSuggestion, setLastSuggestion] = useState<string | null>(null)

  const assistGraphql = useCallback(
    async ({
      description,
      schema,
      applyQuery,
    }: {
      description: string
      schema?: unknown
      currentQuery: string
      applyQuery: (query: string) => void
    }) => {
      setError(null)
      setIsLoading(true)
      try {
        const config = parseAiConfig()
        const schemaHint = schema ? JSON.stringify(schema) : undefined
        const prompt = PROMPTS.graphqlFromDescription(description, schemaHint)
        const raw = await callAIText(prompt, config)
        const suggestion = extractGraphqlReply(raw)
        if (!suggestion) throw new Error("Empty AI response")
        applyQuery(suggestion)
        setLastSuggestion(suggestion)
        toast({
          title: "Query generated",
          description: "Applied to the active tab.",
        })
        return suggestion
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        setError(message)
        toast({
          title: "AI assist failed",
          description: message,
          variant: "destructive",
        })
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  const fixGraphqlError = useCallback(
    async ({
      query,
      errorMessage,
      applyQuery,
    }: {
      query: string
      errorMessage: string
      applyQuery: (query: string) => void
    }) => {
      setError(null)
      setIsLoading(true)
      try {
        const config = parseAiConfig()
        const prompt = PROMPTS.graphqlFixFromError(query, errorMessage)
        const raw = await callAIText(prompt, config)
        const suggestion = extractGraphqlReply(raw)
        if (!suggestion) throw new Error("Empty AI response")
        applyQuery(suggestion)
        setLastSuggestion(suggestion)
        return suggestion
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        setError(message)
        toast({
          title: "AI fix failed",
          description: message,
          variant: "destructive",
        })
        return null
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  return {
    isLoading,
    error,
    lastSuggestion,
    assistGraphql,
    fixGraphqlError,
  }
}
