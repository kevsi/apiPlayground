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
    /** Global security requirements (e.g. `[{ bearerAuth: [] }]`) */
    rootSecurity?: Record<string, string[]>[]
    /** Defined security schemes from `components.securitySchemes` / `securityDefinitions` */
    securitySchemes?: Record<string, unknown>
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
  /** Global security requirements inherited from the spec root */
  rootSecurity?: Record<string, string[]>[]
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
    bodyType?: "json" | "form-data" | "x-www-form" | "raw" | "binary"
    authType?: "none" | "bearer" | "basic" | "api-key" | "oauth2"
    authToken?: string
    queryParams?: Array<{ key: string; value: string }>
    assertions?: RequestItem["assertions"]
    runnerAssertions?: RequestItem["runnerAssertions"]
    preRequestScript?: string
    postResponseScript?: string
  }>
}

interface EndpointConversionContext {
  baseUrl?: string
  securitySchemes?: Record<string, unknown>
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
  const context: EndpointConversionContext = {
    baseUrl: baseUrlOverride ?? result.spec.baseUrl,
    securitySchemes: result.spec.securitySchemes,
  }

  if (groupByTag) {
    return result.tagGroups.map((group, index) => ({
      name: group.collectionName,
      description: group.description ?? result.spec.description,
      color: COLLECTION_COLORS[index % COLLECTION_COLORS.length],
      icon: COLLECTION_ICONS[index % COLLECTION_ICONS.length],
      requests: group.endpoints.map((ep) => endpointToRequest(ep, context)),
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
      requests: result.endpoints.map((ep) => endpointToRequest(ep, context)),
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

  // Build $ref resolution map from components/schemas
  const components = doc.components as Record<string, unknown> | undefined
  const schemas = (components?.schemas ?? {}) as Record<string, unknown>
  const securitySchemes = (components?.securitySchemes ?? {}) as Record<string, unknown>
  const rootSecurity = (doc.security as Array<Record<string, string[]>>) || []

  const endpoints: OpenApiEndpoint[] = []

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue
    const pathObj = pathItem as Record<string, unknown>

    // Shared path-level parameters
    const pathParams = extractPathLevelParams(pathObj.parameters)
    const pathSecurity = pathObj.security as Array<Record<string, string[]>> | undefined

    for (const method of ["get", "post", "put", "patch", "delete", "options", "head"] as const) {
      const operation = pathObj[method] as Record<string, unknown> | undefined
      if (!operation || typeof operation !== "object") continue

      const endpoint = buildEndpointFromOperation(
        method.toUpperCase(),
        path,
        operation,
        pathParams,
        schemas,
        pathSecurity ?? rootSecurity,
      )
      endpoints.push(endpoint)
    }
  }

  // Group by tag
  return buildResult(title, version, description, baseUrl, endpoints, rootSecurity, securitySchemes)
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

  // Build $ref resolution map from definitions (Swagger 2.0)
  const definitions = (doc.definitions ?? {}) as Record<string, unknown>
  const securityDefinitions = (doc.securityDefinitions ?? {}) as Record<string, unknown>
  const rootSecurity = (doc.security as Array<Record<string, string[]>>) || []

  const endpoints: OpenApiEndpoint[] = []

  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== "object") continue
    const pathObj = pathItem as Record<string, unknown>
    const pathSecurity = pathObj.security as Array<Record<string, string[]>> | undefined

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
            ? extractExampleFromSchema(bodyParam.schema as Record<string, unknown>, undefined, definitions)
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

      // Security from swagger: operation-level overrides root-level
      const operationSecurity = (operation.security as Array<Record<string, string[]>>) || (pathSecurity ?? rootSecurity)

      endpoints.push({
        method: method.toUpperCase(),
        path,
        name: summary,
        description: operation.description as string | undefined,
        tags,
        parameters,
        requestBody,
        security: operationSecurity,
        rootSecurity,
      })
    }
  }

  return buildResult(title, version, description, baseUrl, endpoints, rootSecurity, securityDefinitions)
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
  rootSchemas: Record<string, unknown> = {},
  pathSecurity: Array<Record<string, string[]>> = [],
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

  const requestBody = extractRequestBody(operation, rootSchemas)
  const tags = (operation.tags as string[]) || []
  const security = extractSecurity(operation, pathSecurity)

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

function extractRequestBody(
  operation: Record<string, unknown>,
  rootSchemas: Record<string, unknown> = {},
): OpenApiRequestBody | undefined {
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
    example: extractExampleFromSchema(schema, mediaType, rootSchemas),
  }
}

/** Resolve $ref like "#/components/schemas/LoginDto" against rootSchemas. */
function resolveRef(ref: string, rootSchemas: Record<string, unknown>): Record<string, unknown> | null {
  const parts = ref.split("/")
  if (parts[0] !== "#" || parts[1] !== "components" || parts[2] !== "schemas") return null
  const name = parts.slice(3).join("/")
  return (rootSchemas[name] as Record<string, unknown>) ?? null
}

