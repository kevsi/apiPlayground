/**
 * OpenAPI / Swagger import parser for Reqly.
 * Supports OpenAPI 3.0, 3.1 and Swagger 2.0 (JSON & YAML).
 *
 * Usage:
 *   const result = parseOpenApiSpec(fileContents)
 *   if (result.success) { /* result.collections contains Reqly collections *\/ }
 */

import type { RequestItem } from "@/lib/types"
import yaml from "js-yaml"
import { mergeImport } from "@/lib/import-merge/merge"
import type { ImportSummary } from "@/lib/import-merge/types"

// ─── Public types ───────────────────────────────────────────────────────────

export interface OpenApiParseError {
  success: false
  error: string
}

export interface OpenApiParseSuccess {
  success: true
  spec: {
    title: string
    version: string
    description?: string
    baseUrl?: string
  }
  endpoints: OpenApiEndpoint[]
  /** Suggested collections grouped by tag (one collection per tag) */
  tagGroups: TagGroup[]
  /** Total endpoint count across all tags */
  totalEndpoints: number
}

export type OpenApiParseResult = OpenApiParseSuccess | OpenApiParseError

export interface OpenApiEndpoint {
  method: string
  path: string
  name: string
  description?: string
  tags: string[]
  parameters: OpenApiParameter[]
  requestBody?: OpenApiRequestBody
  security: Record<string, string[]>[]
}

export interface OpenApiParameter {
  name: string
  in: "query" | "path" | "header" | "cookie"
  required: boolean
  description?: string
  example?: string
}

export interface OpenApiRequestBody {
  contentType: string
  example?: string
  required: boolean
  description?: string
}

export interface TagGroup {
  tag: string
  endpoints: OpenApiEndpoint[]
  collectionName: string
  description?: string
}

export interface ImportOptions {
  /** Override base URL for all endpoints */
  baseUrlOverride?: string
  /** Group endpoints by tag (one collection per tag). Default: true */
  groupByTag: boolean
  /** Collection to use when not grouping by tag */
  collectionName?: string
}

export interface CollectionImportData {
  name: string
  description?: string
  color: string
  icon: string
  requests: Array<{
    name: string
    method: string
    url: string
    endpoint: string
    headers?: Record<string, string>
    body?: string
    queryParams?: Array<{ key: string; value: string }>
  }>
}

const COLLECTION_COLORS = ["emerald", "blue", "amber", "purple", "red", "pink"] as const
const COLLECTION_ICONS = ["package", "folder", "lock", "users"] as const

// ─── Main parser ────────────────────────────────────────────────────────────

export function parseOpenApiSpec(
  contents: string,
  fileName?: string,
): OpenApiParseResult {
  try {
    const doc = parseToJson(contents, fileName)
    if (!doc || typeof doc !== "object") {
      return { success: false, error: "Le fichier ne contient pas un objet JSON/YAML valide." }
    }

    const docAny = doc as Record<string, unknown>

    // Detect spec version
    if (docAny.swagger && typeof docAny.swagger === "string") {
      return parseSwagger2(docAny)
    }
    if (docAny.openapi && typeof docAny.openapi === "string") {
      return parseOpenApi3(docAny)
    }

    return { success: false, error: "Format de spécification non reconnu. Utilisez OpenAPI 3.x ou Swagger 2.0." }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Erreur inconnue lors du parsing.",
    }
  }
}

export function convertToCollections(
  result: OpenApiParseSuccess,
  options: ImportOptions,
): CollectionImportData[] {
  const { groupByTag, baseUrlOverride } = options

  if (groupByTag) {
    return result.tagGroups.map((group, index) => ({
      name: group.collectionName,
      description: group.description ?? result.spec.description,
      color: COLLECTION_COLORS[index % COLLECTION_COLORS.length],
      icon: COLLECTION_ICONS[index % COLLECTION_ICONS.length],
      requests: group.endpoints.map((ep) => endpointToRequest(ep, baseUrlOverride ?? result.spec.baseUrl)),
    }))
  }

  // Single collection with all endpoints
  const name = options.collectionName || result.spec.title || "API Import"
  return [
    {
      name,
      description: result.spec.description,
      color: "emerald",
      icon: "package",
      requests: result.endpoints.map((ep) => endpointToRequest(ep, baseUrlOverride ?? result.spec.baseUrl)),
    },
  ]
}

// ─── Internal: OpenAPI 3.x parser ───────────────────────────────────────────

