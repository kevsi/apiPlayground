import crypto from "node:crypto"
import { evaluateAssertions, runResultToAssertionContext } from "./assertions.js"
import type { RequestItem, HttpMethod, RunResult, RunnerOptions, AssertionResult } from "./types.js"

export const VALID_METHODS: ReadonlyArray<string> = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
]

export const VALID_GRAPHQL_METHOD = "GRAPHQL" as const

const VALID_BODY_TYPES: ReadonlyArray<string> = ["json", "form-data", "x-www-form", "raw", "binary"]
const VALID_AUTH_TYPES: ReadonlyArray<string> = ["none", "bearer", "basic", "api-key", "oauth2"]

const DEFAULT_MAX_RESPONSE_SIZE = 10 * 1024 * 1024 // 10 MB

function getMethodsWithoutBody(method: string): boolean {
  return method === "GET" || method === "HEAD"
}

function isPrivateIp(hostname: string): boolean {
  // Strip IPv6 brackets
  const h = hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase()

  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "0:0:0:0:0:0:0:1") {
    return true
  }

  // Cloud metadata endpoints
  if (h === "169.254.169.254") {
    return true
  }

  // RFC 1918 private ranges
  const parts = h.split(".").map(Number)
  if (parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    const [a, b, c] = parts
    if (a === 10) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 127) return true // catch-all loopback IPv4
    if (a === 169 && b === 254) return true // link-local
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true // IETF protocol / test
    if (a === 198 && (b === 18 || b === 19)) return true
    if (a >= 224) return true // multicast/reserved
  }

  return false
}

export function isUrlAllowed(url: string, allowLocalHosts?: boolean): { allowed: boolean; reason?: string } {
  if (allowLocalHosts) {
    return { allowed: true }
  }

  try {
    const parsed = new URL(url)
    const protocol = parsed.protocol.toLowerCase()
    if (protocol !== "http:" && protocol !== "https:") {
      return { allowed: false, reason: `Unsupported protocol: ${parsed.protocol}` }
    }
    if (isPrivateIp(parsed.hostname)) {
      return { allowed: false, reason: `Private/local address blocked: ${parsed.hostname}` }
    }
    return { allowed: true }
  } catch {
    return { allowed: false, reason: "Invalid URL" }
  }
}

function interpolateVariables(text: string, envVars: Map<string, string>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_match, varName) => {
    const trimmed = varName.trim()
    const value = envVars.get(trimmed)
    return value !== undefined ? value : `{{${trimmed}}}`
  })
}

export function isValidMethod(method: string): method is HttpMethod {
  return VALID_METHODS.includes(method)
}

export function isValidBodyType(t: string | undefined): t is RequestItem["bodyType"] {
  return t !== undefined && VALID_BODY_TYPES.includes(t)
}

export function isValidAuthType(t: string | undefined): t is RequestItem["authType"] {
  return t !== undefined && VALID_AUTH_TYPES.includes(t)
}

export function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

function buildEnvVarMap(environments: Array<{ name: string; variables: Array<{ key: string; value: string; enabled: boolean }> }>, envName?: string): Map<string, string> {
  const map = new Map<string, string>()

  if (envName && environments) {
    const env = environments.find(
      (e) => e.name.toLowerCase() === envName.toLowerCase()
    )
    if (env && env.variables) {
      for (const v of env.variables) {
        if (v.enabled) {
          map.set(v.key, v.value)
        }
      }
    }
  }

  return map
}

function buildUrl(request: RequestItem, envVars: Map<string, string>): string {
  let url = interpolateVariables(request.url, envVars)

  if (request.queryParams && request.queryParams.length > 0) {
    try {
      const urlObj = new URL(url)
      for (const qp of request.queryParams) {
        const key = interpolateVariables(qp.key, envVars)
        const value = interpolateVariables(qp.value, envVars)
        urlObj.searchParams.append(key, value)
      }
      url = urlObj.toString()
    } catch {
      // URL is relative or invalid — skip query param appending
    }
  }

  return url
}

function buildHeaders(request: RequestItem, envVars: Map<string, string>): Record<string, string> {
  const headers: Record<string, string> = {}

  if (request.headers) {
    for (const [key, value] of Object.entries(request.headers)) {
      headers[key] = interpolateVariables(value, envVars)
    }
  }

  if (request.authType && request.authToken) {
    const token = interpolateVariables(request.authToken, envVars)
    switch (request.authType) {
      case "bearer":
      case "oauth2":
        headers["Authorization"] = `Bearer ${token}`
        break
      case "basic":
        headers["Authorization"] = `Basic ${token}`
        break
      case "api-key":
        headers["x-api-key"] = token
        break
    }
  }

  return headers
}

