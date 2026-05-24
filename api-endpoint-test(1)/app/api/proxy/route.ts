import { NextResponse } from "next/server"

const ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"]

export async function POST(request: Request) {
  try {
    const payload = await request.json()
    const url = typeof payload.url === "string" ? payload.url.trim() : ""
    const method = typeof payload.method === "string" ? payload.method.toUpperCase() : ""
    const headers = payload.headers && typeof payload.headers === "object" ? payload.headers : {}
    const payloadBody = payload.body

    if (!url) {
      return NextResponse.json({ error: "Missing url" }, { status: 400 })
    }

    if (!ALLOWED_METHODS.includes(method)) {
      return NextResponse.json({ error: `Unsupported method: ${String(payload.method)}` }, { status: 400 })
    }

    try {
      new URL(url)
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 })
    }

    const response = await fetch(url, {
      method,
      headers: headers ?? {},
      body: method !== "GET" ? payloadBody : undefined,
    })

    const responseHeaders: Record<string, string> = {}
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value
    })

    const contentType = response.headers.get("content-type")?.split(";")[0].toLowerCase() || ""
    const isBinary = /^(image\/|video\/|audio\/|application\/pdf|application\/octet-stream)/.test(contentType)
    let body: string
    let encoding: string = "utf8"

    if (isBinary) {
      const arrayBuffer = await response.arrayBuffer()
      body = Buffer.from(arrayBuffer).toString("base64")
      encoding = "base64"
    } else {
      body = await response.text()
    }

    return NextResponse.json({
      status: response.status,
      body,
      headers: responseHeaders,
      encoding,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