function parseOpenApi3(doc: Record<string, unknown>): OpenApiParseSuccess {
  const info = doc.info as Record<string, unknown> | undefined
  const title = (info?.title as string) || "API"
  const version = (info?.version as string) || "1.0.0"
  const description = info?.description as string | undefined

  // Extract base URL from servers
  const servers = doc.servers as Array<Record<string, unknown>> | undefined
  const baseUrl = extractBaseUrl(servers)

  const paths = doc.paths as Record<string, unknown> | undefined
  if (!paths || typeof paths !== "object") {
    return {
      success: true,
      spec: { title, version, description, baseUrl },
      endpoints: [],
      tagGroups: [],
      totalEndpoints: 0,
    }
  }

  const endpoints: OpenApiEndpoint[] = []

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue
    const pathObj = pathItem as Record<string, unknown>

    // Shared path-level parameters
    const pathParams = extractPathLevelParams(pathObj.parameters)

    for (const method of ["get", "post", "put", "patch", "delete", "options", "head"] as const) {
      const operation = pathObj[method] as Record<string, unknown> | undefined
      if (!operation || typeof operation !== "object") continue

      const endpoint = buildEndpointFromOperation(
        method.toUpperCase(),
        path,
        operation,
        pathParams,
      )
      endpoints.push(endpoint)
    }
  }

  // Group by tag
  return buildResult(title, version, description, baseUrl, endpoints)
}

// ─── Internal: Swagger 2.0 parser ───────────────────────────────────────────

function parseSwagger2(doc: Record<string, unknown>): OpenApiParseSuccess {
  const info = doc.info as Record<string, unknown> | undefined
  const title = (info?.title as string) || "API"
  const version = (info?.version as string) || "1.0.0"
  const description = info?.description as string | undefined

  // Build base URL from swagger 2.0 fields
  const host = doc.host as string | undefined
  const basePath = (doc.basePath as string) || ""
  const schemes = doc.schemes as string[] | undefined
  const scheme = schemes?.[0] || "https"
  const baseUrl = host ? `${scheme}://${host}${basePath}` : undefined

  const paths = doc.paths as Record<string, unknown> | undefined
  if (!paths || typeof paths !== "object") {
    return {
      success: true,
      spec: { title, version, description, baseUrl },
      endpoints: [],
      tagGroups: [],
      totalEndpoints: 0,
    }
  }

  const endpoints: OpenApiEndpoint[] = []

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue
    const pathObj = pathItem as Record<string, unknown>

    for (const method of ["get", "post", "put", "patch", "delete", "options", "head"] as const) {
      const operation = pathObj[method] as Record<string, unknown> | undefined
      if (!operation || typeof operation !== "object") continue

      // Swagger 2.0 parameters
      const swaggerParams = (operation.parameters as Array<Record<string, unknown>>) || []
      const parameters: OpenApiParameter[] = swaggerParams.map((p) => ({
        name: (p.name as string) || "",
        in: (p.in as "query" | "path" | "header" | "cookie") || "query",
        required: !!p.required,
        description: p.description as string | undefined,
        example: p["x-example"] as string | undefined,
      }))

      // Swagger 2.0 request body
      const bodyParams = swaggerParams.filter((p) => p.in === "body")
      let requestBody: OpenApiRequestBody | undefined
      if (bodyParams.length > 0) {
        const bodyParam = bodyParams[0]
        requestBody = {
          contentType: "application/json",
          required: !!bodyParam.required,
          description: bodyParam.description as string | undefined,
          example: bodyParam.schema
            ? extractExampleFromSchema(bodyParam.schema as Record<string, unknown>)
            : undefined,
        }
      }

      // Swagger 2.0 responses example (first 2xx response)
      const responses = operation.responses as Record<string, unknown> | undefined
      if (!requestBody && responses) {
        for (const [code, resp] of Object.entries(responses)) {
          if (code.startsWith("2") && resp && typeof resp === "object") {
            const respObj = resp as Record<string, unknown>
            const respSchema = respObj.schema as Record<string, unknown> | undefined
            if (respSchema) {
              // Don't use response schema as body, just note it
              break
            }
          }
        }
      }

      const summary = (operation.summary as string) || `${method.toUpperCase()} ${path}`
      const tags = (operation.tags as string[]) || []

      // Security from swagger
      const security = (doc.security as Array<Record<string, string[]>>) || []
      const operationSecurity = (operation.security as Array<Record<string, string[]>>) || security

      endpoints.push({
        method: method.toUpperCase(),
        path,
        name: summary,
        description: operation.description as string | undefined,
        tags,
        parameters,
        requestBody,
        security: operationSecurity,
      })
    }
  }

  return buildResult(title, version, description, baseUrl, endpoints)
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function parseToJson(contents: string, fileName?: string): unknown {
  // Try JSON first
  try {
    return JSON.parse(contents)
  } catch {
    // Not JSON, try YAML
  }

  // Try YAML
  try {
    return yaml.load(contents)
  } catch {
    throw new Error(
      "Impossible de parser le fichier. Format non supporté (attendu: JSON ou YAML).",
    )
  }
}