export async function executeRequest(
  request: RequestItem,
  options: RunnerOptions,
  environments?: Array<{ name: string; variables: Array<{ key: string; value: string; enabled: boolean }> }>
): Promise<RunResult> {
  const envVars = buildEnvVarMap(environments ?? [], options.envName)
  const method = request.method
  const url = buildUrl(request, envVars)
  const headers = buildHeaders(request, envVars)

  if (method === VALID_GRAPHQL_METHOD) {
    const query = request.graphql?.query ?? request.body ?? ""
    return executeGraphQL(url, query, request.graphql?.variables, request.graphql?.operationName, headers, options)
  }

  if (!VALID_METHODS.includes(method)) {
    return {
      name: request.name,
      method,
      url,
      status: 0,
      statusText: "Invalid Method",
      durationMs: 0,
      size: 0,
      passed: false,
      error: `Invalid HTTP method: ${method}`,
    }
  }

  const urlCheck = isUrlAllowed(url, options.allowLocalHosts)
  if (!urlCheck.allowed) {
    return {
      name: request.name,
      method,
      url,
      status: 0,
      statusText: "Blocked",
      durationMs: 0,
      size: 0,
      passed: false,
      error: urlCheck.reason,
    }
  }

  let bodyToSend: string | undefined
  if (!getMethodsWithoutBody(method) && request.body !== undefined && request.body !== null) {
    bodyToSend = interpolateVariables(request.body, envVars)
  }

  if (bodyToSend) {
    const hasContentType = Object.keys(headers).some(
      (k) => k.toLowerCase() === "content-type"
    )
    if (!hasContentType && (!request.bodyType || request.bodyType === "json")) {
      headers["Content-Type"] = "application/json"
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs)
  const startTime = Date.now()
  const maxSize = options.maxResponseSize ?? DEFAULT_MAX_RESPONSE_SIZE

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: bodyToSend,
      signal: controller.signal,
    })

    const durationMs = Date.now() - startTime

    const contentLength = response.headers.get("content-length")
    if (contentLength && Number(contentLength) > maxSize) {
      controller.abort()
      return {
        name: request.name,
        method,
        url,
        status: 0,
        statusText: "Blocked",
        durationMs,
        size: Number(contentLength),
        passed: false,
        error: `Response exceeds maximum allowed size of ${maxSize} bytes`,
      }
    }

    const contentType = response.headers.get("content-type")?.split(";")[0].toLowerCase() || ""
    const isBinary = /^(image\/|video\/|audio\/|application\/pdf|application\/octet-stream)/.test(contentType)

    let body: string | undefined
    let size = 0

    if (isBinary) {
      const arrayBuffer = await response.arrayBuffer()
      size = arrayBuffer.byteLength
      body = size > maxSize
        ? `<Binary response too large: ${size} bytes>`
        : `<Binary response: ${size} bytes>`
      if (size > maxSize) {
        return {
          name: request.name,
          method,
          url,
          status: 0,
          statusText: "Blocked",
          durationMs,
          size,
          passed: false,
          error: `Binary response exceeds maximum allowed size of ${maxSize} bytes`,
        }
      }
    } else {
      const text = await response.text()
      size = Buffer.byteLength(text, "utf8")
      body = size > maxSize ? text.slice(0, maxSize) : text
      if (size > maxSize) {
        return {
          name: request.name,
          method,
          url,
          status: 0,
          statusText: "Blocked",
          durationMs,
          size,
          passed: false,
          error: `Response exceeds maximum allowed size of ${maxSize} bytes`,
        }
      }
    }

    const passed = response.status < 400

    return {
      name: request.name,
      method,
      url,
      status: response.status,
      statusText: response.statusText,
      durationMs,
      size,
      passed,
      body,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const message = error instanceof Error ? error.message : String(error)
    const isTimeout = error instanceof DOMException && error.name === "AbortError"

    return {
      name: request.name,
      method,
      url,
      status: 0,
      statusText: isTimeout ? "Timeout" : "Error",
      durationMs,
      size: 0,
      passed: false,
      error: isTimeout ? `Request timed out after ${options.timeoutMs}ms` : message,
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function executeGraphQL(
  url: string,
  query: string,
  variables?: Record<string, unknown>,
  operationName?: string,
  headers?: Record<string, string>,
  options: RunnerOptions = { timeoutMs: 30000 }
): Promise<RunResult> {
  const urlCheck = isUrlAllowed(url, options.allowLocalHosts)
  if (!urlCheck.allowed) {
    return {
      name: "GraphQL",
      method: "GRAPHQL" as HttpMethod,
      url,
      status: 0,
      statusText: "Blocked",
      durationMs: 0,
      size: 0,
      passed: false,
      error: urlCheck.reason,
    }
  }

  const body = JSON.stringify({
    query,
    variables: variables ?? {},
    operationName: operationName ?? undefined,
  })

  const reqHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers ?? {}),
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs)
  const startTime = Date.now()
  const maxSize = options.maxResponseSize ?? DEFAULT_MAX_RESPONSE_SIZE

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: reqHeaders,
      body,
      signal: controller.signal,
    })

    const durationMs = Date.now() - startTime
    const text = await response.text()
    const size = Buffer.byteLength(text, "utf8")
    const passed = response.status < 400

    if (size > maxSize) {
      return {
        name: "GraphQL",
        method: "GRAPHQL" as HttpMethod,
        url,
        status: 0,
        statusText: "Blocked",
        durationMs,
        size,
        passed: false,
        error: `Response exceeds maximum allowed size of ${maxSize} bytes`,
      }
    }

    return {
      name: query.split(/\s+/).slice(0, 3).join(" ") || "GraphQL",
      method: "GRAPHQL" as HttpMethod,
      url,
      status: response.status,
      statusText: response.statusText,
      durationMs,
      size,
      passed,
      body: text,
    }
  } catch (error) {
    const durationMs = Date.now() - startTime
    const message = error instanceof Error ? error.message : String(error)
    const isTimeout = error instanceof DOMException && error.name === "AbortError"
    return {
      name: "GraphQL",
      method: "GRAPHQL" as HttpMethod,
      url,
      status: 0,
      statusText: isTimeout ? "Timeout" : "Error",
      durationMs,
      size: 0,
      passed: false,
      error: isTimeout ? `Request timed out after ${options.timeoutMs}ms` : message,
    }
  } finally {
    clearTimeout(timeout)
  }
}

