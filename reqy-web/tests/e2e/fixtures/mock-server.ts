import * as http from "node:http"
import type { AddressInfo } from "node:net"

let server: http.Server | null = null
let baseUrl = ""

export async function startMockServer(): Promise<string> {
  if (server) return baseUrl
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost")

    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Api-Key")

    if (req.method === "OPTIONS") {
      res.writeHead(204)
      res.end()
      return
    }

    if (url.pathname === "/mock" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end(JSON.stringify({ ok: true, timestamp: Date.now() }))
      return
    }
    if (url.pathname === "/mock" && req.method === "POST") {
      let body = ""
      req.on("data", (chunk) => { body += chunk })
      req.on("end", () => {
        res.writeHead(201, { "Content-Type": "application/json" })
        res.end(JSON.stringify({ received: body }))
      })
      return
    }
    if (url.pathname === "/graphql" && req.method === "POST") {
      let body = ""
      req.on("data", (chunk) => { body += chunk })
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body)
          if (parsed.query?.includes("IntrospectionQuery")) {
            res.writeHead(200, { "Content-Type": "application/json" })
            res.end(JSON.stringify({
              data: {
                __schema: {
                  queryType: { name: "Query" },
                  mutationType: { name: "Mutation" },
                  types: [{ kind: "OBJECT", name: "Query", fields: [{ name: "hello", args: [], type: { kind: "SCALAR", name: "String" } }] }],
                },
              },
            }))
            return
          }
          if (parsed.query?.includes("hello")) {
            res.writeHead(200, { "Content-Type": "application/json" })
            res.end(JSON.stringify({ data: { hello: "world" } }))
            return
          }
          res.writeHead(200, { "Content-Type": "application/json" })
          res.end(JSON.stringify({ data: null, errors: [{ message: "Unknown query" }] }))
        } catch {
          res.writeHead(400)
          res.end("Invalid JSON")
        }
      })
      return
    }
    if (url.pathname === "/error") {
      res.writeHead(500, { "Content-Type": "text/plain" })
      res.end("Internal Server Error")
      return
    }
    res.writeHead(404)
    res.end("Not found")
  })

  await new Promise<void>((resolve) => {
    server!.listen(0, "127.0.0.1", () => resolve())
  })
  const addr = (server!.address() as AddressInfo)
  baseUrl = `http://127.0.0.1:${addr.port}`
  return baseUrl
}

export async function stopMockServer(): Promise<void> {
  if (!server) return
  await new Promise<void>((resolve) => server!.close(() => resolve()))
  server = null
  baseUrl = ""
}

export function getMockBaseUrl(): string {
  return baseUrl
}
