import { NextRequest, NextResponse } from "next/server"
import { formatZodError, postmanExportBodySchema } from "@/lib/import-schemas"

const POSTMAN_API_BASE = "https://api.getpostman.com"

function buildPostmanRequest(request: any) {
  const headers = Object.entries(request.headers || {}).map(([key, value]) => ({ key, value }))
  const body = request.body ? {
    mode: "raw",
    raw: request.body,
  } : undefined

  return {
    name: request.name || `${request.method} ${request.url}`,
    request: {
      method: request.method || "GET",
      header: headers,
      url: {
        raw: request.url || "/",
      },
      ...(body ? { body } : {}),
    },
  }
}

export async function POST(request: NextRequest) {
  const apiKey = request.cookies.get("postman_api_key")?.value

  if (!apiKey) {
    return NextResponse.json({ message: "Postman non connecté" }, { status: 401 })
  }

  try {
    const parsed = postmanExportBodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ message: formatZodError(parsed.error) }, { status: 400 })
    }
    const body = parsed.data
    const collectionName = body.name || "Reqly Export"
    const description = body.description || "Export depuis Reqly"
    const requests = body.requests

    const postmanCollection = {
      collection: {
        info: {
          name: collectionName,
          description,
          schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        item: requests.map((requestItem: any) => buildPostmanRequest(requestItem)),
      },
    }

    const response = await fetch(`${POSTMAN_API_BASE}/collections`, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(postmanCollection),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return NextResponse.json({ message: error.message || "Erreur lors de l'export vers Postman" }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json({ message: "Collection créée dans Postman", data })
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "Erreur serveur" }, { status: 500 })
  }
}
