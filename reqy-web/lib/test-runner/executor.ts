import type { RequestResponse } from "./types"
import { invokeTauriFetch, isTauriAvailable } from "@/lib/tauri"
import { parseJsonSafe } from "@/lib/utils"

export interface RunnerExecutorOptions {
  workspaceId?: string | null
  /** Use direct fetch (server-side API routes — no CORS). */
  serverSide?: boolean
}

function parseResponseBody(body: string, headers: Record<string, string>): unknown {
  const contentType = (headers["content-type"] || headers["Content-Type"] || "").toLowerCase()
  if (contentType.includes("json") || body.trimStart().startsWith("{") || body.trimStart().startsWith("[")) {
    try {
      return JSON.parse(body)
    } catch {
      return body
    }
  }
  return body
}

async function executeViaProxy(
  req: { method: string; url: string; headers: Record<string, string>; body?: unknown },
  workspaceId: string | null | undefined,
): Promise<RequestResponse> {
  const started = Date.now()
  const proxyResponse = await fetch("/api/proxy", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(workspaceId ? { "x-workspace-id": workspaceId } : {}),
    },
    body: JSON.stringify({
      url: req.url,
      method: req.method,
      headers: req.headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
      workspaceId,
    }),
  })

  const proxyResult = await parseJsonSafe(proxyResponse)
  const responseTimeMs = proxyResult.durationMs ?? Date.now() - started

  if (!proxyResponse.ok) {
    throw new Error(proxyResult.error || proxyResponse.statusText || "Proxy request failed")
  }

  const responseHeaders = (proxyResult.headers || {}) as Record<string, string>
  const rawBody = typeof proxyResult.body === "string" ? proxyResult.body : String(proxyResult.body ?? "")

  return {
    statusCode: proxyResult.status ?? proxyResponse.status,
    responseTimeMs,
    body: parseResponseBody(rawBody, responseHeaders),
    headers: responseHeaders,
  }
}

async function executeViaTauri(
  req: { method: string; url: string; headers: Record<string, string>; body?: unknown },
): Promise<RequestResponse> {
  const bodyStr =
    req.body !== undefined && req.body !== null
      ? typeof req.body === "string"
        ? req.body
        : JSON.stringify(req.body)
      : undefined

  const result = await invokeTauriFetch(req.method, req.url, req.headers, bodyStr)

  return {
    statusCode: result.status,
    responseTimeMs: result.durationMs,
    body: parseResponseBody(result.body, result.headers),
    headers: result.headers,
  }
}

async function executeDirect(
  req: { method: string; url: string; headers: Record<string, string>; body?: unknown },
): Promise<RequestResponse> {
  const started = Date.now()
  const res = await fetch(req.url, {
    method: req.method,
    headers: req.headers,
    body: req.body as BodyInit | undefined,
  })
  const text = await res.text()
  const headers = Object.fromEntries(res.headers.entries())
  return {
    statusCode: res.status,
    responseTimeMs: Date.now() - started,
    body: parseResponseBody(text, headers),
    headers,
  }
}

export function createRunnerExecutor(options: RunnerExecutorOptions = {}) {
  return async (req: {
    method: string
    url: string
    headers: Record<string, string>
    body?: unknown
  }): Promise<RequestResponse> => {
    if (options.serverSide) {
      return executeDirect(req)
    }
    if (isTauriAvailable()) {
      return executeViaTauri(req)
    }
    return executeViaProxy(req, options.workspaceId)
  }
}
