import type { CollectionStore } from "./store.js"
import { executeRequest, executeRequestWithAssertions, executeGraphQL, validateRequest, isValidMethod, isValidBodyType, isValidAuthType } from "./runner.js"
import type { RunResultWithAssertions } from "./runner.js"
import { parseCurlCommand, generateCurlCommand } from "./curl-parser.js"
import { collectionRunRecordToJUnitXml } from "./junit-export.js"
import { generateRequestFromDescription } from "./ai-request-generator.js"
import { importFromOpenApi, exportToOpenApi } from "./openapi.js"
import { analyzeProjectRoutes } from "./project-analyzer.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import type { ExportBundle, RequestItem, RunResult, RequestRunRecord, CollectionRunRecord } from "./types.js"

export interface Tool {
  name: string
  description: string
  inputSchema: object
}

export interface ToolHandlerOptions {
  defaultTimeoutMs: number
  defaultEnvName?: string
  allowLocalHosts?: boolean
  maxResponseSize?: number
  maxBatchSize?: number
  maxConcurrency?: number
}

const DEFAULT_MAX_BATCH_SIZE = 20
const DEFAULT_MAX_CONCURRENCY = 5

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
    name: "create_collection",
    description: "Create a new collection",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name of the collection",
        },
        description: {
          type: "string",
          description: "Optional description",
        },
        color: {
          type: "string",
          description: "Optional color (slate, red, orange, amber, emerald, blue, indigo, violet, pink)",
        },
        icon: {
          type: "string",
          description: "Optional icon name",
        },
      },
      required: ["name"],
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
    name: "import_from_curl",
    description: "Import a request from a curl command string into a collection",
    inputSchema: {
      type: "object",
      properties: {
        collection_id: { type: "string", description: "The collection ID to add the request to" },
        curl_command: { type: "string", description: "The curl command to parse" },
        name: { type: "string", description: "Optional request name (defaults to URL path)" },
      },
      required: ["collection_id", "curl_command"],
    },
  },
  {
    name: "export_request_to_curl",
    description: "Export a stored request to an equivalent curl command string",
    inputSchema: {
      type: "object",
      properties: {
        request_id: { type: "string", description: "The request ID" },
      },
      required: ["request_id"],
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
  {
    name: "update_collection",
    description: "Update an existing collection's name, description, color, or icon",
    inputSchema: {
      type: "object",
      properties: {
        collection_id: { type: "string", description: "The ID of the collection to update" },
        name: { type: "string", description: "New name" },
        description: { type: "string", description: "New description" },
        color: { type: "string", description: "New color (slate, red, orange, amber, emerald, blue, indigo, violet, pink)" },
        icon: { type: "string", description: "New icon name" },
      },
      required: ["collection_id"],
    },
  },
  {
    name: "delete_collection",
    description: "Delete a collection and all its requests",
    inputSchema: {
      type: "object",
      properties: {
        collection_id: { type: "string", description: "The ID of the collection to delete" },
      },
      required: ["collection_id"],
    },
  },
  {
    name: "duplicate_collection",
    description: "Duplicate a collection with all its requests and folders",
    inputSchema: {
      type: "object",
      properties: {
        collection_id: { type: "string", description: "The ID of the collection to duplicate" },
      },
      required: ["collection_id"],
    },
  },
  {
    name: "update_request",
    description: "Update an existing request's fields (method, URL, headers, body, auth, etc.)",
    inputSchema: {
      type: "object",
      properties: {
        request_id: { type: "string", description: "The ID of the request to update" },
        name: { type: "string", description: "New name" },
        method: { type: "string", description: "New HTTP method" },
        url: { type: "string", description: "New URL" },
        headers: { type: "object", description: "New headers object" },
        body: { type: "string", description: "New request body" },
        body_type: { type: "string", description: "New body type" },
        auth_type: { type: "string", description: "New auth type" },
        auth_token: { type: "string", description: "New auth token" },
        query_params: { type: "array", description: "New query params array" },
        folder_id: { type: "string", description: "Move to folder (null to remove from folder)" },
        pre_request_script: { type: "string", description: "JavaScript to run before request" },
        post_response_script: { type: "string", description: "JavaScript to run after response" },
        protocol: { type: "string", description: "Protocol (rest or graphql)" },
      },
      required: ["request_id"],
    },
  },
  {
    name: "delete_request",
    description: "Delete a request by ID",
    inputSchema: {
      type: "object",
      properties: {
        request_id: { type: "string", description: "The ID of the request to delete" },
      },
      required: ["request_id"],
    },
  },
  {
    name: "duplicate_request",
    description: "Duplicate a request within the same or a different collection",
    inputSchema: {
      type: "object",
      properties: {
        request_id: { type: "string", description: "The ID of the request to duplicate" },
        target_collection_id: { type: "string", description: "Optional target collection ID (defaults to same collection)" },
      },
      required: ["request_id"],
    },
  },
  {
    name: "run_collection",
    description: "Run all requests in a collection sequentially and return results",
    inputSchema: {
      type: "object",
      properties: {
        collection_id: { type: "string", description: "The ID of the collection to run" },
        timeout_ms: { type: "number", description: "Per-request timeout in milliseconds" },
        env_name: { type: "string", description: "Environment name for variable interpolation" },
      },
      required: ["collection_id"],
    },
  },
  {
    name: "run_requests_batch",
    description: "Run multiple requests in parallel by their IDs",
    inputSchema: {
      type: "object",
      properties: {
        request_ids: { type: "array", description: "Array of request IDs to run", items: { type: "string" } },
        timeout_ms: { type: "number", description: "Per-request timeout in milliseconds" },
        env_name: { type: "string", description: "Environment name for variable interpolation" },
      },
      required: ["request_ids"],
    },
  },
  {
    name: "list_environments",
    description: "List all environments with their variable counts",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_collection_tree",
    description: "Get the full tree of a collection including folders and requests",
    inputSchema: {
      type: "object",
      properties: {
        collection_id: { type: "string", description: "The collection ID" },
      },
      required: ["collection_id"],
    },
  },
  {
    name: "resolve_variables",
    description: "Resolve {{variable}} placeholders in a string using an environment",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "The text containing {{variable}} placeholders" },
        env_name: { type: "string", description: "The environment name" },
      },
      required: ["text", "env_name"],
    },
  },
  {
    name: "get_environment_variables",
    description: "Get resolved variables for a given environment (for debugging interpolation)",
    inputSchema: {
      type: "object",
      properties: {
        env_name: { type: "string", description: "The environment name" },
      },
      required: ["env_name"],
    },
  },
  {
    name: "create_environment",
    description: "Create a new environment",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Environment name" },
        color: { type: "string", description: "Optional color" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_environment",
    description: "Update environment variables (add, modify, remove, toggle variables)",
    inputSchema: {
      type: "object",
      properties: {
        env_id: { type: "string", description: "The environment ID" },
        name: { type: "string", description: "New name" },
        color: { type: "string", description: "New color" },
        variables: { type: "array", description: "Array of {key, value, enabled} objects", items: { type: "object" } },
      },
      required: ["env_id"],
    },
  },
  {
    name: "delete_environment",
    description: "Delete an environment",
    inputSchema: {
      type: "object",
      properties: {
        env_id: { type: "string", description: "The environment ID" },
      },
      required: ["env_id"],
    },
  },
  {
    name: "export_bundle",
    description: "Export all collections, requests, folders, and environments as a JSON bundle",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "import_from_openapi",
    description: "Import collections and requests from an OpenAPI JSON or YAML spec",
    inputSchema: {
      type: "object",
      properties: {
        spec: { type: "string", description: "The OpenAPI JSON or YAML spec string" },
      },
      required: ["spec"],
    },
  },
  {
    name: "export_to_openapi",
    description: "Export all collections to an OpenAPI 3.0 JSON spec",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "import_bundle",
    description: "Import collections and requests from a JSON bundle",
    inputSchema: {
      type: "object",
      properties: {
        bundle_json: { type: "string", description: "JSON string of the export bundle" },
      },
      required: ["bundle_json"],
    },
  },
  {
    name: "create_folder",
    description: "Create a folder inside a collection to organize requests",
    inputSchema: {
      type: "object",
      properties: {
        collection_id: { type: "string", description: "The collection ID" },
        name: { type: "string", description: "Folder name" },
        parent_id: { type: "string", description: "Optional parent folder ID for nesting" },
      },
      required: ["collection_id", "name"],
    },
  },
  {
    name: "update_folder",
    description: "Rename or move a folder",
    inputSchema: {
      type: "object",
      properties: {
        folder_id: { type: "string", description: "The folder ID" },
        name: { type: "string", description: "New name" },
        parent_id: { type: "string", description: "New parent folder ID (null for root)" },
      },
      required: ["folder_id"],
    },
  },
  {
    name: "delete_folder",
    description: "Delete a folder (requests inside are unlinked but not deleted)",
    inputSchema: {
      type: "object",
      properties: {
        folder_id: { type: "string", description: "The folder ID" },
      },
      required: ["folder_id"],
    },
  },
  {
    name: "move_request",
    description: "Move a request to a different collection and/or folder",
    inputSchema: {
      type: "object",
      properties: {
        request_id: { type: "string", description: "The request ID to move" },
        target_collection_id: { type: "string", description: "Target collection ID" },
        target_folder_id: { type: "string", description: "Optional target folder ID (null for root)" },
      },
      required: ["request_id", "target_collection_id"],
    },
  },
  {
    name: "generate_request_from_description",
    description: "Generate a request definition from a plain-text description",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "Plain-text description of the request" },
        collection_id: { type: "string", description: "Optional collection ID to save the generated request" },
        name: { type: "string", description: "Optional override name for the generated request" },
      },
      required: ["description"],
    },
  },
  {
    name: "validate_request",
    description: "Pre-flight validation of request fields without sending the request",
    inputSchema: {
      type: "object",
      properties: {
        request_id: { type: "string", description: "Validate an existing request by ID" },
        name: { type: "string", description: "Or validate ad-hoc: request name" },
        method: { type: "string", description: "Or validate ad-hoc: HTTP method" },
        url: { type: "string", description: "Or validate ad-hoc: URL" },
        body: { type: "string", description: "Or validate ad-hoc: request body" },
        body_type: { type: "string", description: "Or validate ad-hoc: body type" },
        auth_type: { type: "string", description: "Or validate ad-hoc: auth type" },
        auth_token: { type: "string", description: "Or validate ad-hoc: auth token" },
      },
    },
  },
  {
    name: "analyze_project_routes",
    description: "Analyze a local project folder and return detected HTTP routes (desktop mode only)",
    inputSchema: {
      type: "object",
      properties: {
        folder_path: { type: "string", description: "Absolute path to the project folder" },
        save_collection_id: { type: "string", description: "Optional collection ID to save generated requests" },
      },
      required: ["folder_path"],
    },
  },
  {
    name: "graphql_execute",
    description: "Execute a raw GraphQL query against an endpoint (not tied to a stored request)",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "GraphQL endpoint URL" },
        query: { type: "string", description: "GraphQL query string" },
        variables: { type: "object", description: "Optional GraphQL variables" },
        operation_name: { type: "string", description: "Optional operation name" },
        headers: { type: "object", description: "Optional extra headers" },
        timeout_ms: { type: "number", description: "Timeout in milliseconds" },
      },
      required: ["url", "query"],
    },
  },
  {
    name: "duplicate_environment",
    description: "Duplicate an environment with all its variables",
    inputSchema: {
      type: "object",
      properties: {
        env_id: { type: "string", description: "The environment ID to duplicate" },
      },
      required: ["env_id"],
    },
  },
  {
    name: "reorder_requests",
    description: "Reorder requests inside a collection by providing the full ordered list of request IDs",
    inputSchema: {
      type: "object",
      properties: {
        collection_id: { type: "string", description: "The collection ID" },
        ordered_request_ids: {
          type: "array",
          description: "Array of request IDs in the desired order",
          items: { type: "string" },
        },
      },
      required: ["collection_id", "ordered_request_ids"],
    },
  },
  {
    name: "run_collection_with_assertions",
    description: "Run all requests in a collection sequentially, evaluate assertions, and return a test report",
    inputSchema: {
      type: "object",
      properties: {
        collection_id: { type: "string", description: "The ID of the collection to run" },
        timeout_ms: { type: "number", description: "Per-request timeout in milliseconds" },
        env_name: { type: "string", description: "Environment name for variable interpolation" },
      },
      required: ["collection_id"],
    },
  },
  {
    name: "export_collection_to_junit",
    description: "Export the last run record of a collection as JUnit XML",
    inputSchema: {
      type: "object",
      properties: {
        collection_id: { type: "string", description: "The collection ID" },
      },
      required: ["collection_id"],
    },
  },
  {
    name: "get_request_history",
    description: "Get execution history for a specific request",
    inputSchema: {
      type: "object",
      properties: {
        request_id: { type: "string", description: "The request ID" },
        limit: { type: "number", description: "Maximum number of runs to return" },
      },
      required: ["request_id"],
    },
  },
  {
    name: "get_run_history",
    description: "Get recent collection run history, optionally filtered by collection",
    inputSchema: {
      type: "object",
      properties: {
        collection_id: { type: "string", description: "Optional collection ID filter" },
        limit: { type: "number", description: "Maximum number of runs to return" },
      },
    },
  },
]