export interface RunResultWithAssertions extends RunResult {
  assertionResults?: AssertionResult[]
  assertionsPassed?: boolean
}

export async function executeRequestWithAssertions(
  request: RequestItem,
  options: RunnerOptions,
  environments?: Array<{ name: string; variables: Array<{ key: string; value: string; enabled: boolean }> }>
): Promise<RunResultWithAssertions> {
  const result = await executeRequest(request, options, environments)
  const assertions = request.runnerAssertions?.filter((a) => a.enabled !== false)
  if (!assertions || assertions.length === 0) {
    return result
  }

  const assertionResults = evaluateAssertions(assertions, runResultToAssertionContext(result))
  const assertionsPassed = assertionResults.every((r) => r.passed)

  return {
    ...result,
    passed: result.passed && assertionsPassed,
    assertionResults,
    assertionsPassed,
  }
}

export interface ValidationIssue {
  field: string
  severity: "error" | "warning"
  message: string
}

export function validateRequest(request: Partial<RequestItem>): ValidationIssue[] {
  const issues: ValidationIssue[] = []

  if (!request.name || !request.name.trim()) {
    issues.push({ field: "name", severity: "error", message: "Request name is required" })
  }

  if (!request.url || !request.url.trim()) {
    issues.push({ field: "url", severity: "error", message: "Request URL is required" })
  } else {
    try {
      new URL(request.url)
    } catch {
      issues.push({ field: "url", severity: "error", message: `Invalid URL: ${request.url}` })
    }
  }

  if (request.method && !VALID_METHODS.includes(request.method)) {
    issues.push({ field: "method", severity: "error", message: `Invalid HTTP method: ${request.method}` })
  }

  if (request.body && request.bodyType === "json") {
    try {
      JSON.parse(request.body)
    } catch {
      issues.push({ field: "body", severity: "warning", message: "Body is marked as JSON but is not valid JSON" })
    }
  }

  if (request.authType && request.authType !== "none" && !request.authToken) {
    issues.push({ field: "authToken", severity: "warning", message: `Auth type is ${request.authType} but no token provided` })
  }

  return issues
}
