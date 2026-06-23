import type { Collection, RequestItem } from "@/lib/types"
import { inferSchemaFromValue } from "@/lib/openapi-inference/infer-schema"
import { mergeInferredWithGeneric } from "@/lib/openapi-inference/merge-schemas"
import { extractExample } from "@/lib/openapi-inference/examples"

export interface OpenApiExportOptions {
  enableInference?: boolean
  historyItems?: Array<{ requestId: string; responseBody?: unknown }>
}

function formatPath(request: RequestItem): string {
  const rawPath = request.endpoint?.trim() || request.url?.trim() || "/"
  if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) {
    try {
      const url = new URL(rawPath)
      return url.pathname + url.search
    } catch {
      return rawPath
    }
  }
  return rawPath.startsWith("/") ? rawPath : `/${rawPath}`
}

function buildSchemaForValue(value?: string) {
  if (!value) return { type: "string" as const }
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return { type: "array" as const, items: { type: "object" as const } }
    if (typeof parsed === "object" && parsed !== null) return { type: "object" as const }
    if (typeof parsed === "number") return { type: "number" as const }
    if (typeof parsed === "boolean") return { type: "boolean" as const }
  } catch {
    // plain text body
  }
  return { type: "string" as const }
}

function operationId(collectionName: string, request: RequestItem): string {
  const slug = `${collectionName}_${request.name}_${request.method}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return slug || `operation_${request.method.toLowerCase()}`
}

function parseResponseBody(body: unknown): unknown | undefined {
  if (body === undefined || body === null) return undefined
  if (typeof body === "string") {
    const trimmed = body.trim()
    if (!trimmed) return undefined
    try {
      return JSON.parse(trimmed)
    } catch {
      return undefined
    }
  }
  return body
}

function findHistoryResponse(
  historyItems: OpenApiExportOptions["historyItems"],
  requestId: string,
): unknown | undefined {
  if (!historyItems || historyItems.length === 0) return undefined
  // Pick the most recent matching history item (history is assumed newest-last or newest-first;
  // iterate in reverse to favour the last entry that matches).
  for (let i = historyItems.length - 1; i >= 0; i--) {
    const entry = historyItems[i]
    if (entry.requestId === requestId) {
      const parsed = parseResponseBody(entry.responseBody)
      if (parsed !== undefined) return parsed
    }
  }
  return undefined
}

function buildResponseSchema(
  request: RequestItem,
  options?: OpenApiExportOptions,
): Record<string, unknown> {
  const generic = { type: "object" as const }

  if (!options?.enableInference || !options.historyItems) {
    return generic
  }

  const responseValue = findHistoryResponse(options.historyItems, request.id)
  if (responseValue === undefined) return generic

  const inferred = inferSchemaFromValue(responseValue)
  const merged = mergeInferredWithGeneric(inferred, generic)
  const example = extractExample(responseValue)

  if (example !== undefined) {
    return { ...merged, example }
  }
  return merged
}

export function generateOpenApiSpec(
  collections: Collection[],
  options?: OpenApiExportOptions,
) {
  const paths: Record<string, Record<string, unknown>> = {}
  const usedOperationIds = new Set<string>()

  collections.forEach((collection) => {
    collection.requests.forEach((request) => {
      const path = formatPath(request)
      const method = request.method.toLowerCase()
      if (!paths[path]) paths[path] = {}

      let opId = operationId(collection.name, request)
      while (usedOperationIds.has(opId)) {
        opId = `${opId}_${usedOperationIds.size}`
      }
      usedOperationIds.add(opId)

      const parameters = [
        ...(request.queryParams ?? [])
          .filter((param) => param.key.trim())
          .map((param) => ({
            name: param.key.trim(),
            in: "query" as const,
            required: false,
            schema: { type: "string" as const },
            example: param.value.trim() || undefined,
          })),
        ...Object.entries(request.headers ?? {})
          .filter(([key]) => key.trim())
          .map(([key, value]) => ({
            name: key.trim(),
            in: "header" as const,
            required: false,
            schema: { type: "string" as const },
            example: value || undefined,
          })),
      ]

      const requestBody = request.body
        ? {
            required: true,
            content: {
              "application/json": {
                schema: buildSchemaForValue(request.body),
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

      const responseSchema = buildResponseSchema(request, options)

      paths[path][method] = {
        operationId: opId,
        tags: [collection.name],
        summary: request.name || `${request.method} ${path}`,
        description: request.url ? `Source URL: ${request.url}` : `Reqly collection: ${collection.name}`,
        parameters,
        ...(requestBody ? { requestBody } : {}),
        responses: {
          "200": {
            description: "Successful response",
            content: {
              "application/json": {
                schema: responseSchema,
              },
            },
          },
          default: {
            description: "Error response",
            content: {
              "application/json": {
                schema: {
                  type: "object" as const,
                  properties: {
                    message: { type: "string" as const },
                  },
                },
              },
            },
          },
        },
      }
    })
  })

  return {
    openapi: "3.0.3",
    info: {
      title: "Reqly API Collections",
      version: "1.0.0",
      description: "OpenAPI 3.0 export generated from Reqly request collections.",
    },
    servers: [{ url: "http://localhost", description: "Local development" }],
    paths,
  }
}