export function listTools(): Tool[] {
  return TOOLS
}

async function runWithLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<unknown>): Promise<void> {
  const queue = items.slice()
  const running: Promise<void>[] = []

  while (queue.length > 0 || running.length > 0) {
    while (running.length < limit && queue.length > 0) {
      const item = queue.shift()!
      running.push(
        Promise.resolve(fn(item)).then(() => undefined).catch(() => undefined),
      )
    }
    if (running.length > 0) {
      await Promise.race(running)
      for (let i = running.length - 1; i >= 0; i--) {
        if (await Promise.race([running[i]!, Promise.resolve("pending")]) !== "pending") {
          running.splice(i, 1)
        }
      }
    }
  }
}

export function createToolHandler(store: CollectionStore, bundle: ExportBundle | undefined, options: ToolHandlerOptions) {
  const {
    defaultTimeoutMs,
    defaultEnvName,
    allowLocalHosts = false,
    maxResponseSize,
    maxBatchSize = DEFAULT_MAX_BATCH_SIZE,
    maxConcurrency = DEFAULT_MAX_CONCURRENCY,
  } = options

  function resolveRunOptions(args: Record<string, unknown>): { timeoutMs: number; envName?: string } {
    const timeoutMs = typeof args.timeout_ms === "number" && args.timeout_ms > 0 ? args.timeout_ms : defaultTimeoutMs
    const envName = args.env_name ? String(args.env_name) : defaultEnvName
    return { timeoutMs, envName }
  }

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

      case "get_collection_tree": {
        const treeColId = String(args.collection_id ?? "")
        const treeCollection = store.getCollection(treeColId)
        if (!treeCollection) {
          return { content: [{ type: "text", text: `Collection not found: ${treeColId}` }], isError: true }
        }

        const folders = treeCollection.folders ?? []
        const rootRequests = treeCollection.requests.filter((r) => !r.folderId)

        const tree = {
          id: treeCollection.id,
          name: treeCollection.name,
          root_requests: rootRequests.map((r) => ({
            id: r.id,
            name: r.name,
            method: r.method,
            url: r.url,
          })),
          folders: folders.map((f) => ({
            id: f.id,
            name: f.name,
            parent_id: f.parentId,
            requests: treeCollection.requests
              .filter((r) => r.folderId === f.id)
              .map((r) => ({ id: r.id, name: r.name, method: r.method, url: r.url })),
          })),
        }
        return {
          content: [{ type: "text", text: JSON.stringify(tree, null, 2) }],
        }
      }

      case "resolve_variables": {
        const textToResolve = String(args.text ?? "")
        const resolveEnvName = String(args.env_name ?? "")
        if (!textToResolve || !resolveEnvName) {
          return { content: [{ type: "text", text: "Missing required fields: text, env_name" }], isError: true }
        }
        const env = store.getEnvironment(resolveEnvName)
        if (!env) {
          return { content: [{ type: "text", text: `Environment not found: ${resolveEnvName}` }], isError: true }
        }
        const resolved = textToResolve.replace(/\{\{([^}]+)\}\}/g, (_match, varName) => {
          const key = varName.trim()
          const variable = env.variables?.find((v) => v.key === key && v.enabled)
          return variable?.value ?? `{{${key}}}`
        })
        return {
          content: [{ type: "text", text: JSON.stringify({ original: textToResolve, resolved, env_name: resolveEnvName }, null, 2) }],
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
        const { timeoutMs, envName } = resolveRunOptions(args)

        const foundRun = store.findRequestById(runRequestId)
        if (!foundRun) {
          return {
            content: [{ type: "text", text: `Request not found: ${runRequestId}` }],
            isError: true,
          }
        }

        const result = await executeRequestWithAssertions(foundRun.request, { timeoutMs, envName, allowLocalHosts, maxResponseSize }, bundle?.environments)

        const singleRunId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const singleRunRecord: RequestRunRecord = {
          id: singleRunId,
          requestId: foundRun.request.id,
          requestName: foundRun.request.name,
          collectionId: foundRun.collection.id,
          collectionName: foundRun.collection.name,
          method: result.method,
          url: result.url,
          status: result.status,
          statusText: result.statusText,
          durationMs: result.durationMs,
          size: result.size,
          passed: result.passed,
          assertionResults: result.assertionResults,
          error: result.error,
          body: result.body,
          executedAt: Date.now(),
        }
        store.addRunRecord({
          id: singleRunId,
          collectionId: foundRun.collection.id,
          collectionName: foundRun.collection.name,
          startedAt: Date.now(),
          completedAt: Date.now(),
          totalDurationMs: result.durationMs,
          results: [singleRunRecord],
          summary: {
            total: 1,
            passed: result.passed ? 1 : 0,
            failed: !result.passed && !result.error ? 1 : 0,
            errored: result.error ? 1 : 0,
          },
        })

        const output = {
          name: result.name,
          method: result.method,
          url: result.url,
          status: result.status,
          status_text: result.statusText,
          duration_ms: result.durationMs,
          size_bytes: result.size,
          passed: result.passed,
          assertions_passed: result.assertionsPassed ?? null,
          assertion_results: result.assertionResults ?? null,
          error: result.error ?? null,
          body: result.body ?? null,
        }

        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        }
      }

      case "create_collection": {
        const colName = String(args.name ?? "")
        if (!colName) {
          return {
            content: [{ type: "text", text: "Missing required field: name" }],
            isError: true,
          }
        }
        const color = String(args.color ?? "blue")
        const icon = String(args.icon ?? "folder")
        const description = args.description ? String(args.description) : undefined

        const collection = store.addCollection(colName, description, color, icon)

        return {
          content: [{ type: "text", text: JSON.stringify({ created: true, collection_id: collection.id, name: collection.name }, null, 2) }],
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

        if (!isValidMethod(method)) {
          return {
            content: [{ type: "text", text: `Invalid HTTP method: ${method}` }],
            isError: true,
          }
        }

        const bodyType = args.body_type ? String(args.body_type) : undefined
        if (bodyType && !isValidBodyType(bodyType)) {
          return {
            content: [{ type: "text", text: `Invalid body type: ${bodyType}` }],
            isError: true,
          }
        }

        const authType = args.auth_type ? String(args.auth_type) : undefined
        if (authType && !isValidAuthType(authType)) {
          return {
            content: [{ type: "text", text: `Invalid auth type: ${authType}` }],
            isError: true,
          }
        }

        const now = Date.now()
        const newRequest: RequestItem = {
          id: `req-${now}-${Math.random().toString(36).slice(2, 8)}`,
          name,
          method,
          url,
          endpoint: url,
          headers: typeof args.headers === "object" && args.headers !== null
            ? (args.headers as Record<string, string>)
            : undefined,
          body: args.body ? String(args.body) : undefined,
          bodyType: bodyType as RequestItem["bodyType"],
          authType: authType as RequestItem["authType"],
          authToken: args.auth_token ? String(args.auth_token) : undefined,
          queryParams: Array.isArray(args.query_params)
            ? (args.query_params as Array<{ key: string; value: string }>)
            : undefined,
          folderId: args.folder_id ? String(args.folder_id) : undefined,
          preRequestScript: args.pre_request_script ? String(args.pre_request_script) : undefined,
          postResponseScript: args.post_response_script ? String(args.post_response_script) : undefined,
          protocol: args.protocol ? String(args.protocol) as RequestItem["protocol"] : undefined,
          createdAt: now,
          updatedAt: now,
        }

        const issues = validateRequest(newRequest)
        const errors = issues.filter((i) => i.severity === "error")
        if (errors.length > 0) {
          return {
            content: [{ type: "text", text: JSON.stringify({ valid: false, issues }, null, 2) }],
            isError: true,
          }
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

      case "import_from_curl": {
        const curlColId = String(args.collection_id ?? "")
        const curlCommand = String(args.curl_command ?? "")
        if (!curlColId || !curlCommand) {
          return { content: [{ type: "text", text: "Missing required fields: collection_id, curl_command" }], isError: true }
        }
        const parsed = parseCurlCommand(curlCommand)
        if (!parsed) {
          return { content: [{ type: "text", text: "Failed to parse curl command" }], isError: true }
        }
        if (!isValidMethod(parsed.method)) {
          return { content: [{ type: "text", text: `Invalid HTTP method in curl: ${parsed.method}` }], isError: true }
        }

        const now = Date.now()
        const curlRequest: RequestItem = {
          id: `req-${now}-${Math.random().toString(36).slice(2, 8)}`,
          name: args.name ? String(args.name) : `${parsed.method} ${new URL(parsed.url).pathname}`,
          method: parsed.method,
          url: parsed.url,
          endpoint: parsed.url,
          headers: parsed.headers,
          body: parsed.body,
          bodyType: parsed.body ? "raw" : undefined,
          authType: parsed.auth ? "basic" : undefined,
          authToken: parsed.auth ? `${parsed.auth.username}:${parsed.auth.password}` : undefined,
          createdAt: now,
          updatedAt: now,
        }
        try {
          store.addRequest(curlColId, curlRequest)
        } catch (e) {
          return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true }
        }
        return {
          content: [{ type: "text", text: JSON.stringify({ imported: true, request_id: curlRequest.id, name: curlRequest.name }, null, 2) }],
        }
      }

      case "export_request_to_curl": {
        const exportReqId = String(args.request_id ?? "")
        if (!exportReqId) {
          return { content: [{ type: "text", text: "Missing required field: request_id" }], isError: true }
        }
        const exportFound = store.findRequestById(exportReqId)
        if (!exportFound) {
          return { content: [{ type: "text", text: `Request not found: ${exportReqId}` }], isError: true }
        }
        const curl = generateCurlCommand({
          method: exportFound.request.method,
          url: exportFound.request.url,
          headers: exportFound.request.headers,
          body: exportFound.request.body,
          authType: exportFound.request.authType,
          authToken: exportFound.request.authToken,
        })
        return {
          content: [{ type: "text", text: JSON.stringify({ request_id: exportReqId, curl }, null, 2) }],
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

      // ----- Collection CRUD -----

      case "update_collection": {
        const colId = String(args.collection_id ?? "")
        if (!colId) {
          return { content: [{ type: "text", text: "Missing required field: collection_id" }], isError: true }
        }
        try {
          const updates: Record<string, unknown> = {}
          if (args.name !== undefined) updates.name = String(args.name)
          if (args.description !== undefined) updates.description = String(args.description)
          if (args.color !== undefined) updates.color = String(args.color)
          if (args.icon !== undefined) updates.icon = String(args.icon)
          const updated = store.updateCollection(colId, updates)
          return {
            content: [{ type: "text", text: JSON.stringify({ updated: true, collection_id: updated.id, name: updated.name }, null, 2) }],
          }
        } catch (e) {
          return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true }
        }
      }

      case "delete_collection": {
        const delColId = String(args.collection_id ?? "")
        if (!delColId) {
          return { content: [{ type: "text", text: "Missing required field: collection_id" }], isError: true }
        }
        try {
          store.deleteCollection(delColId)
          return { content: [{ type: "text", text: JSON.stringify({ deleted: true, collection_id: delColId }) }] }
        } catch (e) {
          return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true }
        }
      }

      case "duplicate_collection": {
        const dupColId = String(args.collection_id ?? "")
        if (!dupColId) {
          return { content: [{ type: "text", text: "Missing required field: collection_id" }], isError: true }
        }
        try {
          const cloned = store.duplicateCollection(dupColId)
          return {
            content: [{ type: "text", text: JSON.stringify({ duplicated: true, collection_id: cloned.id, name: cloned.name, request_count: cloned.requests.length }, null, 2) }],
          }
        } catch (e) {
          return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true }
        }
      }

      // ----- Request CRUD -----

      case "update_request": {
        const reqId = String(args.request_id ?? "")
        if (!reqId) {
          return { content: [{ type: "text", text: "Missing required field: request_id" }], isError: true }
        }
        try {
          const updates: Record<string, unknown> = {}
          if (args.name !== undefined) updates.name = String(args.name)
          if (args.method !== undefined) {
            const method = String(args.method)
            if (!isValidMethod(method)) {
              return { content: [{ type: "text", text: `Invalid HTTP method: ${method}` }], isError: true }
            }
            updates.method = method
          }
          if (args.url !== undefined) updates.url = String(args.url)
          if (args.headers !== undefined) updates.headers = args.headers
          if (args.body !== undefined) updates.body = String(args.body)
          if (args.body_type !== undefined) {
            const bodyType = String(args.body_type)
            if (!isValidBodyType(bodyType)) {
              return { content: [{ type: "text", text: `Invalid body type: ${bodyType}` }], isError: true }
            }
            updates.bodyType = bodyType
          }
          if (args.auth_type !== undefined) {
            const authType = String(args.auth_type)
            if (!isValidAuthType(authType)) {
              return { content: [{ type: "text", text: `Invalid auth type: ${authType}` }], isError: true }
            }
            updates.authType = authType
          }
          if (args.auth_token !== undefined) updates.authToken = String(args.auth_token)
          if (args.query_params !== undefined) updates.queryParams = args.query_params
          if (args.folder_id !== undefined) updates.folderId = args.folder_id === null ? null : String(args.folder_id)
          if (args.pre_request_script !== undefined) updates.preRequestScript = String(args.pre_request_script)
          if (args.post_response_script !== undefined) updates.postResponseScript = String(args.post_response_script)
          if (args.protocol !== undefined) updates.protocol = String(args.protocol)

          const current = store.findRequestById(reqId)
          if (!current) {
            return { content: [{ type: "text", text: `Request not found: ${reqId}` }], isError: true }
          }
          const draft = { ...current.request, ...updates } as RequestItem
          const issues = validateRequest(draft)
          const errors = issues.filter((i) => i.severity === "error")
          if (errors.length > 0) {
            return {
              content: [{ type: "text", text: JSON.stringify({ valid: false, issues }, null, 2) }],
              isError: true,
            }
          }

          const updated = store.updateRequest(reqId, updates)
          return {
            content: [{ type: "text", text: JSON.stringify({ updated: true, request_id: updated.id, name: updated.name }, null, 2) }],
          }
        } catch (e) {
          return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true }
        }
      }

      case "delete_request": {
        const delReqId = String(args.request_id ?? "")
        if (!delReqId) {
          return { content: [{ type: "text", text: "Missing required field: request_id" }], isError: true }
        }
        try {
          store.deleteRequest(delReqId)
          return { content: [{ type: "text", text: JSON.stringify({ deleted: true, request_id: delReqId }) }] }
        } catch (e) {
          return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true }
        }
      }

      case "duplicate_request": {
        const dupReqId = String(args.request_id ?? "")
        const targetColId = args.target_collection_id ? String(args.target_collection_id) : undefined
        if (!dupReqId) {
          return { content: [{ type: "text", text: "Missing required field: request_id" }], isError: true }
        }
        try {
          const cloned = store.duplicateRequest(dupReqId, targetColId)
          return {
            content: [{ type: "text", text: JSON.stringify({ duplicated: true, request_id: cloned.id, name: cloned.name }, null, 2) }],
          }
        } catch (e) {
          return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true }
        }
      }

      // ----- Execution & Batch -----

      case "run_collection": {
        const runColId = String(args.collection_id ?? "")
        const { timeoutMs, envName } = resolveRunOptions(args)
        const collection = store.getCollection(runColId)
        if (!collection) {
          return { content: [{ type: "text", text: `Collection not found: ${runColId}` }], isError: true }
        }
        const startedAt = Date.now()
        const results: RunResultWithAssertions[] = []
        for (const req of collection.requests) {
          const result = await executeRequestWithAssertions(req, { timeoutMs, envName, allowLocalHosts, maxResponseSize }, bundle?.environments)
          results.push(result)
        }
        const completedAt = Date.now()

        const record: CollectionRunRecord = {
          id: `run-${startedAt}-${Math.random().toString(36).slice(2, 8)}`,
          collectionId: collection.id,
          collectionName: collection.name,
          startedAt,
          completedAt,
          totalDurationMs: completedAt - startedAt,
          results: results.map((r) => ({
            id: `run-${startedAt}-${Math.random().toString(36).slice(2, 8)}`,
            requestId: collection.requests.find((req) => req.name === r.name)?.id ?? "unknown",
            requestName: r.name,
            collectionId: collection.id,
            collectionName: collection.name,
            method: r.method,
            url: r.url,
            status: r.status,
            statusText: r.statusText,
            durationMs: r.durationMs,
            size: r.size,
            passed: r.passed,
            assertionResults: r.assertionResults,
            error: r.error,
            body: r.body,
            executedAt: startedAt,
          })),
          summary: {
            total: results.length,
            passed: results.filter((r) => r.passed).length,
            failed: results.filter((r) => !r.passed && !r.error).length,
            errored: results.filter((r) => r.error).length,
          },
        }
        store.addRunRecord(record)

        return {
          content: [{ type: "text", text: JSON.stringify({ collection_name: collection.name, total: results.length, summary: record.summary, results }, null, 2) }],
        }
      }

      case "run_requests_batch": {
        const reqIds = args.request_ids as string[] ?? []
        const { timeoutMs, envName } = resolveRunOptions(args)
        if (reqIds.length === 0) {
          return { content: [{ type: "text", text: "request_ids cannot be empty" }], isError: true }
        }
        if (reqIds.length > maxBatchSize) {
          return {
            content: [{ type: "text", text: `Batch size exceeds maximum of ${maxBatchSize}` }],
            isError: true,
          }
        }
        const batchResults: Array<{ request_id: string } & Partial<RunResult>> = []
        await runWithLimit(reqIds, maxConcurrency, async (rid) => {
          const found = store.findRequestById(rid)
          if (!found) {
            batchResults.push({ request_id: rid, error: "Request not found" })
            return
          }
          const result = await executeRequest(found.request, { timeoutMs, envName, allowLocalHosts, maxResponseSize }, bundle?.environments)
          batchResults.push({ request_id: rid, ...result })
        })
        return {
          content: [{ type: "text", text: JSON.stringify({ total: batchResults.length, results: batchResults }, null, 2) }],
        }
      }

      // ----- Environment Management -----

      case "list_environments": {
        const envs = store.getEnvironments().map((e) => ({
          id: e.id,
          name: e.name,
          color: e.color ?? null,
          variable_count: e.variables?.length ?? 0,
        }))
        return { content: [{ type: "text", text: JSON.stringify(envs, null, 2) }] }
      }

      case "get_environment_variables": {
        const envName = String(args.env_name ?? "")
        if (!envName) {
          return { content: [{ type: "text", text: "Missing required field: env_name" }], isError: true }
        }
        const env = store.getEnvironment(envName)
        if (!env) {
          return { content: [{ type: "text", text: `Environment not found: ${envName}` }], isError: true }
        }
        const resolved = store.getResolvedVariables(envName)
        return {
          content: [{ type: "text", text: JSON.stringify({
            id: env.id,
            name: env.name,
            variables: env.variables ?? [],
            resolved,
          }, null, 2) }],
        }
      }

      case "create_environment": {
        const envName = String(args.name ?? "")
        if (!envName) {
          return { content: [{ type: "text", text: "Missing required field: name" }], isError: true }
        }
        const color = args.color ? String(args.color) : undefined
        const env = store.addEnvironment(envName, color)
        return {
          content: [{ type: "text", text: JSON.stringify({ created: true, env_id: env.id, name: env.name }, null, 2) }],
        }
      }

      case "update_environment": {
        const envId = String(args.env_id ?? "")
        if (!envId) {
          return { content: [{ type: "text", text: "Missing required field: env_id" }], isError: true }
        }
        try {
          const envUpdates: Record<string, unknown> = {}
          if (args.name !== undefined) envUpdates.name = String(args.name)
          if (args.color !== undefined) envUpdates.color = String(args.color)
          if (args.variables !== undefined) envUpdates.variables = args.variables
          const updated = store.updateEnvironment(envId, envUpdates)
          return {
            content: [{ type: "text", text: JSON.stringify({ updated: true, env_id: updated.id, name: updated.name }, null, 2) }],
          }
        } catch (e) {
          return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true }
        }
      }

      case "delete_environment": {
        const delEnvId = String(args.env_id ?? "")
        if (!delEnvId) {
          return { content: [{ type: "text", text: "Missing required field: env_id" }], isError: true }
        }
        try {
          store.deleteEnvironment(delEnvId)
          return { content: [{ type: "text", text: JSON.stringify({ deleted: true, env_id: delEnvId }) }] }
        } catch (e) {
          return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true }
        }
      }

      // ----- Import/Export -----

      case "export_bundle": {
        const bundleData = store.serializeBundle()
        return { content: [{ type: "text", text: JSON.stringify(bundleData, null, 2) }] }
      }

      case "import_bundle": {
        const bundleJson = String(args.bundle_json ?? "")
        if (!bundleJson) {
          return { content: [{ type: "text", text: "Missing required field: bundle_json" }], isError: true }
        }
        try {
          const parsed = JSON.parse(bundleJson) as ExportBundle
          if (!parsed.collections || !Array.isArray(parsed.collections)) {
            return { content: [{ type: "text", text: "Invalid bundle format: missing collections array" }], isError: true }
          }

          // Import environments first so they are available for execution
          if (parsed.environments && Array.isArray(parsed.environments)) {
            for (const env of parsed.environments) {
              if (!env.name) continue
              store.addEnvironment(env.name, env.color)
              const existing = store.getEnvironment(env.name)
              if (existing && env.variables) {
                store.updateEnvironment(existing.id!, { variables: env.variables })
              }
            }
          }

          for (const col of parsed.collections) {
            const imported = store.addCollection(col.name, col.description, col.color, col.icon)
            for (const req of (col.requests ?? [])) {
              store.addRequest(imported.id, {
                ...req,
                id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              })
            }
          }

          // Mutate the outer bundle reference so subsequent executions use imported environments
          if (bundle) {
            bundle.collections = store.getCollections()
            bundle.environments = store.getEnvironments()
          }

          return {
            content: [{ type: "text", text: JSON.stringify({
              imported: true,
              collections: parsed.collections.length,
              environments: parsed.environments?.length ?? 0,
            }, null, 2) }],
          }
        } catch (e) {
          return { content: [{ type: "text", text: `Failed to parse bundle JSON: ${e instanceof Error ? e.message : String(e)}` }], isError: true }
        }
      }

      case "import_from_openapi": {
        const spec = String(args.spec ?? "")
        if (!spec) {
          return { content: [{ type: "text", text: "Missing required field: spec" }], isError: true }
        }
        const result = importFromOpenApi(spec)
        if (!result.success) {
          return { content: [{ type: "text", text: result.error }], isError: true }
        }
        const createdCollections: Array<{ id: string; name: string; request_count: number }> = []
        for (const col of result.collections) {
          const imported = store.addCollection(col.name, col.description)
          for (const req of col.requests) {
            store.addRequest(imported.id, {
              id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              name: req.name,
              method: req.method as RequestItem["method"],
              url: req.url,
              endpoint: req.endpoint,
              headers: req.headers,
              body: req.body,
              bodyType: req.bodyType,
              authType: req.authType,
              authToken: req.authToken,
              queryParams: req.queryParams,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            })
          }
          createdCollections.push({ id: imported.id, name: imported.name, request_count: col.requests.length })
        }
        return {
          content: [{ type: "text", text: JSON.stringify({
            imported: true,
            title: result.title,
            version: result.version,
            base_url: result.baseUrl,
            collections: createdCollections,
          }, null, 2) }],
        }
      }

      case "export_to_openapi": {
        const collections = store.getCollections()
        const spec = exportToOpenApi(collections)
        return { content: [{ type: "text", text: spec }] }
      }

      // ----- Folder Management -----

      case "create_folder": {
        const folderColId = String(args.collection_id ?? "")
        const folderName = String(args.name ?? "")
        if (!folderColId || !folderName) {
          return { content: [{ type: "text", text: "Missing required fields: collection_id, name" }], isError: true }
        }
        const parentId = args.parent_id ? String(args.parent_id) : undefined
        try {
          const folder = store.addFolder(folderColId, folderName, parentId)
          return {
            content: [{ type: "text", text: JSON.stringify({ created: true, folder_id: folder.id, name: folder.name }, null, 2) }],
          }
        } catch (e) {
          return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true }
        }
      }

      case "update_folder": {
        const updFolderId = String(args.folder_id ?? "")
        if (!updFolderId) {
          return { content: [{ type: "text", text: "Missing required field: folder_id" }], isError: true }
        }
        try {
          const folderUpdates: Record<string, unknown> = {}
          if (args.name !== undefined) folderUpdates.name = String(args.name)
          if (args.parent_id !== undefined) folderUpdates.parentId = args.parent_id === null ? null : String(args.parent_id)
          const updated = store.updateFolder(updFolderId, folderUpdates)
          return {
            content: [{ type: "text", text: JSON.stringify({ updated: true, folder_id: updated.id, name: updated.name }, null, 2) }],
          }
        } catch (e) {
          return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true }
        }
      }

      case "delete_folder": {
        const delFolderId = String(args.folder_id ?? "")
        if (!delFolderId) {
          return { content: [{ type: "text", text: "Missing required field: folder_id" }], isError: true }
        }
        try {
          store.deleteFolder(delFolderId)
          return { content: [{ type: "text", text: JSON.stringify({ deleted: true, folder_id: delFolderId }) }] }
        } catch (e) {
          return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true }
        }
      }

      case "move_request": {
        const moveReqId = String(args.request_id ?? "")
        const moveTargetColId = String(args.target_collection_id ?? "")
        if (!moveReqId || !moveTargetColId) {
          return { content: [{ type: "text", text: "Missing required fields: request_id, target_collection_id" }], isError: true }
        }
        const moveTargetFolderId = args.target_folder_id !== undefined
          ? (args.target_folder_id === null ? null : String(args.target_folder_id))
          : undefined
        try {
          store.moveRequest(moveReqId, moveTargetColId, moveTargetFolderId)
          return { content: [{ type: "text", text: JSON.stringify({ moved: true, request_id: moveReqId, target_collection_id: moveTargetColId }) }] }
        } catch (e) {
          return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true }
        }
      }

      // ----- Advanced -----

      case "generate_request_from_description": {
        const aiDescription = String(args.description ?? "")
        if (!aiDescription) {
          return { content: [{ type: "text", text: "Missing required field: description" }], isError: true }
        }
        const generated = generateRequestFromDescription(aiDescription)
        const aiCollectionId = args.collection_id ? String(args.collection_id) : undefined
        if (aiCollectionId) {
          const now = Date.now()
          const aiRequest: RequestItem = {
            id: `req-${now}-${Math.random().toString(36).slice(2, 8)}`,
            name: args.name ? String(args.name) : generated.name,
            method: generated.method as RequestItem["method"],
            url: generated.url,
            endpoint: generated.endpoint ?? generated.url,
            headers: generated.headers,
            body: generated.body,
            bodyType: generated.body ? "raw" : undefined,
            createdAt: now,
            updatedAt: now,
          }
          try {
            store.addRequest(aiCollectionId, aiRequest)
          } catch (e) {
            return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true }
          }
          return {
            content: [{ type: "text", text: JSON.stringify({ saved: true, request_id: aiRequest.id, request: generated }, null, 2) }],
          }
        }
        return {
          content: [{ type: "text", text: JSON.stringify({ request: generated }, null, 2) }],
        }
      }

      case "validate_request": {
        if (args.request_id) {
          const validateReqId = String(args.request_id)
          const found = store.findRequestById(validateReqId)
          if (!found) {
            return { content: [{ type: "text", text: `Request not found: ${validateReqId}` }], isError: true }
          }
          const issues = validateRequest(found.request)
          return { content: [{ type: "text", text: JSON.stringify({ request_id: validateReqId, valid: issues.length === 0, issues }, null, 2) }] }
        }
        const adHoc: Partial<RequestItem> = {}
        if (args.name !== undefined) adHoc.name = String(args.name)
        if (args.method !== undefined) adHoc.method = String(args.method) as RequestItem["method"]
        if (args.url !== undefined) adHoc.url = String(args.url)
        if (args.body !== undefined) adHoc.body = String(args.body)
        if (args.body_type !== undefined) adHoc.bodyType = String(args.body_type) as RequestItem["bodyType"]
        if (args.auth_type !== undefined) adHoc.authType = String(args.auth_type) as RequestItem["authType"]
        if (args.auth_token !== undefined) adHoc.authToken = String(args.auth_token)
        const issues = validateRequest(adHoc)
        return { content: [{ type: "text", text: JSON.stringify({ valid: issues.length === 0, issues }, null, 2) }] }
      }

      case "analyze_project_routes": {
        const folderPath = String(args.folder_path ?? "")
        if (!folderPath) {
          return { content: [{ type: "text", text: "Missing required field: folder_path" }], isError: true }
        }
        let analysisResult
        try {
          analysisResult = await analyzeProjectRoutes(folderPath)
        } catch (e) {
          return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true }
        }
        const saveCollectionId = args.save_collection_id ? String(args.save_collection_id) : undefined
        if (saveCollectionId) {
          for (const req of analysisResult.generatedRequests) {
            store.addRequest(saveCollectionId, {
              id: `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              name: req.name ?? "Untitled",
              method: (req.method as RequestItem["method"]) ?? "GET",
              url: req.url ?? "",
              endpoint: req.endpoint ?? req.url ?? "",
              headers: req.headers,
              body: req.body,
              authType: req.authType as RequestItem["authType"],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            })
          }
        }
        return {
          content: [{ type: "text", text: JSON.stringify({
            folder_path: analysisResult.folderPath,
            route_count: analysisResult.routeCount,
            saved_count: saveCollectionId ? analysisResult.generatedRequests.length : 0,
            routes: analysisResult.routes,
          }, null, 2) }],
        }
      }

      case "graphql_execute": {
        const gqlUrl = String(args.url ?? "")
        const gqlQuery = String(args.query ?? "")
        if (!gqlUrl || !gqlQuery) {
          return { content: [{ type: "text", text: "Missing required fields: url, query" }], isError: true }
        }
        const gqlTimeout = typeof args.timeout_ms === "number" && args.timeout_ms > 0 ? args.timeout_ms : defaultTimeoutMs
        const gqlVariables = typeof args.variables === "object" && args.variables !== null ? args.variables as Record<string, unknown> : undefined
        const gqlOperationName = args.operation_name ? String(args.operation_name) : undefined
        const gqlHeaders = typeof args.headers === "object" && args.headers !== null ? args.headers as Record<string, string> : undefined
        const result = await executeGraphQL(
          gqlUrl,
          gqlQuery,
          gqlVariables,
          gqlOperationName,
          gqlHeaders,
          { timeoutMs: gqlTimeout, allowLocalHosts, maxResponseSize },
        )
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
      }

      case "duplicate_environment": {
        const dupEnvId = String(args.env_id ?? "")
        if (!dupEnvId) {
          return { content: [{ type: "text", text: "Missing required field: env_id" }], isError: true }
        }
        try {
          const cloned = store.duplicateEnvironment(dupEnvId)
          return {
            content: [{ type: "text", text: JSON.stringify({ duplicated: true, env_id: cloned.id, name: cloned.name, variable_count: cloned.variables?.length ?? 0 }, null, 2) }],
          }
        } catch (e) {
          return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true }
        }
      }

      case "reorder_requests": {
        const reorderColId = String(args.collection_id ?? "")
        const orderedIds = args.ordered_request_ids as string[] ?? []
        if (!reorderColId || !Array.isArray(orderedIds) || orderedIds.length === 0) {
          return { content: [{ type: "text", text: "Missing required fields: collection_id, ordered_request_ids" }], isError: true }
        }
        try {
          store.reorderRequests(reorderColId, orderedIds)
          return { content: [{ type: "text", text: JSON.stringify({ reordered: true, collection_id: reorderColId }) }] }
        } catch (e) {
          return { content: [{ type: "text", text: e instanceof Error ? e.message : String(e) }], isError: true }
        }
      }

      case "run_collection_with_assertions": {
        const assertColId = String(args.collection_id ?? "")
        const { timeoutMs: assertTimeoutMs, envName: assertEnvName } = resolveRunOptions(args)
        const assertCollection = store.getCollection(assertColId)
        if (!assertCollection) {
          return { content: [{ type: "text", text: `Collection not found: ${assertColId}` }], isError: true }
        }
        const assertStartedAt = Date.now()
        const assertResults: RunResultWithAssertions[] = []
        for (const req of assertCollection.requests) {
          const result = await executeRequestWithAssertions(req, { timeoutMs: assertTimeoutMs, envName: assertEnvName, allowLocalHosts, maxResponseSize }, bundle?.environments)
          assertResults.push(result)
        }
        const assertCompletedAt = Date.now()

        const assertRecord: CollectionRunRecord = {
          id: `run-${assertStartedAt}-${Math.random().toString(36).slice(2, 8)}`,
          collectionId: assertCollection.id,
          collectionName: assertCollection.name,
          startedAt: assertStartedAt,
          completedAt: assertCompletedAt,
          totalDurationMs: assertCompletedAt - assertStartedAt,
          results: assertResults.map((r) => ({
            id: `run-${assertStartedAt}-${Math.random().toString(36).slice(2, 8)}`,
            requestId: assertCollection.requests.find((req) => req.name === r.name)?.id ?? "unknown",
            requestName: r.name,
            collectionId: assertCollection.id,
            collectionName: assertCollection.name,
            method: r.method,
            url: r.url,
            status: r.status,
            statusText: r.statusText,
            durationMs: r.durationMs,
            size: r.size,
            passed: r.passed,
            assertionResults: r.assertionResults,
            error: r.error,
            body: r.body,
            executedAt: assertStartedAt,
          })),
          summary: {
            total: assertResults.length,
            passed: assertResults.filter((r) => r.passed).length,
            failed: assertResults.filter((r) => !r.passed && !r.error).length,
            errored: assertResults.filter((r) => r.error).length,
          },
        }
        store.addRunRecord(assertRecord)

        const report = {
          collection_id: assertCollection.id,
          collection_name: assertCollection.name,
          started_at: assertStartedAt,
          completed_at: assertCompletedAt,
          total_duration_ms: assertCompletedAt - assertStartedAt,
          summary: assertRecord.summary,
          results: assertResults.map((r) => ({
            request_id: assertCollection.requests.find((req) => req.name === r.name)?.id ?? "unknown",
            name: r.name,
            method: r.method,
            url: r.url,
            status: r.status,
            duration_ms: r.durationMs,
            passed: r.passed,
            assertions_passed: r.assertionsPassed ?? null,
            assertion_results: r.assertionResults ?? null,
            error: r.error ?? null,
          })),
        }
        return {
          content: [{ type: "text", text: JSON.stringify(report, null, 2) }],
        }
      }

      case "get_request_history": {
        const histReqId = String(args.request_id ?? "")
        if (!histReqId) {
          return { content: [{ type: "text", text: "Missing required field: request_id" }], isError: true }
        }
        const found = store.findRequestById(histReqId)
        if (!found) {
          return { content: [{ type: "text", text: `Request not found: ${histReqId}` }], isError: true }
        }
        const limit = typeof args.limit === "number" && args.limit > 0 ? args.limit : 20
        const history = store.getRequestHistory(histReqId).slice(0, limit)
        return {
          content: [{ type: "text", text: JSON.stringify({
            request_id: histReqId,
            name: found.request.name,
            total: history.length,
            runs: history,
          }, null, 2) }],
        }
      }

      case "get_run_history": {
        const histColId = args.collection_id ? String(args.collection_id) : undefined
        const runLimit = typeof args.limit === "number" && args.limit > 0 ? args.limit : 20
        const runs = store.getRunHistory(histColId).slice(0, runLimit)
        return {
          content: [{ type: "text", text: JSON.stringify({ total: runs.length, runs }, null, 2) }],
        }
      }

      case "export_collection_to_junit": {
        const junitColId = String(args.collection_id ?? "")
        if (!junitColId) {
          return { content: [{ type: "text", text: "Missing required field: collection_id" }], isError: true }
        }
        const run = store.getRunHistory(junitColId)[0]
        if (!run) {
          return { content: [{ type: "text", text: `No run record found for collection: ${junitColId}` }], isError: true }
        }
        const xml = collectionRunRecordToJUnitXml(run)
        return {
          content: [{ type: "text", text: xml }],
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
