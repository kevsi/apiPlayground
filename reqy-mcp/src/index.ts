#!/usr/bin/env node

import { program } from "commander"
import fs from "node:fs"
import path from "node:path"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { CollectionStore } from "./store.js"
import { listTools, createToolHandler } from "./tools.js"
import type { ExportBundle } from "./types.js"

program
  .name("reqly-mcp")
  .description("MCP server for Reqly - expose collections to Claude/Cursor")
  .version("0.1.0")
  .option("--file <path>", "Path to exported Reqly JSON bundle")
  .option("--env <name>", "Default environment name for variable interpolation")
  .option("--timeout <ms>", "Default request timeout in milliseconds", "30000")

program.parse()

const opts = program.opts<{
  file?: string
  env?: string
  timeout: string
}>()

let bundle: ExportBundle | undefined
const store = new CollectionStore()

function loadBundle(): void {
  if (opts.file) {
    const resolvedPath = path.resolve(opts.file)
    if (!fs.existsSync(resolvedPath)) {
      console.error(`File not found: ${resolvedPath}`)
      process.exit(1)
    }
    try {
      const content = fs.readFileSync(resolvedPath, "utf8")
      const parsed = JSON.parse(content) as ExportBundle
      bundle = parsed
      store.loadFromBundle(parsed)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error(`Failed to read/parse file: ${message}`)
      process.exit(1)
    }
  } else {
    // Try reading from stdin if piped
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
            console.error(`Failed to parse stdin JSON: ${message}`)
            process.exit(1)
          }
        }
        startServer()
      })
      return
    }
  }
  startServer()
}

function startServer(): void {
  const server = new Server(
    {
      name: "reqly-mcp",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: listTools(),
    }
  })

  const handleToolCall = createToolHandler(store, bundle)

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const result = await handleToolCall(
      name,
      (args ?? {}) as Record<string, unknown>
    )
    return result
  })

  const transport = new StdioServerTransport()

  server.connect(transport).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err)
    console.error("MCP server error:", message)
    process.exit(1)
  })
}

loadBundle()
