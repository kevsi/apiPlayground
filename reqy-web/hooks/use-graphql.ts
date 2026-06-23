"use client"

import { useState, useCallback, useRef } from "react"
import {
  buildGraphQLRequest,
  parseGraphQLResponse,
  INTROSPECTION_QUERY,
  type GraphQLResponse,
} from "@/lib/graphql-utils"

export type GraphQLStatus = "idle" | "loading" | "error"

export interface GraphQLSchemaType {
  name: string
  kind: string
  description?: string
}

export interface GraphQLExecutionResult {
  status: number
  response: GraphQLResponse
  durationMs: number
}

export function useGraphQL() {
  const [query, setQuery] = useState("")
  const [variables, setVariables] = useState("{}")
  const [operationName, setOperationName] = useState("")
  const [endpoint, setEndpoint] = useState("")
  const [status, setStatus] = useState<GraphQLStatus>("idle")
  const [result, setResult] = useState<GraphQLExecutionResult | null>(null)
  const [schema, setSchema] = useState<unknown | null>(null)
  const [schemaTypes, setSchemaTypes] = useState<GraphQLSchemaType[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }, [])

  const parseVariables = useCallback((): Record<string, unknown> => {
    const trimmed = variables.trim()
    if (!trimmed || trimmed === "{}") return {}
    try {
      return JSON.parse(trimmed)
    } catch {
      return {}
    }
  }, [variables])

  const run = useCallback(
    async (customEndpoint?: string) => {
      const url = (customEndpoint ?? endpoint).trim()
      if (!url) {
        setErrorMessage("Endpoint URL is required")
        setStatus("error")
        return
      }
      if (!query.trim()) {
        setErrorMessage("Query is required")
        setStatus("error")
        return
      }

      cancel()
      const controller = new AbortController()
      abortRef.current = controller

      setStatus("loading")
      setErrorMessage(null)
      setResult(null)

      const startedAt = performance.now()
      try {
        const parsedVars = parseVariables()
        const { body } = buildGraphQLRequest(query, parsedVars, operationName)

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body,
          signal: controller.signal,
        })

        const text = await response.text()
        const parsed = parseGraphQLResponse(text)
        const durationMs = Math.round(performance.now() - startedAt)

        setResult({
          status: response.status,
          response: parsed,
          durationMs,
        })
        setStatus("idle")
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setStatus("idle")
          return
        }
        setErrorMessage(err instanceof Error ? err.message : String(err))
        setStatus("error")
      } finally {
        abortRef.current = null
      }
    },
    [endpoint, query, variables, operationName, parseVariables, cancel]
  )

  const introspect = useCallback(
    async (customEndpoint?: string) => {
      const url = (customEndpoint ?? endpoint).trim()
      if (!url) {
        setErrorMessage("Endpoint URL is required")
        setStatus("error")
        return
      }

      cancel()
      const controller = new AbortController()
      abortRef.current = controller

      setStatus("loading")
      setErrorMessage(null)
      setSchema(null)
      setSchemaTypes([])

      const startedAt = performance.now()
      try {
        const { body } = buildGraphQLRequest(INTROSPECTION_QUERY, {})

        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body,
          signal: controller.signal,
        })

        const text = await response.text()
        const parsed = parseGraphQLResponse(text)
        const durationMs = Math.round(performance.now() - startedAt)

        setResult({
          status: response.status,
          response: parsed,
          durationMs,
        })

        if (parsed.data && typeof parsed.data === "object") {
          setSchema(parsed.data)
          const types = extractSchemaTypes(parsed.data)
          setSchemaTypes(types)
        }

        setStatus("idle")
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          setStatus("idle")
          return
        }
        setErrorMessage(err instanceof Error ? err.message : String(err))
        setStatus("error")
      } finally {
        abortRef.current = null
      }
    },
    [endpoint, cancel]
  )

  const clear = useCallback(() => {
    setResult(null)
    setSchema(null)
    setSchemaTypes([])
    setErrorMessage(null)
    setStatus("idle")
  }, [])

  return {
    query,
    setQuery,
    variables,
    setVariables,
    operationName,
    setOperationName,
    endpoint,
    setEndpoint,
    status,
    result,
    schema,
    schemaTypes,
    errorMessage,
    run,
    introspect,
    clear,
    cancel,
  }
}

function extractSchemaTypes(data: unknown): GraphQLSchemaType[] {
  if (!data || typeof data !== "object") return []
  const schema = (data as Record<string, unknown>).__schema
  if (!schema || typeof schema !== "object") return []
  const types = (schema as Record<string, unknown>).types
  if (!Array.isArray(types)) return []

  return types
    .filter(
      (t): t is { name: string; kind: string; description?: string } =>
        t &&
        typeof t === "object" &&
        typeof (t as Record<string, unknown>).name === "string" &&
        typeof (t as Record<string, unknown>).kind === "string"
    )
    .map((t) => ({
      name: t.name,
      kind: t.kind,
      description: t.description,
    }))
}
