#!/usr/bin/env node

import { program } from "commander"
import crypto from "node:crypto"
import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { CollectionStore } from "./store.js"
import { listTools, createToolHandler } from "./tools.js"
import type { ExportBundle } from "./types.js"

program
  .name("reqly-mcp")
  .description("MCP server for Reqly - expose collections to AI agents")
  .version("0.1.0")
  .option("--file <path>", "Path to exported Reqly JSON bundle")
  .option("--port <number>", "Port for HTTP transport (default: stdio)")
  .option("--env <name>", "Default environment name for variable interpolation")
  .option("--timeout <ms>", "Default request timeout in milliseconds", "30000")
  .option("--allow-local-hosts", "Allow requests to private/local addresses (disabled by default)")
  .option("--max-response-size <bytes>", "Maximum response body size in bytes", "10485760")
  .option("--cors-origins <origins>", "Comma-separated allowed CORS origins for HTTP transport", "http://127.0.0.1,http://localhost")

program.parse()

const opts = program.opts<{
  file?: string
  port?: string
  env?: string
  timeout: string
  allowLocalHosts?: boolean
  maxResponseSize: string
  corsOrigins: string
}>()

const DEFAULT_TIMEOUT_MS = parseInt(opts.timeout, 10) || 30000
const MAX_RESPONSE_SIZE = parseInt(opts.maxResponseSize, 10) || 10 * 1024 * 1024
const ALLOW_LOCAL_HOSTS = opts.allowLocalHosts === true
const CORS_ORIGINS = opts.corsOrigins
  .split(",")
  .map((o) => o.trim().toLowerCase())
  .filter(Boolean)

let bundle: ExportBundle | undefined
let bundlePath: string | undefined
const store = new CollectionStore()

function logError(message: string): void {
  // Always write errors to stderr; stdout is reserved for MCP stdio messages
  process.stderr.write(`${message}\n`)
}

function persistBundle(): void {
  if (!bundlePath) return
  const data = store.serializeBundle()
  if (!data) return
  try {
    fs.writeFileSync(bundlePath, JSON.stringify(data, null, 2), "utf8")
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    logError(`Failed to persist bundle: ${message}`)
  }
}

async function shutdown(transport: StdioServerTransport | StreamableHTTPServerTransport, code = 0): Promise<never> {
  try {
    await transport.close()
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    logError(`Shutdown error: ${message}`)
  }
  process.exit(code)
}

