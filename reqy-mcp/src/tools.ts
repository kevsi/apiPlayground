import type { CollectionStore } from "./store.js"
import { executeRequest } from "./runner.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import type { ExportBundle, RequestItem } from "./types.js"

export interface Tool {
  name: string
  description: string
  inputSchema: object
}

const TOOLS: Tool[] = [
  {
    name: "list_collections",
    description: "List all Reqly collections with their request counts",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_requests",
    description: "List all requests in a given collection",
    inputSchema: {
      type: "object",
      properties: {
        collection_id: {
          type: "string",
          description: "The ID of the collection",
        },
      },
      required: ["collection_id"],
    },
  },
  {
    name: "get_request",
    description: "Get full details of a specific request by ID",
    inputSchema: {
      type: "object",
      properties: {
        request_id: {
          type: "string",
          description: "The ID of the request",
        },
      },
      required: ["request_id"],
    },
  },
  {
    name: "run_request",
    description: "Execute a request by ID and return status, body, and timing",
    inputSchema: {
      type: "object",
      properties: {
        request_id: {
          type: "string",
          description: "The ID of the request to run",
        },
        timeout_ms: {
          type: "number",
          description: "Request timeout in milliseconds (default: 30000)",
        },
        env_name: {
          type: "string",
          description: "Optional environment name to use for variable interpolation",
        },
      },
      required: ["request_id"],
    },
  },
  {
    name: "create_request",
    description: "Create a new request in a collection",
    inputSchema: {
      type: "object",
      properties: {
        collection_id: {
          type: "string",
          description: "The ID of the collection to add the request to",
        },
        name: {
          type: "string",
          description: "Name of the request",
        },
        method: {
          type: "string",
          description: "HTTP method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, GRAPHQL)",
        },
        url: {
          type: "string",
          description: "Request URL",
        },
        headers: {
          type: "object",
          description: "Optional headers object",
        },
        body: {
          type: "string",
          description: "Optional request body",
        },
        body_type: {
          type: "string",
          description: "Optional body type: json, form-data, x-www-form, raw, binary",
        },
        auth_type: {
          type: "string",
          description: "Optional auth type: none, bearer, basic, api-key, oauth2",
        },
        auth_token: {
          type: "string",
          description: "Optional auth token",
        },
        query_params: {
          type: "array",
          description: "Optional query parameters array of {key, value}",
        },
      },
      required: ["collection_id", "name", "method", "url"],
    },
  },
  {
    name: "search_requests",
    description: "Search requests by name, URL, or method",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query string",
        },
      },
      required: ["query"],
    },
  },
]

export function listTools(): Tool[] {
  return TOOLS
}

export function createToolHandler(store: CollectionStore, bundle?: ExportBundle) {
  return async function handleToolCall(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    switch (name) {
      case "list_collections": {
        const collections = store.getCollections().map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          request_count: c.requests.length,
          folder_count: c.folders?.length ?? 0,
          color: c.color,
          icon: c.icon,
        }))
        return {
          content: [{ type: "text", text: JSON.stringify(collections, null, 2) }],
        }
      }

      case "list_requests": {
        const collectionId = String(args.collection_id ?? "")
        const collection = store.getCollection(collectionId)
        if (!collection) {
          return {
            content: [{ type: "text", text: `Collection not found: ${collectionId}` }],
            isError: true,
          }
        }
        const requests = collection.requests.map((r) => ({
          id: r.id,
          name: r.name,
          method: r.method,
          url: r.url,
          endpoint: r.endpoint,
          folder_id: r.folderId ?? null,
        }))
        return {
          content: [{ type: "text", text: JSON.stringify(requests, null, 2) }],
        }
      }

      case "get_request": {
        const requestId = String(args.request_id ?? "")
        const found = store.findRequestById(requestId)
        if (!found) {
          return {
            content: [{ type: "text", text: `Request not found: ${requestId}` }],
            isError: true,
          }
        }
        const { request } = found
        const detail = {
          id: request.id,
          name: request.name,
          method: request.method,
          url: request.url,
          endpoint: request.endpoint,
          headers: request.headers ?? {},
          body: request.body ?? null,
          body_type: request.bodyType ?? null,
          auth_type: request.authType ?? "none",
          auth_token: request.authToken ? "***" : null,
          query_params: request.queryParams ?? [],
          folder_id: request.folderId ?? null,
          created_at: request.createdAt,
          updated_at: request.updatedAt,
        }
        return {
          content: [{ type: "text", text: JSON.stringify(detail, null, 2) }],
        }
      }

      case "run_request": {
        const runRequestId = String(args.request_id ?? "")
        const timeoutMs = typeof args.timeout_ms === "number" && args.timeout_ms > 0 ? args.timeout_ms : 30000
        const envName = args.env_name ? String(args.env_name) : undefined

        const foundRun = store.findRequestById(runRequestId)
        if (!foundRun) {
          return {
            content: [{ type: "text", text: `Request not found: ${runRequestId}` }],
            isError: true,
          }
        }

        const result = await executeRequest(foundRun.request, { timeoutMs, envName }, bundle?.environments)

        const output = {
          name: result.name,
          method: result.method,
          url: result.url,
          status: result.status,
          status_text: result.statusText,
          duration_ms: result.durationMs,
          size_bytes: result.size,
          passed: result.passed,
          error: result.error ?? null,
          body: result.body ?? null,
        }

        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        }
      }

      case "create_request": {
        const colId = String(args.collection_id ?? "")
        const name = String(args.name ?? "")
        const method = String(args.method ?? "GET")
        const url = String(args.url ?? "")

        if (!colId || !name || !method || !url) {
          return {
            content: [{ type: "text", text: "Missing required fields: collection_id, name, method, url" }],
            isError: true,
          }
        }

        const now = Date.now()
        const newRequest: RequestItem = {
          id: `req-${now}-${Math.random().toString(36).slice(2, 8)}`,
          name,
          method: method as RequestItem["method"],
          url,
          endpoint: url,
          headers: typeof args.headers === "object" && args.headers !== null
            ? (args.headers as Record<string, string>)
            : undefined,
          body: args.body ? String(args.body) : undefined,
          bodyType: args.body_type ? String(args.body_type) as RequestItem["bodyType"] : undefined,
          authType: args.auth_type ? String(args.auth_type) as RequestItem["authType"] : undefined,
          authToken: args.auth_token ? String(args.auth_token) : undefined,
          queryParams: Array.isArray(args.query_params)
            ? (args.query_params as Array<{ key: string; value: string }>)
            : undefined,
          createdAt: now,
          updatedAt: now,
        }

        try {
          store.addRequest(colId, newRequest)
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          return {
            content: [{ type: "text", text: message }],
            isError: true,
          }
        }

        return {
          content: [{ type: "text", text: JSON.stringify({ created: true, request_id: newRequest.id }, null, 2) }],
        }
      }

      case "search_requests": {
        const query = String(args.query ?? "")
        if (!query) {
          return {
            content: [{ type: "text", text: "Query cannot be empty" }],
            isError: true,
          }
        }
        const results = store.searchRequests(query).map((r) => ({
          request_id: r.request.id,
          name: r.request.name,
          method: r.request.method,
          url: r.request.url,
          collection_id: r.collectionId,
          collection_name: r.collectionName,
        }))
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        }
      }

      default:
        return {
          content: [{ type: "text", text: `Unknown tool: ${name}` }],
          isError: true,
        }
    }
  }
}
