import type { RequestItem, HttpMethod, RunResult, RunnerOptions } from "./types.js"

const VALID_METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
  "GRAPHQL",
]

function getMethodsWithoutBody(method: string): boolean {
  return method === "GET" || method === "HEAD"
}

function interpolateVariables(text: string, envVars: Map<string, string>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_match, varName) => {
    const trimmed = varName.trim()
    const value = envVars.get(trimmed)
    if (value !== undefined) {
      return value
    }
    const osValue = process.env[trimmed]
    if (osValue !== undefined) {
      return osValue
    }
    return `{{${trimmed}}}`
  })
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
    const urlObj = new URL(url)
    for (const qp of request.queryParams) {
      const key = interpolateVariables(qp.key, envVars)
      const value = interpolateVariables(qp.value, envVars)
      urlObj.searchParams.append(key, value)
    }
    url = urlObj.toString()
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

  let bodyToSend: string | undefined
  if (!getMethodsWithoutBody(method) && request.body !== undefined && request.body !== null) {
    bodyToSend = interpolateVariables(request.body, envVars)
  }

  if (bodyToSend) {
    const hasContentType = Object.keys(headers).some(
      (k) => k.toLowerCase() === "content-type"
    )
    if (!hasContentType) {
      headers["Content-Type"] = "application/json"
    }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs)
  const startTime = Date.now()

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: bodyToSend,
      signal: controller.signal,
    })

    const durationMs = Date.now() - startTime

    const contentType = response.headers.get("content-type")?.split(";")[0].toLowerCase() || ""
    const isBinary = /^(image\/|video\/|audio\/|application\/pdf|application\/octet-stream)/.test(contentType)

    let body: string | undefined
    let size = 0

    if (isBinary) {
      const arrayBuffer = await response.arrayBuffer()
      size = arrayBuffer.byteLength
      body = `<Binary response: ${size} bytes>`
    } else {
      const text = await response.text()
      size = Buffer.byteLength(text, "utf8")
      body = text
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