function loadBundle(): void {
  if (opts.file) {
    const resolvedPath = path.resolve(opts.file)
    if (!fs.existsSync(resolvedPath)) {
      logError(`File not found: ${resolvedPath}`)
      process.exit(1)
    }
    try {
      const content = fs.readFileSync(resolvedPath, "utf8")
      const parsed = JSON.parse(content) as ExportBundle
      bundle = parsed
      bundlePath = resolvedPath
      store.loadFromBundle(parsed)
      store.setPersistCallback(persistBundle)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      logError(`Failed to read/parse file: ${message}`)
      process.exit(1)
    }
  } else {
    const stdin = process.stdin
    if (!stdin.isTTY) {
      let data = ""
      stdin.setEncoding("utf8")
      stdin.on("data", (chunk) => {
        data += chunk
      })
      stdin.on("end", () => {
        if (data.trim()) {
          try {
            const parsed = JSON.parse(data) as ExportBundle
            bundle = parsed
            store.loadFromBundle(parsed)
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e)
            logError(`Failed to parse stdin JSON: ${message}`)
            process.exit(1)
          }
        }
        startServer().catch((err: unknown) => {
          logError(err instanceof Error ? err.message : String(err))
          process.exit(1)
        })
      })
      return
    }
  }
  startServer().catch((err: unknown) => {
    logError(err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
}

function setupMCPServer(): Server {
  const server = new Server(
    {
      name: "reqly-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    },
  )

  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    const collections = store.getCollections()
    const resources: Array<{ uri: string; name: string; description?: string; mimeType: string }> = []

    for (const col of collections) {
      resources.push({
        uri: `reqly://collections/${col.id}`,
        name: `Collection: ${col.name}`,
        description: col.description || `Collection with ${col.requests.length} requests`,
        mimeType: "application/json",
      })
      for (const req of col.requests) {
        resources.push({
          uri: `reqly://requests/${req.id}`,
          name: `${req.method} ${req.name}`,
          description: `${req.method} ${req.url}`,
          mimeType: "application/json",
        })
      }
    }

    return { resources }
  })

  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const uri = request.params.uri

    if (uri.startsWith("reqly://collections/")) {
      const colId = uri.replace("reqly://collections/", "")
      const col = store.getCollection(colId)
      if (!col) {
        return {
          contents: [{ uri, mimeType: "text/plain", text: `Collection not found: ${colId}` }],
        }
      }
      return {
        contents: [{
          uri,
          mimeType: "application/json",
          text: JSON.stringify({
            id: col.id,
            name: col.name,
            description: col.description,
            color: col.color,
            icon: col.icon,
            request_count: col.requests.length,
            folder_count: col.folders?.length ?? 0,
          }, null, 2),
        }],
      }
    }

    if (uri.startsWith("reqly://requests/")) {
      const reqId = uri.replace("reqly://requests/", "")
      const found = store.findRequestById(reqId)
      if (!found) {
        return {
          contents: [{ uri, mimeType: "text/plain", text: `Request not found: ${reqId}` }],
        }
      }
      return {
        contents: [{
          uri,
          mimeType: "application/json",
          text: JSON.stringify({
            id: found.request.id,
            name: found.request.name,
            method: found.request.method,
            url: found.request.url,
            collection_id: found.collection.id,
            collection_name: found.collection.name,
          }, null, 2),
        }],
      }
    }

    return {
      contents: [{ uri, mimeType: "text/plain", text: `Unknown resource: ${uri}` }],
    }
  })

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: listTools(),
    }
  })

  const handleToolCall = createToolHandler(store, bundle, {
    defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
    defaultEnvName: opts.env,
    allowLocalHosts: ALLOW_LOCAL_HOSTS,
    maxResponseSize: MAX_RESPONSE_SIZE,
  })

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const result = await handleToolCall(
      name,
      (args ?? {}) as Record<string, unknown>,
    )
    return result
  })

  return server
}

function startStdioTransport(server: Server): void {
  const transport = new StdioServerTransport()
  server.connect(transport).catch((err: unknown) => {
    logError(`MCP server error: ${err instanceof Error ? err.message : String(err)}`)
    shutdown(transport, 1)
  })
}

async function startHTTPTransport(server: Server, port: number): Promise<void> {
  const mcpTransport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
  })

  await server.connect(mcpTransport)

  const httpServer = http.createServer(async (req, res) => {
    const origin = req.headers.origin?.toLowerCase() ?? ""
    if (origin && CORS_ORIGINS.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin)
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
    res.setHeader("Vary", "Origin")

    if (req.method === "OPTIONS") {
      res.writeHead(200)
      res.end()
      return
    }

    const pathname = req.url ? new URL(req.url, `http://${req.headers.host ?? "localhost"}`).pathname : ""
    if (pathname !== "/mcp") {
      if (!res.headersSent) {
        res.writeHead(404, { "Content-Type": "text/plain" })
        res.end("Not found")
      }
      return
    }

    try {
      await mcpTransport.handleRequest(req, res, undefined)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain" })
        res.end(`MCP error: ${message}`)
      }
    }
  })

  httpServer.listen(port, "127.0.0.1", () => {
    logError(`MCP server listening on http://127.0.0.1:${port}/mcp`)
  })
}

async function startServer(): Promise<void> {
  const server = setupMCPServer()
  const port = opts.port ? parseInt(opts.port, 10) : NaN

  if (!isNaN(port) && port > 0 && port < 65536) {
    await startHTTPTransport(server, port)
  } else {
    startStdioTransport(server)
  }
}

loadBundle()