/** Recursively resolve $ref until we get a concrete schema. */
function derefSchema(
  schema: Record<string, unknown>,
  rootSchemas: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> | null {
  if (depth > 10) return schema
  const ref = schema.$ref as string | undefined
  if (!ref) return schema
  const resolved = resolveRef(ref, rootSchemas)
  if (!resolved) return null
  return derefSchema(resolved, rootSchemas, depth + 1)
}

function extractExampleFromSchema(
  schema?: Record<string, unknown>,
  mediaType?: Record<string, unknown>,
  rootSchemas: Record<string, unknown> = {},
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

  if (!schema) return undefined

  // Try schema-level example
  if (schema.example !== undefined) return tryStringify(schema.example)
  if (schema.default !== undefined) return tryStringify(schema.default)

  // Generate example from schema type (with $ref resolution)
  return generateExampleFromSchema(schema, rootSchemas)
}

function uuidV4(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0"))
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`
}

function defaultValueForFormat(format: string | undefined, type: string): unknown {
  if (!format) {
    switch (type) {
      case "string": return "string"
      case "integer": return 0
      case "number": return 0.0
      case "boolean": return false
      default: return null
    }
  }
  switch (format) {
    case "email": return "user@example.com"
    case "uuid": return uuidV4()
    case "uri":
    case "url": return "https://example.com"
    case "date": return "2025-01-01"
    case "date-time": return "2025-01-01T00:00:00Z"
    case "time": return "12:00:00"
    case "ipv4": return "127.0.0.1"
    case "ipv6": return "::1"
    case "hostname": return "example.com"
    case "byte": return "aGVsbG8="
    case "binary": return ""
    default:
      switch (type) {
        case "integer": return 0
        case "number": return 0.0
        case "boolean": return false
        default: return "string"
      }
  }
}

/** Generate a sample JSON value from an OpenAPI schema, resolving $refs. */
function generateExampleFromSchema(
  rawSchema: Record<string, unknown>,
  rootSchemas: Record<string, unknown> = {},
  depth = 0,
): string | undefined {
  if (depth > 10) return undefined

  // Resolve $ref before processing
  const schema = derefSchema(rawSchema, rootSchemas)
  if (!schema) return undefined

  // Check example/default directly
  if (schema.example !== undefined) return tryStringify(schema.example)
  if (schema.default !== undefined) return tryStringify(schema.default)

  // Handle enum
  const enumVals = schema.enum as unknown[] | undefined
  if (Array.isArray(enumVals) && enumVals.length > 0) return tryStringify(enumVals[0])

  // Handle composition (allOf)
  const allOf = schema.allOf as Record<string, unknown>[] | undefined
  if (Array.isArray(allOf) && allOf.length > 0) {
    const merged: Record<string, unknown> = {}
    for (const sub of allOf) {
      const subResult = generateExampleFromSchema(sub, rootSchemas, depth + 1)
      if (subResult) {
        try {
          const parsed = JSON.parse(subResult)
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            Object.assign(merged, parsed)
          }
        } catch {
          // skip string results
        }
      }
    }
    if (Object.keys(merged).length > 0) return JSON.stringify(merged, null, 2)
  }

  // Handle anyOf/oneOf — pick first branch that yields a result
  const anyOf = schema.anyOf as Record<string, unknown>[] | undefined
  if (Array.isArray(anyOf) && anyOf.length > 0) {
    for (const branch of anyOf) {
      const result = generateExampleFromSchema(branch, rootSchemas, depth + 1)
      if (result) return result
    }
  }
  const oneOf = schema.oneOf as Record<string, unknown>[] | undefined
  if (Array.isArray(oneOf) && oneOf.length > 0) {
    for (const branch of oneOf) {
      const result = generateExampleFromSchema(branch, rootSchemas, depth + 1)
      if (result) return result
    }
  }

  // Generate by type
  const type = schema.type as string | undefined
  const format = schema.format as string | undefined

  if (type === "object" || schema.properties) {
    const props = schema.properties as Record<string, unknown> | undefined
    if (!props) return JSON.stringify({}, null, 2)
    const example: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(props)) {
      const propSchema = val as Record<string, unknown>
      // Resolve $ref for the property
      const resolvedProp = derefSchema(propSchema, rootSchemas)
      if (!resolvedProp) {
        example[key] = null
        continue
      }

      const propExample = resolvedProp.example ?? resolvedProp.default
      if (propExample !== undefined) {
        example[key] = propExample
        continue
      }

      // Handle enum in property
      const propEnum = resolvedProp.enum as unknown[] | undefined
      if (Array.isArray(propEnum) && propEnum.length > 0) {
        example[key] = propEnum[0]
        continue
      }

      const propType = resolvedProp.type as string | undefined
      const propFormat = resolvedProp.format as string | undefined

      // Handle nested object via recursion
      if (propType === "object" || resolvedProp.properties) {
        const nested = generateExampleFromSchema(resolvedProp, rootSchemas, depth + 1)
        try {
          example[key] = nested ? JSON.parse(nested) : null
        } catch {
          example[key] = null
        }
        continue
      }

      // Handle array items
      if (propType === "array") {
        const items = resolvedProp.items as Record<string, unknown> | undefined
        if (items) {
          const resolvedItems = derefSchema(items, rootSchemas)
          if (resolvedItems) {
            const itemExample = generateExampleFromSchema(resolvedItems, rootSchemas, depth + 1)
            try {
              example[key] = itemExample ? [JSON.parse(itemExample)] : []
            } catch {
              example[key] = []
            }
          } else {
            example[key] = []
          }
        } else {
          example[key] = []
        }
        continue
      }

      // Primitive with format
      if (propFormat && propType === "string") {
        example[key] = defaultValueForFormat(propFormat, "string")
        continue
      }

      // Simple type-based default
      example[key] = defaultValueForFormat(undefined, propType ?? "string")
    }
    return JSON.stringify(example, null, 2)
  }

  if (type === "array") {
    const items = schema.items as Record<string, unknown> | undefined
    if (items) {
      const resolvedItems = derefSchema(items, rootSchemas)
      if (resolvedItems) {
        const itemExample = generateExampleFromSchema(resolvedItems, rootSchemas, depth + 1)
        if (itemExample) {
          try {
            return JSON.stringify([JSON.parse(itemExample)], null, 2)
          } catch {
            return "[]"
          }
        }
      }
    }
    return "[]"
  }

  // Primitive type
  if (type === "string" && format) {
    return tryStringify(defaultValueForFormat(format, "string"))
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

function extractSecurity(
  operation: Record<string, unknown>,
  fallback: Array<Record<string, string[]>> = [],
): Record<string, string[]>[] {
  return (operation.security as Array<Record<string, string[]>>) ?? fallback
}

function buildResult(
  title: string,
  version: string,
  description: string | undefined,
  baseUrl: string | undefined,
  endpoints: OpenApiEndpoint[],
  rootSecurity?: Array<Record<string, string[]>>,
  securitySchemes?: Record<string, unknown>,
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
    spec: {
      title,
      version,
      description,
      baseUrl,
      ...(rootSecurity && rootSecurity.length > 0 ? { rootSecurity } : {}),
      ...(securitySchemes && Object.keys(securitySchemes).length > 0 ? { securitySchemes } : {}),
    },
    endpoints,
    tagGroups,
    totalEndpoints: endpoints.length,
  }
}

// ─── Endpoint → RequestItem converter ───────────────────────────────────────

function mapContentTypeToBodyType(contentType?: string): CollectionImportData["requests"][number]["bodyType"] {
  if (!contentType) return "raw"
  const ct = contentType.toLowerCase()
  if (ct.includes("application/json") || ct.includes("+json")) return "json"
  if (ct.includes("multipart/form-data")) return "form-data"
  if (ct.includes("application/x-www-form-urlencoded")) return "x-www-form"
  if (ct.includes("application/octet-stream") || ct.startsWith("image/") || ct.startsWith("audio/") || ct.startsWith("video/")) return "binary"
  return "raw"
}

function mapSecurityToAuth(
  security: Array<Record<string, string[]>>,
  securitySchemes?: Record<string, unknown>,
): Pick<CollectionImportData["requests"][number], "authType" | "authToken"> {
  if (security.length === 0 || !securitySchemes) return { authType: "none" }

  // Pick the first alternative from the OR-list of security requirements.
  const firstRequirement = security[0]
  const schemeName = Object.keys(firstRequirement)[0]
  if (!schemeName) return { authType: "none" }

  const scheme = securitySchemes[schemeName]
  if (!scheme || typeof scheme !== "object") return { authType: "none" }
  const s = scheme as Record<string, unknown>

  const type = String(s.type ?? "").toLowerCase()
  const schemeField = String(s.scheme ?? "").toLowerCase()

  if (type === "http") {
    if (schemeField === "bearer") return { authType: "bearer" }
    if (schemeField === "basic") return { authType: "basic" }
    return { authType: "api-key" }
  }
  if (type === "apikey") return { authType: "api-key" }
  if (type === "oauth2" || type === "openidconnect") return { authType: "oauth2" }

  return { authType: "none" }
}

function endpointToRequest(
  ep: OpenApiEndpoint,
  context: EndpointConversionContext,
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
  if (context.baseUrl) {
    const cleanBase = context.baseUrl.replace(/\/+$/, "")
    url = ep.path.startsWith("/") ? `${cleanBase}${ep.path}` : `${cleanBase}/${ep.path}`
  }

  const bodyType = ep.requestBody
    ? mapContentTypeToBodyType(ep.requestBody.contentType)
    : undefined

  const { authType, authToken } = mapSecurityToAuth(ep.security, context.securitySchemes)

  const request: CollectionImportData["requests"][number] = {
    name: ep.name,
    method: ep.method,
    url,
    endpoint: ep.path,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    body: ep.requestBody?.example ?? "",
    bodyType,
    authType,
    authToken,
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
