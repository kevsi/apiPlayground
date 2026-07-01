export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server"

interface ExportRequest {
  name: string
  method: string
  url: string
  headers: Record<string, string>
  body: string
}

interface ExportBody {
  name?: string
  description?: string
  requests: ExportRequest[]
}

function buildPostmanItem(request: ExportRequest) {
  const headers = Object.entries(request.headers || {}).map(([key, value]) => ({
    key,
    value: String(value),
  }))

  const item: Record<string, unknown> = {
    name: request.name || `${request.method} ${request.url}`,
    request: {
      method: request.method || "GET",
      header: headers,
      url: {
        raw: request.url || "/",
      },
    },
  }

  if (request.body) {
    item.request = {
      ...(item.request as Record<string, unknown>),
      body: {
        mode: "raw",
        raw: request.body,
        options: {
          raw: {
            language: "json",
          },
        },
      },
    }
  }

  return item
}

export async function POST(request: NextRequest) {
  try {
    const body: ExportBody = await request.json()

    if (!body.requests || !Array.isArray(body.requests)) {
      return NextResponse.json(
        { error: "Missing or invalid requests array", code: "INVALID_INPUT" },
        { status: 400 },
      )
    }

    const collectionName = body.name || "Reqly Export"
    const description = body.description || "Export from Reqly"

    const postmanCollection = {
      info: {
        name: collectionName,
        description,
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      item: body.requests.map(buildPostmanItem),
    }

    return NextResponse.json({
      collection: postmanCollection,
      message: `Collection "${collectionName}" prepared with ${body.requests.length} request(s)`,
      exported: true,
      totalRequests: body.requests.length,
    })
  } catch {
    return NextResponse.json(
      { error: "Invalid request body", code: "PARSE_ERROR" },
      { status: 400 },
    )
  }
}
