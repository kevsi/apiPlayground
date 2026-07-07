import type { Collection, RequestItem } from "./types.js"

export interface OpenApiImportRequest {
  name: string
  method: string
  url: string
  endpoint: string
  headers?: Record<string, string>
  body?: string
  bodyType?: RequestItem["bodyType"]
  authType?: RequestItem["authType"]
  authToken?: string
  queryParams?: Array<{ key: string; value: string }>
}

export interface OpenApiImportedCollection {
  name: string
  description?: string
  requests: OpenApiImportRequest[]
}

export type OpenApiImportResult =
  | {
      success: true
      title: string
      version: string
      baseUrl?: string
      collections: OpenApiImportedCollection[]
    }
  | {
      success: false
      error: string
    }

function parseYamlValue(value: string): unknown {
  const trimmed = value.trim()
  if (trimmed === "" || trimmed === "null" || trimmed === "~") return null
  if (trimmed === "true") return true
  if (trimmed === "false") return false
  if (/^[-+]?\d+$/.test(trimmed)) return Number(trimmed)
  if (/^[-+]?\d+\.\d+$/.test(trimmed)) return Number(trimmed)
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function yamlToJson(contents: string): unknown {
  const lines = contents.split("\n")
  const root: Record<string, unknown> = {}
  const stack: Array<{ obj: Record<string, unknown>; indent: number; list?: unknown[] }> = [{ obj: root, indent: -1 }]

  for (let rawLine of lines) {
    const line = rawLine.replace(/#.*/, "")
    if (!line.trim()) continue

    const indent = line.length - line.trimStart().length
    const trimmed = line.trim()

    while (stack.length > 1 && indent <= stack[stack.length - 1]!.indent) {
      stack.pop()
    }

    const top = stack[stack.length - 1]!

    if (trimmed.startsWith("- ")) {
      const valueText = trimmed.slice(2).trim()
      if (!top.list) top.list = []
      const colonIdx = valueText.indexOf(":")
      if (colonIdx !== -1 && valueText.slice(0, colonIdx).indexOf(" ") === -1) {
        const item: Record<string, unknown> = {}
        top.list.push(item)
        const key = valueText.slice(0, colonIdx).trim()
        const rest = valueText.slice(colonIdx + 1).trim()
        item[key] = parseYamlValue(rest)
        stack.push({ obj: item, indent })
      } else {
        top.list.push(parseYamlValue(valueText))
      }
    } else {
      const colonIdx = trimmed.indexOf(":")
      if (colonIdx === -1) continue
      const key = trimmed.slice(0, colonIdx).trim()
      const valueText = trimmed.slice(colonIdx + 1).trim()
      if (valueText === "") {
        const child: Record<string, unknown> = {}
        top.obj[key] = child
        stack.push({ obj: child, indent })
      } else {
        top.obj[key] = parseYamlValue(valueText)
      }
    }
  }

  return root
}

function parseSpec(contents: string): Record<string, unknown> | null {
  try {
    return JSON.parse(contents) as Record<string, unknown>
  } catch {
    try {
      const doc = yamlToJson(contents)
      if (doc && typeof doc === "object") return doc as Record<string, unknown>
    } catch {
      return null
    }
  }
  return null
}

function extractBaseUrl(doc: Record<string, unknown>): string | undefined {
  const servers = doc.servers as Array<Record<string, unknown>> | undefined
  if (servers && servers.length > 0 && typeof servers[0]?.url === "string") {
    return servers[0].url.replace(/\/+$/, "")
  }
  const host = doc.host as string | undefined
  const basePath = (doc.basePath as string) || ""
  const schemes = doc.schemes as string[] | undefined
  if (host) {
    return `${schemes?.[0] ?? "https"}://${host}${basePath}`.replace(/\/+$/, "")
  }
  return undefined
}

function extractBody(operation: Record<string, unknown>): { body?: string; contentType?: string } {
  const requestBody = operation.requestBody as Record<string, unknown> | undefined
  const content = requestBody?.content as Record<string, unknown> | undefined
  if (!content) return {}
  for (const [ct, media] of Object.entries(content)) {
    const example = (media as Record<string, unknown>)?.example
    if (example !== undefined) {
      return { body: JSON.stringify(example), contentType: ct }
    }
    const schema = (media as Record<string, unknown>)?.schema as Record<string, unknown> | undefined
    if (schema?.example !== undefined) {
      return { body: JSON.stringify(schema.example), contentType: ct }
    }
  }
  return {}
}

function endpointToRequest(
  method: string,
  path: string,
  operation: Record<string, unknown>,
  baseUrl: string,
): OpenApiImportRequest {
  const parameters = (operation.parameters as Array<Record<string, unknown>>) ?? []
  const queryParams: Array<{ key: string; value: string }> = []
  const headers: Record<string, string> = {}
  let urlPath = path

  for (const param of parameters) {
    if (param.in === "query") {
      queryParams.push({ key: String(param.name), value: String(param.example ?? `{{${String(param.name)}}}`) })
    } else if (param.in === "path") {
      urlPath = urlPath.replace(`{${String(param.name)}}`, `{{${String(param.name)}}}`)
    } else if (param.in === "header") {
      headers[String(param.name)] = String(param.example ?? `{{${String(param.name)}}}`)
    }
  }

  const queryString = queryParams.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join("&")
  const url = `${baseUrl}${urlPath}${queryString ? `?${queryString}` : ""}`

  const { body, contentType } = extractBody(operation)
  if (contentType) headers["Content-Type"] = contentType

  return {
    name: String(operation.summary ?? `${method} ${path}`),
    method: method.toUpperCase(),
    url,
    endpoint: urlPath,
    headers,
    body,
    bodyType: body ? "raw" : undefined,
  }
}

export function importFromOpenApi(contents: string): OpenApiImportResult {
  const doc = parseSpec(contents)
  if (!doc) return { success: false, error: "Unable to parse OpenAPI spec (expected JSON or YAML)" }

  const info = doc.info as Record<string, unknown> | undefined
  const title = String(info?.title ?? "API")
  const version = String(info?.version ?? "1.0.0")
  const description = info?.description as string | undefined
  const baseUrl = extractBaseUrl(doc) ?? "https://api.example.com"

  const paths = doc.paths as Record<string, unknown> | undefined
  if (!paths || typeof paths !== "object") {
    return { success: true, title, version, baseUrl, collections: [] }
  }

  const requests: OpenApiImportRequest[] = []
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue
    const pathObj = pathItem as Record<string, unknown>
    for (const method of ["get", "post", "put", "patch", "delete", "head", "options"]) {
      const operation = pathObj[method] as Record<string, unknown> | undefined
      if (!operation || typeof operation !== "object") continue
      requests.push(endpointToRequest(method, path, operation, baseUrl))
    }
  }

  const collections: OpenApiImportedCollection[] = []
  const tagMap = new Map<string, OpenApiImportRequest[]>()
  for (const req of requests) {
    tagMap.set("Default", [...(tagMap.get("Default") ?? []), req])
  }
  for (const [, reqs] of tagMap) {
    collections.push({ name: title, description, requests: reqs })
  }

  return { success: true, title, version, baseUrl, collections }
}

export function exportToOpenApi(collections: Collection[]): string {
  const paths: Record<string, Record<string, unknown>> = {}

  for (const collection of collections) {
    for (const request of collection.requests) {
      const rawPath = request.endpoint?.trim() || request.url?.trim() || "/"
      let path = rawPath
      try {
        const url = new URL(rawPath)
        path = url.pathname
      } catch {
        if (!path.startsWith("/")) path = `/${path}`
      }
      const method = request.method.toLowerCase()
      if (!paths[path]) paths[path] = {}

      const parameters = [
        ...(request.queryParams ?? [])
          .filter((p) => p.key.trim())
          .map((p) => ({
            name: p.key.trim(),
            in: "query",
            required: false,
            schema: { type: "string" },
            example: p.value.trim() || undefined,
          })),
        ...Object.entries(request.headers ?? {})
          .filter(([key]) => key.trim())
          .map(([key, value]) => ({
            name: key.trim(),
            in: "header",
            required: false,
            schema: { type: "string" },
            example: value || undefined,
          })),
      ]

      const requestBody = request.body
        ? {
            required: true,
            content: {
              "application/json": {
                schema: { type: "object" },
                example: (() => {
                  try {
                    return JSON.parse(request.body)
                  } catch {
                    return request.body
                  }
                })(),
              },
            },
          }
        : undefined

      paths[path][method] = {
        operationId: `${collection.name}_${request.name}_${request.method}`.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, ""),
        tags: [collection.name],
        summary: request.name || `${request.method} ${path}`,
        parameters,
        ...(requestBody ? { requestBody } : {}),
        responses: {
          "200": {
            description: "Successful response",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
      }
    }
  }

  const spec = {
    openapi: "3.0.0",
    info: { title: "Exported from Reqly", version: "1.0.0" },
    paths,
  }

  return JSON.stringify(spec, null, 2)
}
