import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { postmanFetch, postmanFetchJson, PostmanApiError } from "@/lib/postman-api"

const bodySchema = z.object({
  collectionId: z.string().min(1, "collectionId requis"),
})

const httpMethodSchema = z.enum([
  "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "GRAPHQL",
])

function headerArrayToObject(headers: unknown): Record<string, string> {
  if (!Array.isArray(headers)) return {}
  const out: Record<string, string> = {}
  for (const h of headers) {
    if (h && typeof h === "object" && "key" in h && "value" in h) {
      out[String((h as { key: unknown }).key)] = String((h as { value: unknown }).value)
    }
  }
  return out
}

function parseQueryParams(url: unknown): Array<{ key: string; value: string }> {
  if (!url || typeof url !== "object") return []
  const u = url as { query?: unknown[] }
  if (!Array.isArray(u.query)) return []
  return u.query
    .map((q) => {
      if (!q || typeof q !== "object") return null
      const item = q as { key?: unknown; value?: unknown; disabled?: boolean }
      if (item.disabled) return null
      return {
        key: String(item.key ?? ""),
        value: String(item.value ?? ""),
      }
    })
    .filter((q): q is { key: string; value: string } => q !== null && q.key !== "")
}

function parseUrl(urlField: unknown): { raw: string; query: Array<{ key: string; value: string }> } {
  if (typeof urlField === "string") return { raw: urlField, query: [] }
  if (urlField && typeof urlField === "object") {
    const u = urlField as { raw?: unknown; query?: unknown[] }
    return {
      raw: typeof u.raw === "string" ? u.raw : "",
      query: parseQueryParams(u),
    }
  }
  return { raw: "", query: [] }
}

function extractRequestBody(req: unknown): { body: string; bodyType: "none" | "json" | "text" | "form" } {
  if (!req || typeof req !== "object") return { body: "", bodyType: "none" }
  const r = req as { body?: unknown }
  if (!r.body) return { body: "", bodyType: "none" }

  if (typeof r.body === "string") {
    return { body: r.body, bodyType: "text" }
  }

  if (r.body && typeof r.body === "object") {
    const b = r.body as { mode?: unknown; raw?: unknown }
    if (b.mode === "raw" && typeof b.raw === "string") {
      // Heuristic: if it parses as JSON, mark as json
      try {
        JSON.parse(b.raw)
        return { body: b.raw, bodyType: "json" }
      } catch {
        return { body: b.raw, bodyType: "text" }
      }
    }
  }
  return { body: "", bodyType: "none" }
}

interface ExtractedRequest {
  id: string
  name: string
  method: string
  url: string
  endpoint: string
  headers: Record<string, string>
  body: string
  bodyType: "none" | "json" | "text" | "form"
  queryParams: Array<{ key: string; value: string }>
  folderId: string | null
  createdAt: string
  updatedAt: string
}

function randomId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function extractRequests(items: unknown[], folderId: string | null = null): ExtractedRequest[] {
  if (!Array.isArray(items)) return []
  const out: ExtractedRequest[] = []
  for (const item of items) {
    if (!item || typeof item !== "object") continue
    const it = item as { name?: unknown; item?: unknown[]; request?: unknown }
    if (it.item) {
      const folder = randomId("folder")
      out.push(...extractRequests(it.item, folder))
      continue
    }
    if (!it.request) continue
    const req = it.request as { method?: unknown; url?: unknown; header?: unknown[]; body?: unknown }
    const methodParsed = httpMethodSchema.safeParse(String(req.method ?? "GET").toUpperCase())
    const method = methodParsed.success ? methodParsed.data : "GET"
    const urlParsed = parseUrl(req.url)
    const headers = headerArrayToObject(req.header)
    const bodyParsed = extractRequestBody(req.body)
    const name = typeof it.name === "string" ? it.name : `${method} ${urlParsed.raw || "/"}`
    out.push({
      id: randomId("req"),
      name,
      method,
      url: urlParsed.raw || "/",
      endpoint: urlParsed.raw || "/",
      headers,
      body: bodyParsed.body,
      bodyType: bodyParsed.bodyType,
      queryParams: urlParsed.query,
      folderId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
  }
  return out
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ message: "Body JSON invalide" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    return NextResponse.json({ message: msg || "collectionId requis" }, { status: 400 })
  }

  const apiKey = request.cookies.get("postman_api_key")?.value
  if (!apiKey) {
    return NextResponse.json({ message: "Non connecté à Postman" }, { status: 401 })
  }

  try {
    const data = await postmanFetchJson<any>(apiKey, `/collections/${parsed.data.collectionId}`)
    const collection = data.collection
    const requests = extractRequests(collection?.item ?? [])
    const name = typeof collection?.info?.name === "string" ? collection.info.name : "Postman Collection"

    return NextResponse.json({
      collectionId: parsed.data.collectionId,
      name,
      requests,
    })
  } catch (error) {
    if (error instanceof PostmanApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status === 401 ? 401 : 400 })
    }
    return NextResponse.json(
      { message: "Erreur lors de la récupération de la collection" },
      { status: 500 }
    )
  }
}