function extractBaseUrl(servers?: Array<Record<string, unknown>>): string | undefined {
  if (!servers || servers.length === 0) return undefined
  const first = servers[0]
  if (typeof first.url === "string") {
    // Strip trailing slash
    return first.url.replace(/\/+$/, "")
  }
  return undefined
}

function extractPathLevelParams(parameters: unknown): OpenApiParameter[] {
  if (!Array.isArray(parameters)) return []
  return parameters
    .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
    .map((p) => ({
      name: (p.name as string) || "",
      in: (p.in as "query" | "path" | "header" | "cookie") || "query",
      required: !!p.required,
      description: p.description as string | undefined,
      example: p.example as string | undefined,
    }))
}

function buildEndpointFromOperation(
  method: string,
  path: string,
  operation: Record<string, unknown>,
  pathParams: OpenApiParameter[],
): OpenApiEndpoint {
  const summary = (operation.summary as string) || `${method} ${path}`
  const operationParams = extractOperationParams(operation)
  const allParams = [...pathParams, ...operationParams]

  // Deduplicate parameters by name+in
  const seen = new Set<string>()
  const uniqueParams = allParams.filter((p) => {
    const key = `${p.in}:${p.name}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const requestBody = extractRequestBody(operation)
  const tags = (operation.tags as string[]) || []
  const security = extractSecurity(operation)

  return {
    method,
    path,
    name: summary,
    description: operation.description as string | undefined,
    tags,
    parameters: uniqueParams,
    requestBody,
    security,
  }
}

function extractOperationParams(operation: Record<string, unknown>): OpenApiParameter[] {
  const params = operation.parameters
  if (!Array.isArray(params)) return []
  return params
    .filter((p): p is Record<string, unknown> => typeof p === "object" && p !== null)
    .map((p) => ({
      name: (p.name as string) || "",
      in: (p.in as "query" | "path" | "header" | "cookie") || "query",
      required: !!p.required,
      description: p.description as string | undefined,
      example: p.example as string | undefined,
    }))
}

function extractRequestBody(operation: Record<string, unknown>): OpenApiRequestBody | undefined {
  const rb = operation.requestBody as Record<string, unknown> | undefined
  if (!rb || typeof rb !== "object") return undefined

  const content = rb.content as Record<string, unknown> | undefined
  if (!content || typeof content !== "object") return undefined

  // Pick first content type (prefer JSON)
  const contentTypes = Object.keys(content)
  const preferredType = contentTypes.find((t) => t.includes("json")) || contentTypes[0]

  if (!preferredType) return undefined

  const mediaType = content[preferredType] as Record<string, unknown> | undefined
  const schema = mediaType?.schema as Record<string, unknown> | undefined

  return {
    contentType: preferredType,
    required: !!rb.required,
    description: rb.description as string | undefined,
    example: extractExampleFromSchema(schema, mediaType),
  }
}

function extractExampleFromSchema(
  schema?: Record<string, unknown>,
  mediaType?: Record<string, unknown>,
): string | undefined {
  // Try direct example on media type
  if (mediaType?.example !== undefined) {
    return tryStringify(mediaType.example)
  }
  if (mediaType?.examples !== undefined) {
    const examples = mediaType.examples as Record<string, unknown>
    const firstKey = Object.keys(examples)[0]
    if (firstKey && examples[firstKey]) {
      const ex = examples[firstKey] as Record<string, unknown>
      if (ex.value !== undefined) return tryStringify(ex.value)
    }
  }

  // Try schema-level example
  if (!schema) return undefined
  if (schema.example !== undefined) return tryStringify(schema.example)
  if (schema.default !== undefined) return tryStringify(schema.default)

  // Generate example from schema type
  return generateExampleFromSchema(schema)
}

function generateExampleFromSchema(schema: Record<string, unknown>): string | undefined {
  const type = schema.type as string | undefined

  if (type === "object" || schema.properties) {
    const props = schema.properties as Record<string, unknown> | undefined
    if (!props) return JSON.stringify({}, null, 2)
    const example: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(props)) {
      const propSchema = val as Record<string, unknown>
      const propType = propSchema.type as string | undefined
      const propExample = propSchema.example ?? propSchema.default
      if (propExample !== undefined) {
        example[key] = propExample
      } else if (propType === "string") {
        example[key] = "string"
      } else if (propType === "integer" || propType === "number") {
        example[key] = 0
      } else if (propType === "boolean") {
        example[key] = false
      } else if (propType === "array") {
        example[key] = []
      } else {
        example[key] = null
      }
    }
    return JSON.stringify(example, null, 2)
  }

  if (type === "array") {
    const items = schema.items as Record<string, unknown> | undefined
    if (items) {
      const itemExample = generateExampleFromSchema(items)
      if (itemExample) {
        try {
          return JSON.stringify([JSON.parse(itemExample)], null, 2)
        } catch {
          return "[]"
        }
      }
    }
    return "[]"
  }

  return undefined
}

function tryStringify(value: unknown): string | undefined {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function extractSecurity(operation: Record<string, unknown>): Record<string, string[]>[] {
  return (operation.security as Record<string, string[]>[]) || []
}

function buildResult(
  title: string,
  version: string,
  description: string | undefined,
  baseUrl: string | undefined,
  endpoints: OpenApiEndpoint[],
): OpenApiParseSuccess {
  // Group by tag
  const tagMap = new Map<string, OpenApiEndpoint[]>()

  for (const ep of endpoints) {
    const tags = ep.tags.length > 0 ? ep.tags : ["General"]
    for (const tag of tags) {
      if (!tagMap.has(tag)) tagMap.set(tag, [])
      tagMap.get(tag)!.push(ep)
    }
  }

  // Assign endpoints without tags to "General" group is handled above

  const tagGroups: TagGroup[] = Array.from(tagMap.entries())
    .map(([tag, eps]) => ({
      tag,
      endpoints: eps,
      collectionName: tag,
      description: undefined,
    }))
    .sort((a, b) => a.tag.localeCompare(b.tag))

  // For the "General" group, move it to the end
  const generalIdx = tagGroups.findIndex((g) => g.tag === "General")
  if (generalIdx > 0) {
    const general = tagGroups.splice(generalIdx, 1)[0]
    tagGroups.push(general)
  }

  return {
    success: true,
    spec: { title, version, description, baseUrl },
    endpoints,
    tagGroups,
    totalEndpoints: endpoints.length,
  }
}

// ─── Endpoint → RequestItem converter ───────────────────────────────────────

function endpointToRequest(
  ep: OpenApiEndpoint,
  baseUrl?: string,
): CollectionImportData["requests"][number] {
  const headers: Record<string, string> = {}
  const queryParams: Array<{ key: string; value: string }> = []
  let url = ep.path

  // Process parameters
  for (const param of ep.parameters) {
    if (param.in === "header") {
      headers[param.name] = param.example || ""
    } else if (param.in === "query") {
      queryParams.push({ key: param.name, value: param.example || "" })
    }
    // Path params stay as {param} in the URL — user replaces them
  }

  // Build full URL
  if (baseUrl) {
    const cleanBase = baseUrl.replace(/\/+$/, "")
    url = ep.path.startsWith("/") ? `${cleanBase}${ep.path}` : `${cleanBase}/${ep.path}`
  }

  const request: CollectionImportData["requests"][number] = {
    name: ep.name,
    method: ep.method,
    url,
    endpoint: ep.path,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: ep.requestBody?.example,
    queryParams: queryParams.length > 0 ? queryParams : undefined,
  }

  return request
}

// ─── LWW merge helpers ─────────────────────────────────────────────────────

/**
 * Merge incoming OpenAPI collections against the local store using last-write-wins.
 * Returns the entities to upsert and a conflict summary for the UI banner.
 *
 * Usage:
 *   const { toUpsert, summary } = mergeImportedCollections({
 *     local: store.collections,
 *     imported: parsedCollections,
 *   })
 *   for (const c of toUpsert) store.upsertCollection(c)
 */
export function mergeImportedCollections<T extends { id: string; updatedAt?: number; name?: string }>(args: {
  local: T[]
  imported: T[]
}): { toUpsert: T[]; summary: ImportSummary } {
  return mergeImport({ local: args.local, imported: args.imported, entityType: "collection" })
}
