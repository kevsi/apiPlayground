import type { HttpMethod, RequestTestAssertion, TestResult } from "@/lib/types"
export type { HttpMethod, RequestTestAssertion, TestResult } from "@/lib/types"
import type { Assertion } from "@/lib/test-runner/types"
import { interpolate, replaceLocalhostPort, parseJsonSafe } from "@/lib/utils"
import { invokeTauriFetch } from "@/lib/tauri"
export type BodyType = "json" | "form-data" | "x-www-form" | "raw" | "binary"
export type AuthType = "none" | "bearer" | "basic" | "api-key" | "oauth2"

export interface QueryParam {
  key: string
  value: string
  enabled?: boolean
}

export interface Header {
  key: string
  value: string
  enabled?: boolean
}

export interface RequestTab {
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
  isSaved: boolean
  savedRequestId?: string
  responseStatus?: number
  responseTime?: number
  responseSize?: string
  responseBody?: string
  responseData?: string | Blob
  responseHeaders?: Record<string, string>
  assertions?: RequestTestAssertion[]
  runnerAssertions?: Assertion[]
  preRequestScript?: string
  postResponseScript?: string
  protocol?: "rest" | "graphql"
  graphql?: {
    query: string
    variables: string
    operationName?: string
  }
  testResults?: TestResult[]
  /**
   * Key identifying the dataset row to use for data-driven execution.
   * Loaded from RequestItem.datasetKey via buildTabFromRequest; persisted
   * back via the save handlers. Optional and ignored by the live editor.
   */
  datasetKey?: string
}

export const formatSize = (size: number) => {
  if (size < 1024) return `${size} B`
  return `${Math.round(size / 1024)} KB`
}

export const sanitizeUrl = (url: string) => {
  let sanitized = url.trim()
  sanitized = sanitized.replace(/%20/gi, " ")
  sanitized = sanitized.replace(/^(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)(?:\s+|%20)+/i, "")
  sanitized = sanitized.replace(/^(https?:)\/(?!\/)/i, "$1//")
  sanitized = sanitized.replace(/^(https?:)\/{3,}(\/)?/i, "$1//")
  return sanitized
}

export const normalizeUrl = (url: string) => {
  const sanitizedUrl = sanitizeUrl(url)

  if (sanitizedUrl.startsWith("//")) {
    return `https:${sanitizedUrl}`
  }

  if (!/^https?:\/\//i.test(sanitizedUrl)) {
    const localhostLike = /^(localhost|127(?:\.[0-9]{1,3}){0,3}|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(sanitizedUrl)
    const ipLike = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}(?::\d+)?(?:[/?#]|$)/.test(sanitizedUrl)
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

export const buildUrl = (url: string, queryParams: QueryParam[]) => {
  const normalizedUrl = normalizeUrl(url)

  try {
    const finalUrl = new URL(normalizedUrl)
    queryParams.forEach((param) => {
      // By default queryParams are enabled if they don't have an `enabled` flag (or if we didn't add it yet)
      // but in tabs-manager it checks param.key.trim() and param.value.trim()
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

export const buildHeaders = (headers: Header[], authType: AuthType, authToken: string) => {
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

export interface ExecuteRequestContext {
  tab: RequestTab
  allVars: { key: string; value: string; enabled: boolean }[]
  activeProjectPort: number
  activeProject: boolean
  nativeMode: boolean
  activeWorkspaceId: string | null
}

export const buildRequestPayload = (context: ExecuteRequestContext) => {
  const { tab, allVars, activeProjectPort, activeProject } = context
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

export const executeRequest = async (context: ExecuteRequestContext) => {
  const { tab, nativeMode, activeWorkspaceId } = context
  const { finalUrl, finalBody, headers } = buildRequestPayload(context)

  const startedAt = performance.now()
  let responseBody: string
  let responseData: string | Blob
  let responseHeaders: Record<string, string> = {}
  let responseStatus: number | undefined
  let responseSize = "0 B"
  let responseTime: number | undefined

  try {
    if (nativeMode) {
      const result = await invokeTauriFetch(
        tab.method, 
        finalUrl, 
        headers, 
        (tab.method !== "GET" && tab.method !== "HEAD") ? finalBody : undefined
      )
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
          body: (tab.method !== "GET" && tab.method !== "HEAD") ? finalBody : undefined,
          workspaceId: activeWorkspaceId,
        }),
      })

      const proxyResult = await parseJsonSafe(proxyResponse)
      responseStatus = proxyResult.status ?? proxyResponse.status ?? 0
      responseHeaders = proxyResult.headers || {}

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
